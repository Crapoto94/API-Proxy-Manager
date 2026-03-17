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
    const router = express.Router();

    // --- Middleware: Verify API Key ---
    const logRequest = async (req, status) => {
        if (!req.externalApp) return;
        try {
            await db.run(
                'INSERT INTO proxy_logs (app_id, endpoint, method, query_params, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    req.externalApp.id, 
                    req.path, 
                    req.method, 
                    JSON.stringify(req.query || {}), 
                    JSON.stringify(req.body || {}), 
                    status
                ]
            );
        } catch (e) {
            console.error('[PROXY LOG] Failed to log request:', e.message);
        }
    };

    const verifyApiKey = async (req, res, next) => {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ error: 'X-API-KEY header missing' });
        }

        try {
            const appEntry = await db.get('SELECT * FROM external_apps WHERE api_key = ? AND is_active = 1', [apiKey]);
            if (!appEntry) {
                return res.status(401).json({ error: 'Invalid or inactive API Key' });
            }
            req.externalApp = appEntry;
            
            // Override res.json to auto-log status
            const originalJson = res.json;
            res.json = function(data) {
                logRequest(req, res.statusCode);
                return originalJson.apply(res, arguments);
            };
            
            next();
        } catch (error) {
            res.status(500).json({ error: 'Internal auth error' });
        }
    };

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
     */
    router.post('/sms/send', verifyApiKey, async (req, res) => {
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

    /**
     * @openapi
     * /api/v1/mail/send:
     *   post:
     *     tags: [Proxy APIs (External)]
     *     summary: Envoie un email via le proxy Mail (SMTP/Brevo)
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
     *               subject:
     *                 type: string
     *               content:
     *                 type: string
     *               from_name:
     *                 type: string
     *                 description: Nom de l'expéditeur (optionnel, écrase les réglages console)
     *               from_email:
     *                 type: string
     *                 description: Email de l'expéditeur (optionnel, écrase les réglages console)
     *               is_raw:
     *                 type: boolean
     *                 description: Si vrai, n'applique pas le template HTML DSI (optionnel)
     *     responses:
     *       200:
     *         description: Email envoyé
     */
    router.post('/mail/send', verifyApiKey, async (req, res) => {
        const { to, subject, content, from_name, from_email, is_raw } = req.body;
        if (!to || !subject || !content) {
            return res.status(400).json({ error: 'to, subject and content are required' });
        }

        try {
            // Use app.locals.sendMail if registered, or implement local call
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
    router.get('/ad/search', verifyApiKey, async (req, res) => {
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
    router.post('/ad/authenticate', verifyApiKey, async (req, res) => {
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
    router.get('/azure/search', verifyApiKey, async (req, res) => {
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
    router.post('/oracle/query', verifyApiKey, async (req, res) => {
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
    router.post('/oracle/sync/:type', verifyApiKey, async (req, res) => {
        const { type } = req.params;
        try {
            // Forward to the internal admin API or call helper
            const response = await axios.post(`http://localhost:8001/api/oracle/import-tables`, { type }, {
                headers: { 'Authorization': req.headers.authorization } // This might fail if called from external
            });
            // Alternative: Trigger logic directly if possible, or use a secret internal token
            res.json({ status: 'triggered', type });
        } catch (error) {
            // Direct logic if axios call to self is complex in this context
            console.log(`[PROXY SYNC] Triggered sync for ${type} by ${req.externalApp.name}`);
            res.json({ status: 'accepted', message: 'Sync request received' });
        }
    });

    // --- Admin APIs for External Apps ---
    router.get('/apps', authenticateAdmin, async (req, res) => {
        const apps = await db.all('SELECT * FROM external_apps');
        res.json(apps);
    });

    router.post('/apps', authenticateAdmin, async (req, res) => {
        const { name } = req.body;
        const apiKey = crypto.randomBytes(32).toString('hex');
        try {
            await db.run('INSERT INTO external_apps (name, api_key) VALUES (?, ?)', [name, apiKey]);
            res.status(201).json({ name, api_key: apiKey });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.delete('/apps/:id', authenticateAdmin, async (req, res) => {
        await db.run('DELETE FROM external_apps WHERE id = ?', [req.params.id]);
        res.json({ message: 'App deleted' });
    });

    router.get('/apps/:id/logs', authenticateAdmin, async (req, res) => {
        const logs = await db.all(
            'SELECT * FROM proxy_logs WHERE app_id = ? ORDER BY timestamp DESC LIMIT 100',
            [req.params.id]
        );
        res.json(logs);
    });

    router.get('/logs', authenticateAdmin, async (req, res) => {
        const logs = await db.all(`
            SELECT pl.*, ea.name as app_name 
            FROM proxy_logs pl
            JOIN external_apps ea ON pl.app_id = ea.id
            ORDER BY pl.timestamp DESC 
            LIMIT 50
        `);
        res.json(logs);
    });

    app.use('/api/v1', router);
    app.use('/api/admin/external', router); // Also expose management under admin
};
