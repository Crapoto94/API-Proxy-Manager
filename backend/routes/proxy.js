const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

/**
 * @openapi
 * tags:
 *   name: Proxy APIs (External)
 *   description: APIs sécurisées par Clé API pour applications externes (SMS, Mail)
 */

module.exports = (app, db, authenticateAdmin) => {
    const proxyRouter = express.Router();
    const adminRouter = express.Router();

    // --- Middleware: Global Proxy Logger (External APIs only) ---
    const proxyLogger = async (req, res, next) => {
        const originalJson = res.json;

        res.json = function(data) {
            const status = res.statusCode;
            const appEntry = req.externalApp || null;
            
            // Log for external proxy routes
            db.run(
                'INSERT INTO proxy_logs (app_id, endpoint, method, query_params, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    appEntry ? appEntry.id : null,
                    req.originalUrl || req.path,
                    req.method,
                    JSON.stringify(req.query || {}),
                    JSON.stringify(req.body || {}),
                    status
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
            else if (path.startsWith('/o365/messages')) requiredPermission = 'o365_read';
            else if (path.startsWith('/o365/synced-messages')) requiredPermission = 'o365_read';
            else if (path.startsWith('/o365/harvest')) requiredPermission = 'o365_harvest';
            else if (path.startsWith('/glpi/')) requiredPermission = 'glpi_read';

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

    /**
     * @openapi
     * /api/v1/sms/send:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Envoie un SMS via le proxy Frizbi
     *     security:
     *       - ApiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [mobile, message]
     *             properties:
     *               mobile:
     *                 type: string
     *                 example: "0601020304"
     *               message:
     *                 type: string
     *                 example: "Votre code de validation est 123456"
     *     responses:
     *       200:
     *         description: SMS envoyé
     *       401:
     *         description: Clé API manquante ou invalide
     *       403:
     *         description: IP non autorisée ou permissions insuffisantes
     */
    proxyRouter.post('/sms/send', verifyApiKey, async (req, res) => {
        const { mobile, message } = req.body;
        if (!mobile || !message) {
            return res.status(400).json({ error: 'mobile and message are required' });
        }

        try {
            const { token, apiUrl, senderId } = await getFrizbiToken();
            
            const payload = {
                customerSmsId: `ext_${req.externalApp.id}_${Date.now()}`,
                title: req.externalApp.name,
                message: message,
                customerSenderId: senderId || 'APM',
                smsContacts: [
                    {
                        customerSmsContactId: `c_${Date.now()}`,
                        mobile: mobile
                    }
                ]
            };

            const response = await axios.post(`${apiUrl}/api/sms/send`, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log(`[PROXY SMS] Sent for ${req.externalApp.name}: ${mobile}`);
            res.json({ status: 'success', data: response.data });
        } catch (error) {
            console.error('[PROXY SMS] Error:', error.response?.data || error.message);
            res.status(500).json({ error: error.response?.data?.message || error.message });
        }
    });


    proxyRouter.post('/mail/send', verifyApiKey, async (req, res) => {
        const { to, subject, content, from_name, from_email, is_raw } = req.body;
        if (!to || !subject || !content) {
            return res.status(400).json({ error: 'to, subject and content are required' });
        }

        try {
            if (app.locals.sendMail) {
                await app.locals.sendMail(to, subject, content, {
                    fromName: from_name,
                    fromEmail: from_email,
                    useTemplate: is_raw === true ? false : true
                });
                console.log(`[PROXY MAIL] Sent for ${req.externalApp.name}: ${to}`);
                res.json({ status: 'success' });
            } else {
                throw new Error('Mail provider not available');
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // --- Office 365: Boîte Mail ---
    /**
     * @openapi
     * /api/v1/o365/messages:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Liste les messages d'une boîte Office 365
     *     security:
     *       - ApiKeyAuth: []
     *     responses:
     *       200:
     *         description: Liste des messages récupérée
     *       401:
     *         description: Clé API manquante ou invalide
     *       403:
     *         description: IP non autorisée ou permissions insuffisantes
     */
    proxyRouter.get('/o365/messages', verifyApiKey, async (req, res) => {
        try {
            const result = await axios.get(`http://localhost:8001/api/o365/messages`, {
                headers: { 'Authorization': req.headers.authorization } // On rebondit sur l'API interne via redirection (ou appel direct)
            });
            res.json(result.data);
        } catch (error) {
            // Si l'appel interne échoue car on n'a pas de JWT admin, on doit refaire la logique ici ou exposer la fonction
            // Pour faire simple et propre, on va appeler la fonction de o365.js si possible ou réeffectuer l'appel Graph
            // Appel direct à l'API interne avec un token admin "système" ou simplement coder la logique ici.
            // Option choisie : L'API proxy réeffecute la logique via Microsoft Graph pour être autonome.
            const o365 = await db.get('SELECT * FROM o365_settings WHERE id = 1 AND is_enabled = 1');
            if (!o365) return res.status(503).json({ error: 'O365 service disabled' });

            const tokenRes = await axios.post(`https://login.microsoftonline.com/${o365.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: o365.client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: o365.client_secret
            }));

            const messagesRes = await axios.get(`https://graph.microsoft.com/v1.0/users/${o365.mailbox}/messages`, {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
                params: { '$top': 50, '$select': 'id,subject,from,receivedDateTime,isRead' }
            });

            res.json(messagesRes.data.value);
        }
    });

    /**
     * @openapi
     * /api/v1/o365/messages/{id}:
     *   get:
     *     tags: [Proxy APIs (External)]
     *     summary: Lit un message Office 365 spécifique
     *     security:
     *       - ApiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Contenu du message
     */
    proxyRouter.get('/o365/messages/:id', verifyApiKey, async (req, res) => {
        try {
            const o365 = await db.get('SELECT * FROM o365_settings WHERE id = 1 AND is_enabled = 1');
            if (!o365) return res.status(503).json({ error: 'O365 service disabled' });

            const tokenRes = await axios.post(`https://login.microsoftonline.com/${o365.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: o365.client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: o365.client_secret
            }));

            const messageRes = await axios.get(`https://graph.microsoft.com/v1.0/users/${o365.mailbox}/messages/${req.params.id}`, {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
            });

            res.json(messageRes.data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
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
            
            const opts = {
                filter: `(|(sAMAccountName=${q}*)(mail=${q}*)(cn=${q}*)(displayName=${q}*))`,
                scope: 'sub',
                sizeLimit: 5
            };
            
            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) { client.destroy(); return res.status(500).json({ error: err.message }); }
                const entries = [];
                searchRes.on('searchEntry', (entry) => entries.push(entry.object));
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
            
            let filter = `(|(sAMAccountName=*${identifier}*)(mail=*${identifier}*)(userPrincipalName=*${identifier}*)(cn=*${identifier}*))`;

            // Support multi-term search (e.g. CHEVALIER+MARC or CHEVALIER&MARC)
            if (identifier.includes('+') || identifier.includes('&') || identifier.includes(' ')) {
                const parts = identifier.split(/[+& ]+/).filter(p => p.trim().length > 0);
                if (parts.length >= 2) {
                    const subFilters = parts.map(p => `(|(sn=*${p}*)(givenName=*${p}*)(cn=*${p}*))`);
                    filter = `(|${filter}(&${subFilters.join('')}))`;
                }
            }

            const opts = {
                filter: filter,
                scope: 'sub',
                attributes: ['*'] 
            };
            
            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) { client.destroy(); return res.status(500).json({ error: 'LDAP Search Error: ' + err.message }); }
                
                const entries = [];
                searchRes.on('searchEntry', (entry) => {
                    const obj = { dn: entry.objectName };
                    entry.attributes.forEach(attr => {
                        obj[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
                    });
                    entries.push(obj);
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
            
            client.search(config.base_dn, { filter: `(sAMAccountName=${username})`, scope: 'sub' }, (err, searchRes) => {
                let userDn = null;
                searchRes.on('searchEntry', (entry) => { userDn = entry.objectName; });
                searchRes.on('end', () => {
                    if (!userDn) { client.destroy(); return res.status(401).json({ error: 'User not found' }); }
                    client.bind(userDn, password, (err) => {
                        client.destroy();
                        if (err) return res.status(401).json({ error: 'Invalid credentials' });
                        res.json({ success: true, dn: userDn });
                    });
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
        const logs = await db.all(`
            SELECT pl.*, ea.name as app_name 
            FROM proxy_logs pl
            LEFT JOIN external_apps ea ON pl.app_id = ea.id
            ORDER BY pl.timestamp DESC 
            LIMIT 50
        `);
        res.json(logs);
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
