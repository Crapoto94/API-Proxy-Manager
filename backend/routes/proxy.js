const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const { fuzzyAccentLDAPValue, decodeEntryAttrs, decodeLDAPString } = require('./ldap_helpers');

/**
 * @openapi
 * tags:
 *   name: Proxy APIs (External)
 *   description: APIs sécurisées par Clé API pour applications externes (SMS, Mail, IA dont
 *     transcription audio locale Faster-Whisper via /ai/transcribe)
 */

module.exports = (app, db, authenticateAdmin) => {
    const proxyRouter = express.Router();
    const adminRouter = express.Router();

    // Upload en mémoire pour la transcription audio (Faster-Whisper) : le fichier est
    // relayé directement au service STT, jamais écrit sur disque. 100 Mo max (longs
    // enregistrements), champ multipart "file".
    const transcribeUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 100 * 1024 * 1024 }
    });

    const escapeLDAPSearchFilter = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/\\/g, '\\5c')
                  .replace(/\*/g, '\\2a')
                  .replace(/\(/g, '\\28')
                  .replace(/\)/g, '\\29')
                  .replace(/\0/g, '\\00');
    };

    function flattenLDAPEntry(entry) {
        if (!entry) return null;
        try {
            // Method 1: Standard ldapjs object (getter)
            let obj = entry.object;
            if (!(obj && Object.keys(obj).length > 0)) {
                // Method 2: Manual extraction from attributes (most robust fallback)
                const manualObj = { dn: entry.dn?.toString() || 'unknown' };
                const attributes = entry.attributes || [];
                attributes.forEach(attr => {
                    const type = attr.type || attr.description;
                    if (type) {
                        const vals = attr.values || attr._values || [];
                        manualObj[type] = vals.length === 1 ? vals[0] : vals;
                    }
                });
                obj = manualObj;
            }

            // Décode le DN s'il est échappé RFC4514 (accents, ex. "\c3\89" -> "É") — voir
            // directory.js / ldap_helpers.js pour le contexte complet (bind "Invalid Credentials").
            if (obj && typeof obj.dn === 'string' && obj.dn.includes('\\')) {
                obj = { ...obj, dn: decodeLDAPString(obj.dn) };
            }

            return obj;
        } catch (e) {
            console.error('[AD] Flatten error:', e.message);
            return { dn: entry.dn?.toString() || 'unknown', error: e.message };
        }
    }

    const maskSensitiveData = (data) => {
        if (!data) return data;
        try {
            let str = typeof data === 'string' ? data : JSON.stringify(data);
            // Replace common password fields and client secrets globally in JSON or Query strings
            // Covers "password": "...", "password": 1234, "passward": "...", etc.
            return str.replace(/"([^"]*(?:password|pass|secret|bind_password|client_secret|token|api_key)[^"]*)"\s*:\s*("[^"]*"|[^,} \]]+)/gi, (match, p1) => {
                return `"${p1}":"********"`;
            });
        } catch(e) {
            return "Unparseable Data";
        }
    };

    // Taille maximale d'un champ journalisé : évite que les réponses volumineuses
    // (ex. documents/photos Frizbi en base64) ne gonflent la table proxy_logs.
    const MAX_LOG_CHARS = 20000;
    const truncateForLog = (s) => (typeof s === 'string' && s.length > MAX_LOG_CHARS)
        ? `${s.slice(0, MAX_LOG_CHARS)}… [tronqué]`
        : s;

    // --- Middleware: Global Proxy Logger (External APIs only) ---
    const proxyLogger = async (req, res, next) => {
        const originalJson = res.json;

        res.json = function(data) {
            const status = res.statusCode;
            const appEntry = req.externalApp || null;
            
            const safeBody = truncateForLog(maskSensitiveData(req.body || {}));
            const safeResponse = truncateForLog(maskSensitiveData(data || {}));

            // Log for external proxy routes
            db.run(
                'INSERT INTO proxy_logs (app_id, endpoint, method, query_params, payload, status, response_payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    appEntry ? appEntry.id : null,
                    req.originalUrl || req.path,
                    req.method,
                    maskSensitiveData(req.query || {}),
                    safeBody,
                    status,
                    safeResponse
                ]
            ).catch(e => console.error('[PROXY LOG ERROR]:', e.message));

            return originalJson.apply(res, arguments);
        };
        next();
    };

    const verifyApiKey = async (req, res, next) => {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ error: 'X-API-KEY header missing' });
        }

        try {
            const appSettings = await db.get('SELECT * FROM security_settings WHERE id = 1');
            const trustProxiesEnabled = appSettings ? appSettings.trust_proxies_enabled === 1 : false;

            if (trustProxiesEnabled) {
                const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
                const normalizedIp = clientIp.includes('::ffff:') ? clientIp.split('::ffff:')[1] : clientIp;

                const isTrusted = await db.get('SELECT * FROM trusted_ips WHERE ip_address = ? OR ip_address = ?', [clientIp, normalizedIp]);
                
                if (!isTrusted) {
                    console.warn(`[SECURITY] Blocked proxy request from untrusted IP: ${normalizedIp}`);
                    return res.status(403).json({ error: 'IP Address not trusted' });
                }
            }

            const appEntry = await db.get('SELECT * FROM external_apps WHERE api_key = ? AND is_active = 1', [apiKey]);
            if (!appEntry) {
                return res.status(401).json({ error: 'Invalid or inactive API Key' });
            }

            // --- Granular Route Authorization ---
            const path = req.path;
            let requiredPermission = null;

            if (path.startsWith('/sms/')) requiredPermission = 'sms_send';
            else if (path.startsWith('/mail/')) requiredPermission = 'mail_send';
            else if (path.startsWith('/ad/search')) requiredPermission = 'ad_search';
            else if (path.startsWith('/ad/user')) requiredPermission = 'ad_read';
            else if (path.startsWith('/ad/authenticate')) requiredPermission = 'ad_auth';
            else if (path.startsWith('/azure/search')) requiredPermission = 'azure_search';
            else if (path.startsWith('/azure/user')) requiredPermission = 'azure_read';
            else if (path.startsWith('/oracle/query')) requiredPermission = 'oracle_query';
            else if (path.startsWith('/oracle/sync')) requiredPermission = 'oracle_sync';
            else if (path.startsWith('/o365/messages')) requiredPermission = req.method === 'GET' ? 'o365_read' : 'o365_manage';
            else if (path.startsWith('/o365/synced-messages')) requiredPermission = 'o365_read';
            else if (path.startsWith('/o365/harvest')) requiredPermission = 'o365_harvest';
            else if (path.startsWith('/glpi/')) requiredPermission = 'glpi_read';
            else if (path.startsWith('/ai/query')) requiredPermission = 'ai_query';
            else if (path.startsWith('/ai/transcribe')) requiredPermission = 'ai_transcribe';
            else if (path.startsWith('/ai/models')) requiredPermission = 'ai_read';

            const authorizedRoutes = JSON.parse(appEntry.authorized_routes || '["*"]');
            
            if (!authorizedRoutes.includes('*') && requiredPermission && !authorizedRoutes.includes(requiredPermission)) {
                console.warn(`[SECURITY] App "${appEntry.name}" blocked from accessing ${path} (Permission missing: ${requiredPermission})`);
                return res.status(403).json({ error: 'Insufficient permissions for this API route' });
            }

            req.externalApp = appEntry;
            next();
        } catch (error) {
            console.error('[AUTH ERROR]:', error.message);
            res.status(500).json({ error: 'Internal auth error' });
        }
    };

    proxyRouter.use(proxyLogger);

    // --- Helper: Frizbi Login ---
    async function getFrizbiToken() {
        const s = await db.get('SELECT * FROM frizbi_settings WHERE id = 1 AND is_enabled = 1');
        if (!s || !s.api_url || !s.client_id || !s.client_secret) {
            throw new Error('SMS service is not configured or disabled');
        }
        
        const response = await axios.post(`${s.api_url}/api/auth/login`, {
            login: s.client_id,
            password: s.client_secret
        });
        return { token: response.data.token, apiUrl: s.api_url, senderId: s.sender_id };
    }

    // Personnalisation de l'émetteur (TPOA) : activée par défaut ; seule une
    // valeur explicitement fausse (false, 0, "0", "false") la désactive.
    const frizbiTpoa = (v) => !(v === false || v === 0 || v === '0' || v === 'false');

    // Appel authentifié à l'API Frizbi. `auth` provient de getFrizbiToken().
    // Ne lève pas sur les statuts HTTP >= 300 : l'erreur porte frizbiStatus /
    // frizbiData pour une remontée fidèle au client.
    async function frizbiRequest(auth, method, pathSuffix, data) {
        const response = await axios({
            method,
            url: `${auth.apiUrl}${pathSuffix}`,
            data,
            headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
            validateStatus: () => true
        });
        if (response.status >= 300) {
            const d = response.data || {};
            const err = new Error(d.details || d.message || `Frizbi HTTP ${response.status}`);
            err.frizbiStatus = response.status;
            err.frizbiData = d;
            throw err;
        }
        return response.data;
    }

    function frizbiErrorResponse(res, error) {
        console.error('[PROXY SMS] Error:', error.frizbiData || error.message);
        const status = (error.frizbiStatus && error.frizbiStatus < 500) ? error.frizbiStatus : 502;
        return res.status(status).json({
            error: (error.frizbiData && (error.frizbiData.details || error.frizbiData.message)) || error.message,
            frizbi: error.frizbiData || null
        });
    }

    /**
     * @openapi
     * /api/v1/sms/send:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Envoie un SMS (ou un lot) via le proxy Frizbi
     *     description: >
     *       Relaie l'envoi vers l'API Frizbi. Deux formes possibles : le raccourci
     *       `mobile` (un destinataire) ou `contacts` (unitaire ou groupé, avec
     *       variables par contact). Reprend les capacités de Frizbi : envoi
     *       différé (`date`), collecte de photo (`sendDoc`), variables de contact,
     *       identifiants de suivi personnalisés. L'émetteur est personnalisé
     *       (TPOA) par défaut.
     *     security:
     *       - ApiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [message]
     *             properties:
     *               message:
     *                 type: string
     *                 description: "Contenu du SMS. Variables de contact possibles sous la forme $cle$."
     *                 example: "Votre code de validation est 123456"
     *               mobile:
     *                 type: string
     *                 description: "Raccourci pour un destinataire unique."
     *                 example: "0601020304"
     *               contacts:
     *                 type: array
     *                 description: "Liste de destinataires (à la place de `mobile`)."
     *                 items:
     *                   type: object
     *                   required: [mobile]
     *                   properties:
     *                     mobile: { type: string }
     *                     firstName: { type: string }
     *                     lastName: { type: string }
     *                     customerSmsContactId:
     *                       type: string
     *                       description: "Identifiant de suivi (sinon généré)."
     *                     variables:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           variableKey: { type: string }
     *                           variableValue: { type: string }
     *               title:
     *                 type: string
     *                 description: "Titre de la campagne Frizbi (défaut : nom de l'application)."
     *               customerSmsId:
     *                 type: string
     *                 description: "Identifiant unique d'envoi (défaut : ext_<app>_<timestamp>)."
     *               customerSenderId:
     *                 type: string
     *                 description: "Identifiant d'auteur Frizbi (défaut : sender ID configuré)."
     *               date:
     *                 type: string
     *                 format: date-time
     *                 description: "Date d'envoi différé. Vide ou passée = immédiat."
     *               sendDoc:
     *                 type: boolean
     *                 description: "Ajoute un lien de collecte de photo en fin de SMS."
     *               tpoa:
     *                 type: boolean
     *                 default: true
     *                 description: >-
     *                   Personnalisation de l'émetteur (paramètre TPOA de l'API
     *                   Frizbi). ACTIVÉE par défaut ; passer `false` pour utiliser
     *                   l'émetteur par défaut de la plateforme.
     *                 example: true
     *     responses:
     *       200: { description: SMS envoyé }
     *       400: { description: Requête invalide }
     *       401: { description: Clé API manquante ou invalide }
     *       403: { description: IP non autorisée ou permissions insuffisantes }
     *       502: { description: Erreur renvoyée par Frizbi }
     */
    proxyRouter.post('/sms/send', verifyApiKey, async (req, res) => {
        const b = req.body || {};
        const message = typeof b.message === 'string' ? b.message : '';
        if (!message.trim()) return res.status(400).json({ error: 'message is required' });

        // Contacts : soit `contacts[]` (unitaire ou lot), soit le raccourci `mobile`.
        let contacts = [];
        if (Array.isArray(b.contacts) && b.contacts.length) {
            contacts = b.contacts.map((c, i) => ({
                customerSmsContactId: c.customerSmsContactId || `c_${Date.now()}_${i}`,
                mobile: c.mobile,
                ...(c.firstName ? { firstName: c.firstName } : {}),
                ...(c.lastName ? { lastName: c.lastName } : {}),
                ...(Array.isArray(c.variables) && c.variables.length
                    ? { variables: c.variables.map(v => ({ variableKey: v.variableKey, variableValue: v.variableValue })) }
                    : {})
            }));
        } else if (b.mobile) {
            contacts = [{ customerSmsContactId: `c_${Date.now()}`, mobile: b.mobile }];
        }
        if (!contacts.length) return res.status(400).json({ error: 'mobile or contacts[] is required' });
        if (contacts.some(c => !c.mobile)) return res.status(400).json({ error: 'chaque contact doit avoir un mobile' });

        const tpoaEnabled = frizbiTpoa(b.tpoa);

        try {
            const auth = await getFrizbiToken();
            const customerSmsId = b.customerSmsId || `ext_${req.externalApp.id}_${Date.now()}`;
            const payload = {
                customerSmsId,
                title: b.title || req.externalApp.name,
                message,
                customerSenderId: b.customerSenderId || auth.senderId || 'APM',
                tpoa: tpoaEnabled,
                smsContacts: contacts
            };
            if (b.date) payload.date = b.date;
            if (b.sendDoc !== undefined) payload.sendDoc = !!b.sendDoc;

            const data = await frizbiRequest(auth, 'post', '/api/sms/send', payload);
            console.log(`[PROXY SMS] Sent for ${req.externalApp.name}: ${contacts.length} contact(s) (tpoa=${tpoaEnabled})`);
            res.json({ status: 'success', tpoa: tpoaEnabled, customerSmsId, data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/{customerSmsId}:
     *   delete:
     *     tags: [Proxy APIs (External)]
     *     summary: Supprime (annule) un envoi Frizbi programmé
     *     description: Seuls les envois différés de plus de deux minutes peuvent être supprimés (règle Frizbi).
     *     security: [{ ApiKeyAuth: [] }]
     *     parameters:
     *       - in: path
     *         name: customerSmsId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200: { description: Envoi supprimé }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.delete('/sms/:customerSmsId', verifyApiKey, async (req, res) => {
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'delete', `/api/sms/delete/${encodeURIComponent(req.params.customerSmsId)}`);
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/status/{customerSmsId}:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Statut et historique d'un envoi Frizbi
     *     security: [{ ApiKeyAuth: [] }]
     *     parameters:
     *       - in: path
     *         name: customerSmsId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200: { description: "Statut par contact (code, historique, réponses)" }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.get('/sms/status/:customerSmsId', verifyApiKey, async (req, res) => {
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'get', `/api/sms/status/${encodeURIComponent(req.params.customerSmsId)}`);
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/status:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Statuts de plusieurs SMS contacts (par customerSmsContactId)
     *     security: [{ ApiKeyAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [customerSmsContactIds]
     *             properties:
     *               customerSmsContactIds:
     *                 type: array
     *                 maxItems: 500
     *                 items: { type: string }
     *     responses:
     *       200: { description: Liste des statuts }
     *       400: { description: Requête invalide }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.post('/sms/status', verifyApiKey, async (req, res) => {
        const ids = Array.isArray(req.body) ? req.body
            : (req.body && Array.isArray(req.body.customerSmsContactIds) ? req.body.customerSmsContactIds : null);
        if (!ids || !ids.length) return res.status(400).json({ error: 'customerSmsContactIds[] is required' });
        if (ids.length > 500) return res.status(400).json({ error: '500 identifiants maximum par appel' });
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'post', '/api/sms/status/smsContactsIds', ids);
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/responses:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Dernières réponses SMS reçues (Frizbi)
     *     security: [{ ApiKeyAuth: [] }]
     *     responses:
     *       200: { description: Réponses reçues }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.get('/sms/responses', verifyApiKey, async (req, res) => {
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'get', '/api/sms/responses/last');
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/documents/last-ids:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Identifiants des derniers documents (photos) non consultés
     *     security: [{ ApiKeyAuth: [] }]
     *     responses:
     *       200: { description: Liste d'identifiants de documents }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.get('/sms/documents/last-ids', verifyApiKey, async (req, res) => {
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'get', '/api/sms/document/last-documentIds');
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/documents/last:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Derniers documents (photos) non consultés, en base64
     *     security: [{ ApiKeyAuth: [] }]
     *     responses:
     *       200: { description: "Documents (image en base64)" }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.get('/sms/documents/last', verifyApiKey, async (req, res) => {
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'get', '/api/sms/document/last-documents');
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });

    /**
     * @openapi
     * /api/v1/sms/documents/{id}:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Télécharge un document (photo) Frizbi par identifiant
     *     security: [{ ApiKeyAuth: [] }]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200: { description: "Document (image en base64)" }
     *       401: { description: Clé API manquante ou invalide }
     *       502: { description: Erreur Frizbi }
     */
    proxyRouter.get('/sms/documents/:id', verifyApiKey, async (req, res) => {
        try {
            const auth = await getFrizbiToken();
            const data = await frizbiRequest(auth, 'get', `/api/sms/document/get-doc/${encodeURIComponent(req.params.id)}`);
            res.json({ status: 'success', data });
        } catch (error) {
            frizbiErrorResponse(res, error);
        }
    });


    /**
     * @openapi
     * /api/v1/mail/send:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Envoie un email via l'un des fournisseurs configurés (SMTP ou Brevo)
     *     security:
     *       - ApiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [to, subject, content]
     *             properties:
     *               to:
     *                 type: string
     *                 description: "Destinataire(s) : une adresse, ou plusieurs séparées par une virgule ou un point-virgule"
     *                 example: "destinataire@example.com"
     *               cc:
     *                 type: string
     *                 description: "Copie (Cc), visible des destinataires. Une ou plusieurs adresses séparées par une virgule ou un point-virgule (un tableau de chaînes est aussi accepté). Les adresses déjà présentes dans « to » sont ignorées."
     *                 example: "directeur@example.com, responsable@example.com"
     *               bcc:
     *                 type: string
     *                 description: "Copie cachée (Cci), invisible des autres destinataires. Même format que « cc »."
     *                 example: "archive@example.com"
     *               subject:
     *                 type: string
     *                 example: "Sujet du mail"
     *               content:
     *                 type: string
     *                 example: "Contenu du message (HTML supporté)"
     *               from_name:
     *                 type: string
     *                 description: "Nom de l'expéditeur (optionnel)"
     *               from_email:
     *                 type: string
     *                 description: "Email de l'expéditeur (optionnel)"
     *               is_raw:
     *                 type: boolean
     *                 description: "Si true, n'utilise pas le template HTML global"
     *                 default: false
     *               footer1:
     *                 type: string
     *               footer2:
     *                 type: string
     *               footer3:
     *                 type: string
     *               footerColor:
     *                 type: string
     *               attachments:
     *                 type: array
     *                 description: "Pièces jointes (optionnel)"
     *                 items:
     *                   type: object
     *                   properties:
     *                     filename:
     *                       type: string
     *                       example: "document.pdf"
     *                     content:
     *                       type: string
     *                       description: "Contenu du fichier en Base64"
     *     responses:
     *       200:
     *         description: Email envoyé avec succès
     *       401:
     *         description: Clé API manquante ou invalide
     *       500:
     *         description: Erreur interne lors de l'envoi
     */
    proxyRouter.post('/mail/send', verifyApiKey, async (req, res) => {
        const { to, cc, bcc, subject, content, from_name, from_email, is_raw, attachments, footer1, footer2, footer3, footerColor } = req.body;
        if (!to || !subject || !content) {
            return res.status(400).json({ error: 'to, subject and content are required' });
        }

        try {
            if (app.locals.sendMail) {
                await app.locals.sendMail(to, subject, content, {
                    fromName: from_name,
                    fromEmail: from_email,
                    is_raw: is_raw,
                    attachments: attachments,
                    cc, bcc,
                    footer1, footer2, footer3, footerColor
                });
                console.log(`[PROXY MAIL] Sent for ${req.externalApp.name}: ${to}${cc ? ` (cc: ${Array.isArray(cc) ? cc.join(', ') : cc})` : ''}${bcc ? ' (+bcc)' : ''} (Attachments: ${attachments?.length || 0})`);
                res.json({ status: 'success' });
            } else {
                throw new Error('Mail provider not available');
            }
        } catch (error) {
            console.error('[PROXY MAIL] Error:', error.message);
            res.status(error.status || 500).json({ error: error.message });
        }
    });

    // --- Office 365: Boîte Mail ---
    // Réglages Graph (tenant, client, secret, boîte par défaut) : table o365_settings. `?mailbox=` permet de viser
    // une autre boîte que celle configurée (ex. plusieurs boîtes de collecte).
    async function o365Context(req) {
        const o365 = await db.get('SELECT * FROM o365_settings WHERE id = 1 AND is_enabled = 1');
        if (!o365) { const e = new Error('O365 service disabled'); e.status = 503; throw e; }
        const mailbox = String((req.query && req.query.mailbox) || (req.body && req.body.mailbox) || o365.mailbox || '').trim();
        if (!mailbox) { const e = new Error('Aucune boîte configurée'); e.status = 503; throw e; }
        const tokenRes = await axios.post(`https://login.microsoftonline.com/${o365.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
            client_id: o365.client_id, grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default', client_secret: o365.client_secret
        }));
        return { mailbox, token: tokenRes.data.access_token };
    }
    const o365Error = (res, error) => {
        const s = error.response?.status || error.status || 500;
        const msg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
        res.status(s >= 400 && s < 500 ? s : 502).json({ error: msg });
    };

    /**
     * @openapi
     * /api/v1/o365/messages:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Liste les messages d'une boîte Office 365
     *     security: [ { ApiKeyAuth: [] } ]
     *     parameters:
     *       - { in: query, name: mailbox, schema: { type: string }, description: Boîte à lire (défaut : celle configurée) }
     *       - { in: query, name: unread, schema: { type: string, enum: ['1'] }, description: Ne garder que les non lus }
     *       - { in: query, name: attachments, schema: { type: string, enum: ['1'] }, description: Ne garder que les messages avec pièces jointes }
     *       - { in: query, name: top, schema: { type: integer } }
     *     responses:
     *       200: { description: Liste des messages }
     */
    proxyRouter.get('/o365/messages', verifyApiKey, async (req, res) => {
        try {
            const { mailbox, token } = await o365Context(req);
            const top = Math.min(Math.max(parseInt(req.query.top, 10) || 50, 1), 200);
            const params = {
                '$select': 'id,subject,from,receivedDateTime,isRead,hasAttachments',
                '$orderby': 'receivedDateTime desc', '$top': top
            };
            const filters = [];
            if (req.query.unread === '1') filters.push('isRead eq false');
            if (req.query.attachments === '1') filters.push('hasAttachments eq true');
            if (filters.length) params['$filter'] = filters.join(' and ');
            const r = await axios.get(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages`, { headers: { Authorization: `Bearer ${token}` }, params });
            res.json(r.data.value);
        } catch (error) { o365Error(res, error); }
    });

    /**
     * @openapi
     * /api/v1/o365/messages/{id}:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Lit un message Office 365 spécifique
     *     security: [ { ApiKeyAuth: [] } ]
     */
    proxyRouter.get('/o365/messages/:id', verifyApiKey, async (req, res) => {
        try {
            const { mailbox, token } = await o365Context(req);
            const r = await axios.get(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(req.params.id)}`, { headers: { Authorization: `Bearer ${token}` } });
            res.json(r.data);
        } catch (error) { o365Error(res, error); }
    });

    /**
     * @openapi
     * /api/v1/o365/messages/{id}/attachments:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Liste les pièces jointes d'un message
     *     security: [ { ApiKeyAuth: [] } ]
     */
    proxyRouter.get('/o365/messages/:id/attachments', verifyApiKey, async (req, res) => {
        try {
            const { mailbox, token } = await o365Context(req);
            const r = await axios.get(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(req.params.id)}/attachments`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { '$select': 'id,name,size,contentType,isInline' }
            });
            res.json(r.data.value);
        } catch (error) { o365Error(res, error); }
    });

    /**
     * @openapi
     * /api/v1/o365/messages/{id}/attachments/{attachmentId}:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Télécharge le contenu d'une pièce jointe (base64)
     *     security: [ { ApiKeyAuth: [] } ]
     *     responses:
     *       200: { description: "{ id, name, contentType, size, contentBytes }" }
     */
    proxyRouter.get('/o365/messages/:id/attachments/:attachmentId', verifyApiKey, async (req, res) => {
        try {
            const { mailbox, token } = await o365Context(req);
            const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(req.params.id)}/attachments/${encodeURIComponent(req.params.attachmentId)}`;
            const meta = await axios.get(base, { headers: { Authorization: `Bearer ${token}` }, params: { '$select': 'id,name,size,contentType' } });
            const bin = await axios.get(`${base}/$value`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024, maxBodyLength: Infinity });
            res.json({ id: meta.data.id, name: meta.data.name, contentType: meta.data.contentType, size: meta.data.size, contentBytes: Buffer.from(bin.data).toString('base64') });
        } catch (error) { o365Error(res, error); }
    });

    /**
     * @openapi
     * /api/v1/o365/messages/{id}:
     *   patch:
     *     tags: [Proxy APIs (External)]
     *     summary: Marque un message lu / non lu
     *     security: [ { ApiKeyAuth: [] } ]
     */
    proxyRouter.patch('/o365/messages/:id', verifyApiKey, async (req, res) => {
        try {
            const { mailbox, token } = await o365Context(req);
            const isRead = req.body?.isRead !== false;
            await axios.patch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(req.params.id)}`,
                { isRead }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
            res.json({ ok: true, isRead });
        } catch (error) { o365Error(res, error); }
    });

    /**
     * @openapi
     * /api/v1/o365/messages/{id}:
     *   delete:
     *     tags: [Proxy APIs (External)]
     *     summary: Supprime un message (Éléments supprimés)
     *     security: [ { ApiKeyAuth: [] } ]
     */
    proxyRouter.delete('/o365/messages/:id', verifyApiKey, async (req, res) => {
        try {
            const { mailbox, token } = await o365Context(req);
            await axios.delete(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(req.params.id)}`, { headers: { Authorization: `Bearer ${token}` } });
            res.json({ ok: true });
        } catch (error) { o365Error(res, error); }
    });

    /**
     * @openapi
     * /api/v1/o365/synced-messages:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Liste les messages moissonnés stockés en local
     *     security: [{ ApiKeyAuth: [] }]
     */
    proxyRouter.get('/o365/synced-messages', verifyApiKey, async (req, res) => {
        try {
            const messages = await db.all('SELECT * FROM o365_messages ORDER BY received_at DESC');
            res.json(messages);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/v1/o365/harvest:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Déclenche un moissonnage des messages O365
     *     security: [{ ApiKeyAuth: [] }]
     */
    proxyRouter.post('/o365/harvest', verifyApiKey, async (req, res) => {
        try {
            const result = await axios.post(`http://localhost:8001/api/o365/harvest`, {}, {
                headers: { 'Authorization': req.headers.authorization }
            });
            res.json(result.data);
        } catch (error) {
            res.status(500).json({ error: 'Failed to trigger harvest' });
        }
    });

    // --- Monitoring: GLPI ---
    /**
     * @openapi
     * /api/v1/glpi/tickets-count:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Récupère le nombre de tickets ouverts dans GLPI
     *     security: [{ ApiKeyAuth: [] }]
     */
    proxyRouter.get('/glpi/tickets-count', verifyApiKey, async (req, res) => {
        try {
            const result = await axios.get(`http://localhost:8001/api/glpi/tickets-count`, {
                headers: { 'Authorization': req.headers.authorization }
            });
            res.json(result.data);
        } catch (error) {
            res.status(500).json({ error: 'GLPI measurement failed' });
        }
    });

    /**
     * @openapi
     * /api/v1/glpi/recent-tickets:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Liste les tickets récents de GLPI
     *     security: [{ ApiKeyAuth: [] }]
     */
    proxyRouter.get('/glpi/recent-tickets', verifyApiKey, async (req, res) => {
        try {
            const result = await axios.get(`http://localhost:8001/api/glpi/recent-tickets`, {
                headers: { 'Authorization': req.headers.authorization }
            });
            res.json(result.data);
        } catch (error) {
            res.status(500).json({ error: 'GLPI listing failed' });
        }
    });

    // --- Directory: AD ---
    /**
     * @openapi
     * /api/v1/ad/search:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Recherche un utilisateur dans l'Active Directory
     *     security:
     *       - ApiKeyAuth: []
     *     parameters:
     *       - in: query
     *         name: q
     *         required: true
     *         schema:
     *           type: string
     *         description: Terme de recherche (samAccountName, mail, etc.)
     *     responses:
     *       200:
     *         description: Utilisateur trouvé
     */
    proxyRouter.get('/ad/search', verifyApiKey, async (req, res) => {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

        const ldap = require('ldapjs');
        const config = await db.get('SELECT * FROM ad_settings WHERE id = 1 AND is_enabled = 1');
        if (!config) return res.status(503).json({ error: 'AD service disabled' });

        const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}` });
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { client.destroy(); return res.status(500).json({ error: err.message }); }
            
            // Filtre insensible aux accents (ex. « Valérie ») : voir ldap_helpers.js
            const safeQ = escapeLDAPSearchFilter(q);
            const fuzzyQ = fuzzyAccentLDAPValue(q);
            let searchFilter = `(|(sAMAccountName=*${safeQ}*)(mail=*${safeQ}*)(cn=*${safeQ}*)(displayName=*${safeQ}*)(sn=*${safeQ}*)(givenName=*${safeQ}*))`;
            if (fuzzyQ !== safeQ) {
                searchFilter = `(|${searchFilter}(cn=*${fuzzyQ}*)(displayName=*${fuzzyQ}*)(sn=*${fuzzyQ}*)(givenName=*${fuzzyQ}*))`;
            }
            const opts = {
                filter: searchFilter,
                scope: 'sub',
                attributes: ['sAMAccountName', 'displayName', 'mail', 'sn', 'givenName', 'cn'],
                sizeLimit: 20
            };

            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) { client.destroy(); return res.status(500).json({ error: err.message }); }
                const entries = [];
                searchRes.on('searchEntry', (entry) => {
                    entries.push(decodeEntryAttrs(flattenLDAPEntry(entry)));
                });
                searchRes.on('end', () => { client.destroy(); res.json(entries); });
                searchRes.on('error', (err) => { client.destroy(); res.status(500).json({ error: err.message }); });
            });
        });
    });

    /**
     * @openapi
     * /api/v1/ad/user:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Récupère tous les détails d'un utilisateur Active Directory
     *     security:
     *       - ApiKeyAuth: []
     *     parameters:
     *       - in: query
     *         name: identifier
     *         required: true
     *         schema:
     *           type: string
     *         description: Identifiant de l'utilisateur (sAMAccountName, mail ou userPrincipalName)
     *     responses:
     *       200:
     *         description: Détails de l'utilisateur récupérés avec succès
     *       404:
     *         description: Utilisateur non trouvé
     *       401:
     *         description: Clé API manquante ou invalide
     */
    proxyRouter.get('/ad/user', verifyApiKey, async (req, res) => {
        const { identifier } = req.query;
        if (!identifier) return res.status(400).json({ error: 'Query parameter identifier is required' });

        const ldap = require('ldapjs');
        const config = await db.get('SELECT * FROM ad_settings WHERE id = 1 AND is_enabled = 1');
        if (!config) return res.status(503).json({ error: 'AD service disabled' });

        const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}` });
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { client.destroy(); return res.status(500).json({ error: 'LDAP Bind Error: ' + err.message }); }
            
            // Filtre insensible aux accents (ex. « Valérie ») : voir ldap_helpers.js
            const safeId = escapeLDAPSearchFilter(identifier);
            const fuzzyId = fuzzyAccentLDAPValue(identifier);
            let filter = `(|(sAMAccountName=*${safeId}*)(mail=*${safeId}*)(userPrincipalName=*${safeId}*)(cn=*${safeId}*)(displayName=*${safeId}*)`
                + (fuzzyId !== safeId ? `(cn=*${fuzzyId}*)(displayName=*${fuzzyId}*)` : '') + `)`;

            // Support multi-term search (e.g. CHEVALIER+MARC or CHEVALIER&MARC)
            if (identifier.includes('+') || identifier.includes('&') || identifier.includes(' ')) {
                const parts = identifier.split(/[+& ]+/).filter(p => p.trim().length > 0);
                if (parts.length >= 2) {
                    const subFilters = parts.map(p => {
                        const safeP = escapeLDAPSearchFilter(p);
                        const fuzzyP = fuzzyAccentLDAPValue(p);
                        return `(|(sn=*${safeP}*)(givenName=*${safeP}*)(cn=*${safeP}*)`
                            + (fuzzyP !== safeP ? `(sn=*${fuzzyP}*)(givenName=*${fuzzyP}*)(cn=*${fuzzyP}*)` : '') + `)`;
                    });
                    filter = `(|${filter}(&${subFilters.join('')}))`;
                }
            }

            const opts = {
                filter: filter,
                scope: 'sub',
                attributes: ['*'] 
            };
            
            console.log(`[PROXY AD] Search filter: ${filter}`);
            
            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) { client.destroy(); return res.status(500).json({ error: 'LDAP Search Error: ' + err.message }); }
                
                const entries = [];
                searchRes.on('searchEntry', (entry) => {
                    const obj = { dn: entry.objectName };
                    entry.attributes.forEach(attr => {
                        obj[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
                    });
                    if (typeof obj.dn === 'string' && obj.dn.includes('\\')) obj.dn = decodeLDAPString(obj.dn);
                    entries.push(decodeEntryAttrs(obj));
                });
                
                searchRes.on('end', () => {
                    client.destroy();
                    if (entries.length > 0) {
                        res.json(entries);
                    } else {
                        res.status(404).json({ error: 'No user found in Active Directory matching ' + identifier });
                    }
                });
                
                searchRes.on('error', (err) => {
                    client.destroy();
                    res.status(500).json({ error: 'LDAP Search Execution Error: ' + err.message });
                });
            });
        });
    });

    /**
     * @openapi
     * /api/v1/ad/authenticate:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Vérifie les identifiants d'un utilisateur AD
     *     security:
     *       - ApiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [username, password]
     *             properties:
     *               username:
     *                 type: string
     *               password:
     *                 type: string
     *     responses:
     *       200:
     *         description: Authentification réussie
     */
    proxyRouter.post('/ad/authenticate', verifyApiKey, async (req, res) => {
        const { username, password } = req.body;
        const ldap = require('ldapjs');
        const config = await db.get('SELECT * FROM ad_settings WHERE id = 1 AND is_enabled = 1');
        if (!config) return res.status(503).json({ error: 'AD service disabled' });

        const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}` });
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { client.destroy(); return res.status(500).json({ error: err.message }); }
            
            const safeUser = escapeLDAPSearchFilter(username);
            console.log(`[PROXY AD] Authenticating user: ${username}`);
            
            let responseSent = false;

            client.search(config.base_dn, { filter: `(sAMAccountName=${safeUser})`, scope: 'sub' }, (err, searchRes) => {
                if (err) {
                    console.error(`[PROXY AD] Search initiation error for ${username}:`, err.message);
                    client.destroy();
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).json({ error: 'LDAP search initiation error' });
                    }
                    return;
                }

                let userDn = null;
                searchRes.on('searchEntry', (entry) => {
                    userDn = entry.pojo ? entry.pojo.objectName : (entry.objectName || entry.dn);
                    // Décode le DN s'il est échappé RFC4514 (accents, ex. "\c3\89" -> "É") —
                    // sinon le bind ci-dessous échoue en "Invalid credentials" pour les DN
                    // accentués même avec le bon mot de passe. Voir directory.js/ldap_helpers.js.
                    if (typeof userDn === 'string' && userDn.includes('\\')) {
                        userDn = decodeLDAPString(userDn);
                    }
                });

                searchRes.on('end', () => {
                    if (!userDn) { 
                        console.warn(`[PROXY AD] User not found: ${username}`);
                        client.destroy(); 
                        if (!responseSent) {
                            responseSent = true;
                            res.status(401).json({ error: 'User not found' }); 
                        }
                        return;
                    }
                    
                    console.log(`[PROXY AD] Binding user DN: ${userDn}`);
                    // Force String to avoid "stringToWrite must be a string" error
                    client.bind(String(userDn), String(password || ''), (bindErr) => {
                        client.destroy();
                        if (!responseSent) {
                            responseSent = true;
                            if (bindErr) {
                                console.error(`[PROXY AD] Bind failed for ${username}:`, bindErr.message);
                                return res.status(401).json({ error: 'Invalid credentials' });
                            }
                            console.log(`[PROXY AD] Auth successful: ${username}`);
                            res.json({ success: true, dn: userDn });
                        }
                    });
                });

                searchRes.on('error', (searchErr) => {
                    console.error(`[PROXY AD] Search execution error for ${username}:`, searchErr.message);
                    client.destroy();
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).json({ error: 'LDAP search execution error' });
                    }
                });
            });
        });
    });

    // --- Directory: Azure ---
    /**
     * @openapi
     * /api/v1/azure/search:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Recherche un utilisateur dans Entra ID (Azure AD)
     *     security:
     *       - ApiKeyAuth: []
     *     parameters:
     *       - in: query
     *         name: q
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Utilisateur trouvé
     */
    proxyRouter.get('/azure/search', verifyApiKey, async (req, res) => {
        const { q } = req.query;
        try {
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1 AND is_enabled = 1');
            if (!settings) return res.status(503).json({ error: 'Azure service disabled' });

            const tokenRes = await axios.post(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: settings.client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: settings.client_secret
            }));

            const searchRes = await axios.get('https://graph.microsoft.com/v1.0/users', {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
                params: {
                    '$filter': `startsWith(userPrincipalName, '${q}') or startsWith(displayName, '${q}') or mail eq '${q}'`,
                    '$select': 'displayName,userPrincipalName,mail,jobTitle,department,id',
                    '$top': 5
                }
            });
            res.json(searchRes.data.value);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/v1/azure/user:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Récupère tous les détails d'un utilisateur Entra ID (Azure AD)
     *     security:
     *       - ApiKeyAuth: []
     *     parameters:
     *       - in: query
     *         name: identifier
     *         required: true
     *         schema:
     *           type: string
     *         description: Identifiant de l'utilisateur (UPN, mail ou début du nom)
     *     responses:
     *       200:
     *         description: Détails de l'utilisateur Azure récupérés avec succès
     *       401:
     *         description: Clé API manquante ou invalide
     */
    proxyRouter.get('/azure/user', verifyApiKey, async (req, res) => {
        const { identifier } = req.query;
        if (!identifier) return res.status(400).json({ error: 'Query parameter identifier is required' });

        try {
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1 AND is_enabled = 1');
            if (!settings) return res.status(503).json({ error: 'Azure service disabled' });

            const tokenRes = await axios.post(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: settings.client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: settings.client_secret
            }));

            let graphFilter = `startsWith(userPrincipalName, '${identifier}') or startsWith(displayName, '${identifier}') or mail eq '${identifier}'`;
            
            // Support multi-term search (e.g. CHEVALIER+MARC or CHEVALIER&MARC)
            if (identifier.includes('+') || identifier.includes('&') || identifier.includes(' ')) {
                const parts = identifier.split(/[+& ]+/).filter(p => p.trim().length > 0);
                if (parts.length >= 2) {
                    const subFilters = parts.map(p => `(startsWith(displayName, '${p}') or contains(displayName, '${p}'))`);
                    graphFilter = `(${graphFilter}) or (${subFilters.join(' and ')})`;
                }
            }

            const searchRes = await axios.get('https://graph.microsoft.com/v1.0/users', {
                headers: { 
                    Authorization: `Bearer ${tokenRes.data.access_token}`,
                    'ConsistencyLevel': 'eventual' // Required for advanced filters like 'contains'
                },
                params: {
                    '$filter': graphFilter,
                    '$select': 'id,displayName,userPrincipalName,mail,jobTitle,department,companyName,mobilePhone,businessPhones,usageLocation,assignedLicenses,assignedPlans',
                    '$top': 10,
                    '$count': 'true' // Also required for advanced filters
                }
            });
            res.json(searchRes.data.value);
        } catch (error) {
            console.error('[PROXY AZURE] Error:', error.response?.data || error.message);
            res.status(500).json({ error: error.response?.data?.error?.message || error.message });
        }
    });

    // --- Database: Oracle ---
    const oracledb = require('oracledb');
    async function getOracleConnection(settings) {
        if (!settings || !settings.is_enabled) throw new Error('Oracle connection disabled');
        return await oracledb.getConnection({
            user: settings.username,
            password: settings.password,
            connectString: settings.connectString || `${settings.host}:${settings.port}/${settings.service_name}`
        });
    }

    /**
     * @openapi
     * /api/v1/oracle/query:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Exécute une requête lecture seule (SELECT) sur Oracle
     *     security:
     *       - ApiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [type, sql]
     *             properties:
     *               type:
     *                 type: string
     *                 example: "RH"
     *               sql:
     *                 type: string
     *                 example: "SELECT * FROM AGENT WHERE ROWNUM <= 10"
     *     responses:
     *       200:
     *         description: Résultats de la requête
     */
    proxyRouter.post('/oracle/query', verifyApiKey, async (req, res) => {
        const { type, sql } = req.body;
        if (!type || !sql) return res.status(400).json({ error: 'type and sql are required' });
        if (!sql.trim().toLowerCase().startsWith('select')) {
            return res.status(403).json({ error: 'Only SELECT queries are allowed via Proxy API' });
        }

        let connection;
        try {
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);
            const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) {} }
        }
    });

    /**
     * @openapi
     * /api/v1/oracle/sync/{type}:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Déclenche manuellement une synchronisation Oracle
     *     security:
     *       - ApiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: type
     *         required: true
     *         schema:
     *           type: string
     *         description: Type de synchro (RH, FINANCES, etc.)
     *     responses:
     *       200:
     *         description: Synchronisation lancée
     */
    proxyRouter.post('/oracle/sync/:type', verifyApiKey, async (req, res) => {
        const { type } = req.params;
        try {
            await axios.post(`http://localhost:8001/api/oracle/import-tables`, { type }, {
                headers: { 'Authorization': req.headers.authorization }
            });
            res.json({ status: 'triggered', type });
        } catch (error) {
            res.json({ status: 'accepted', message: 'Sync request received' });
        }
    });

    // --- AI (Intelligence Artificielle) ---
    /**
     * @openapi
     * /api/v1/ai/models:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Liste les modèles IA configurés et l'état de leur dernier test (test automatique toutes les heures)
     *     security: [{ ApiKeyAuth: [] }]
     *     responses:
     *       200:
     *         description: Liste des modèles avec leur statut
     */
    proxyRouter.get('/ai/models', verifyApiKey, async (req, res) => {
        try {
            const models = await app.locals.getAiModelsWithStatus();
            res.json(models);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/v1/ai/query:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Interroge un modèle IA configuré (bascule automatique sur un autre fournisseur en cas d'échec)
     *     security: [{ ApiKeyAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [prompt]
     *             properties:
     *               prompt:
     *                 type: string
     *                 example: "Résume ce texte en une phrase : ..."
     *               model:
     *                 type: string
     *                 description: "Identifiant du modèle souhaité (voir /api/v1/ai/models). Optionnel : le modèle par défaut est utilisé sinon."
     *     responses:
     *       200:
     *         description: Réponse du modèle IA
     *       400:
     *         description: Prompt manquant
     *       503:
     *         description: Aucun modèle IA disponible ou tous les modèles ont échoué
     */
    proxyRouter.post('/ai/query', verifyApiKey, async (req, res) => {
        const { prompt, model } = req.body;
        if (!prompt || !String(prompt).trim()) {
            return res.status(400).json({ error: 'Le champ prompt est requis' });
        }
        try {
            const result = await app.locals.runAiQuery(prompt, model);
            console.log(`[PROXY AI] Query for ${req.externalApp.name} answered by ${result.provider_label} (${result.model})`);
            res.json({ status: 'success', ...result });
        } catch (error) {
            res.status(503).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/v1/ai/query-async:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Variante asynchrone de /api/v1/ai/query — démarre la génération et renvoie
     *       immédiatement un queryId à poller sur /api/v1/ai/query-progress/{queryId}, qui
     *       remonte le nombre de tokens reçus en temps réel (streaming SSE côté fournisseur)
     *       au lieu d'attendre la réponse complète.
     *     security: [{ ApiKeyAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [prompt]
     *             properties:
     *               prompt:
     *                 type: string
     *               model:
     *                 type: string
     *                 description: "Identifiant du modèle souhaité (voir /api/v1/ai/models). Optionnel."
     *     responses:
     *       200:
     *         description: queryId à poller
     *       400:
     *         description: Prompt manquant
     */
    proxyRouter.post('/ai/query-async', verifyApiKey, (req, res) => {
        const { prompt, model } = req.body;
        if (!prompt || !String(prompt).trim()) {
            return res.status(400).json({ error: 'Le champ prompt est requis' });
        }
        try {
            const queryId = app.locals.startAiQueryAsync(prompt, model);
            res.json({ queryId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/v1/ai/query-progress/{queryId}:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Progression d'une génération lancée via /api/v1/ai/query-async.
     *     description: >-
     *       status='running' : tokensReceived (estimation) augmente en temps réel.
     *       status='completed' : la réponse finale est dans `response` (mêmes champs que
     *       /api/v1/ai/query). status='error' : le détail est dans `error`.
     *     security: [{ ApiKeyAuth: [] }]
     *     parameters:
     *       - in: path
     *         name: queryId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: État du job
     *       404:
     *         description: queryId introuvable (expiré après 35 min, ou jamais existé)
     */
    proxyRouter.get('/ai/query-progress/:queryId', verifyApiKey, (req, res) => {
        const job = app.locals.getQueryJobStatus(req.params.queryId);
        if (!job) return res.status(404).json({ error: 'queryId introuvable (expiré ou jamais existé)' });
        res.json(job);
    });

    /**
     * @openapi
     * /api/v1/ai/transcribe:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Transcrit un fichier audio via l'IA locale Faster-Whisper (STT)
     *     description: >
     *       Relaie le fichier vers le service local Faster-Whisper (API compatible OpenAI
     *       /v1/audio/transcriptions). Accepte soit un envoi multipart/form-data avec le champ
     *       "file" (recommandé pour un fichier), soit un JSON avec le contenu audio encodé en
     *       base64 dans "audio". Options : "language" (code ISO, ex. "fr"), "prompt" (contexte
     *       pour guider la transcription) et "model".
     *     security: [{ ApiKeyAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             properties:
     *               file:
     *                 type: string
     *                 format: binary
     *               language:
     *                 type: string
     *               model:
     *                 type: string
     *               prompt:
     *                 type: string
     *         application/json:
     *           schema:
     *             type: object
     *             required: [audio]
     *             properties:
     *               audio:
     *                 type: string
     *                 description: "Contenu audio encodé en base64"
     *               filename:
     *                 type: string
     *                 example: "reunion.wav"
     *               language:
     *                 type: string
     *                 example: "fr"
     *               model:
     *                 type: string
     *                 example: "whisper-1"
     *               prompt:
     *                 type: string
     *     responses:
     *       200:
     *         description: Transcription réussie
     *       400:
     *         description: Fichier audio manquant
     *       503:
     *         description: Service de transcription indisponible ou désactivé
     */
    proxyRouter.post('/ai/transcribe', verifyApiKey, transcribeUpload.single('file'), async (req, res) => {
        const file = req.file;
        const audio = file ? file.buffer : (req.body?.audio || req.body?.file_base64);
        if (!audio) {
            return res.status(400).json({ error: 'Fichier audio requis (champ multipart "file" ou JSON "audio" en base64)' });
        }
        try {
            const result = await app.locals.transcribeAudio(audio, {
                filename: file?.originalname || req.body?.filename || 'audio.wav',
                language: req.body?.language || null,
                prompt: req.body?.prompt || null,
                model: req.body?.model || 'whisper-1'
            });
            console.log(`[PROXY AI] Transcription for ${req.externalApp.name}: ${result.text.length} caractère(s)`);
            res.json({ status: 'success', provider: 'whisper', provider_label: 'Faster-Whisper STT (local)', text: result.text });
        } catch (error) {
            res.status(503).json({ error: error.message });
        }
    });

    // --- Admin APIs for External Apps ---
    adminRouter.get('/apps', authenticateAdmin, async (req, res) => {
        const apps = await db.all('SELECT * FROM external_apps');
        res.json(apps);
    });

    adminRouter.post('/apps', authenticateAdmin, async (req, res) => {
        const { name, authorized_routes } = req.body;
        const apiKey = crypto.randomBytes(32).toString('hex');
        const routesJson = JSON.stringify(authorized_routes || ["*"]);
        try {
            await db.run('INSERT INTO external_apps (name, api_key, authorized_routes) VALUES (?, ?, ?)', [name, apiKey, routesJson]);
            res.status(201).json({ name, api_key: apiKey });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    adminRouter.put('/apps/:id', authenticateAdmin, async (req, res) => {
        const { name, authorized_routes } = req.body;
        const routesJson = JSON.stringify(authorized_routes || ["*"]);
        try {
            await db.run('UPDATE external_apps SET name = ?, authorized_routes = ? WHERE id = ?', [name, routesJson, req.params.id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    adminRouter.put('/apps/:id/toggle', authenticateAdmin, async (req, res) => {
        try {
            const current = await db.get('SELECT is_active FROM external_apps WHERE id = ?', [req.params.id]);
            if (!current) return res.status(404).json({ error: 'App not found' });
            
            const newState = current.is_active === 1 ? 0 : 1;
            await db.run('UPDATE external_apps SET is_active = ? WHERE id = ?', [newState, req.params.id]);
            res.json({ id: req.params.id, is_active: newState });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    adminRouter.delete('/apps/:id', authenticateAdmin, async (req, res) => {
        await db.run('DELETE FROM external_apps WHERE id = ?', [req.params.id]);
        res.json({ message: 'App deleted' });
    });

    adminRouter.get('/apps/:id/logs', authenticateAdmin, async (req, res) => {
        const logs = await db.all(
            'SELECT * FROM proxy_logs WHERE app_id = ? ORDER BY timestamp DESC LIMIT 100',
            [req.params.id]
        );
        res.json(logs);
    });

    adminRouter.get('/logs', authenticateAdmin, async (req, res) => {
        const { app_id, status, limit, offset, search, start_date, end_date } = req.query;
        let query = `
            SELECT pl.*, ea.name as app_name 
            FROM proxy_logs pl
            LEFT JOIN external_apps ea ON pl.app_id = ea.id
            WHERE 1=1
        `;
        const params = [];

        if (app_id && app_id !== 'all') {
            query += ' AND pl.app_id = ?';
            params.push(app_id);
        }
        if (status === 'error') {
            query += ' AND pl.status >= 400';
        } else if (status === 'success') {
            query += ' AND pl.status < 400';
        }
        if (search) {
            query += ' AND (pl.endpoint LIKE ? OR pl.payload LIKE ? OR pl.response_payload LIKE ? OR ea.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (start_date) {
            query += ' AND datetime(pl.timestamp) >= datetime(?)';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND datetime(pl.timestamp) <= datetime(?)';
            params.push(end_date);
        }

        try {
            const count = await db.get(`SELECT COUNT(*) as total FROM (${query})`, params);
            
            query += ' ORDER BY pl.timestamp DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit) || 50, parseInt(offset) || 0);

            const logs = await db.all(query, params);
            res.json({ 
                total: count ? count.total : 0, 
                logs: logs || [] 
            });
        } catch (error) {
            console.error('[LOGS API] Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // --- Security Settings API ---
    adminRouter.get('/settings', authenticateAdmin, async (req, res) => {
        const settings = await db.get('SELECT * FROM security_settings WHERE id = 1');
        res.json(settings || { trust_proxies_enabled: 0 });
    });

    adminRouter.put('/settings', authenticateAdmin, async (req, res) => {
        const { trust_proxies_enabled } = req.body;
        await db.run('UPDATE security_settings SET trust_proxies_enabled = ? WHERE id = 1', [trust_proxies_enabled ? 1 : 0]);
        res.json({ trust_proxies_enabled: trust_proxies_enabled ? 1 : 0 });
    });

    adminRouter.get('/trusted-ips', authenticateAdmin, async (req, res) => {
        const ips = await db.all('SELECT * FROM trusted_ips ORDER BY created_at DESC');
        res.json(ips);
    });

    adminRouter.post('/trusted-ips', authenticateAdmin, async (req, res) => {
        const { ip_address, description } = req.body;
        try {
            await db.run('INSERT INTO trusted_ips (ip_address, description) VALUES (?, ?)', [ip_address, description]);
            const newIp = await db.get('SELECT * FROM trusted_ips WHERE ip_address = ?', [ip_address]);
            res.status(201).json(newIp);
        } catch (e) {
            res.status(400).json({ error: 'IP Address already exists or invalid format' });
        }
    });

    adminRouter.delete('/trusted-ips/:id', authenticateAdmin, async (req, res) => {
        await db.run('DELETE FROM trusted_ips WHERE id = ?', [req.params.id]);
        res.json({ message: 'IP removed' });
    });

    app.use('/api/v1', proxyRouter);
    app.use('/api/admin/external', adminRouter);
};
