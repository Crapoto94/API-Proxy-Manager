const ldap = require('ldapjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');

module.exports = function(app, db, authenticateAdmin, SECRET_KEY) {

    const escapeLDAPSearchFilter = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/\\/g, '\\5c')
                  .replace(/\*/g, '\\2a')
                  .replace(/\(/g, '\\28')
                  .replace(/\)/g, '\\29')
                  .replace(/\0/g, '\\00');
    };

    // --- LDAP Helpers ---
    function flattenLDAPEntry(entry) {
        if (!entry) return null;
        try {
            // Method 1: Standard ldapjs object (getter)
            const obj = entry.object;
            if (obj && Object.keys(obj).length > 0) return obj;

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
            
            return manualObj;
        } catch (e) {
            console.error('[AD] Flatten error:', e.message);
            return { dn: entry.dn?.toString() || 'unknown', error: e.message };
        }
    }

    async function authenticateAD(username, password, config) {
        return new Promise((resolve, reject) => {
            if (!config.is_enabled) return resolve(null);
            const client = ldap.createClient({
                url: `ldap://${config.host}:${config.port}`,
                connectTimeout: 10000,
                timeout: 10000
            });

            client.on('error', (err) => {
                console.error('[AD Auth] LDAP Client Error:', err.message);
                resolve(null);
            });

            client.bind(config.bind_dn, config.bind_password, (err) => {
                if (err) {
                    client.destroy();
                    return reject(new Error('Erreur de liaison AD : ' + err.message));
                }
                const safeUser = escapeLDAPSearchFilter(username);
                const searchOptions = {
                    filter: `(sAMAccountName=${safeUser})`,
                    scope: 'sub',
                    attributes: ['dn', 'cn', 'memberOf', 'mail', 'displayName']
                };
                client.search(config.base_dn, searchOptions, (err, res) => {
                    if (err) {
                        client.destroy();
                        return reject(new Error('Erreur de recherche AD : ' + err.message));
                    }
                    let userEntry = null;
                    res.on('searchEntry', (entry) => { userEntry = flattenLDAPEntry(entry); });
                    res.on('error', (err) => { client.destroy(); reject(err); });
                    res.on('end', () => {
                        console.log(`[AD Auth] Binding user DN: ${userEntry.dn}`);
                        // Force String conversion to prevent ldapjs 'stringToWrite must be a string' error
                        client.bind(String(userEntry.dn), String(password || ''), (err) => {
                            client.destroy();
                            if (err) {
                                console.error(`[AD Auth] Bind failed for ${username}:`, err.message);
                                resolve(null);
                            } else {
                                console.log(`[AD Auth] Auth successful for ${username}`);
                                resolve(userEntry);
                            }
                        });
                    });
                });
            });
        });
    }

    // Expose for server.js usage
    app.locals.authenticateAD = authenticateAD;

    // --- AD Settings Routes ---
    /**
     * @openapi
     * /api/ad-settings:
     *   get:
     *     tags: [Directory - Active Directory]
     *     summary: Récupère les paramètres AD
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres récupérés
     */
    app.get('/api/ad-settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (settings && settings.bind_password) settings.bind_password = '********';
            res.json(settings);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture paramètres AD' });
        }
    });

    /**
     * @openapi
     * /api/ad-settings:
     *   post:
     *     tags: [Directory - Active Directory]
     *     summary: Enregistre les paramètres AD
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres enregistrés
     */
    app.post('/api/ad-settings', authenticateAdmin, async (req, res) => {
        const { is_enabled, host, port, base_dn, bind_dn, bind_password } = req.body;
        try {
            const isMasked = bind_password === '********' || bind_password === '••••••••';
            const setSql = (!bind_password || isMasked) 
                ? 'UPDATE ad_settings SET is_enabled = ?, host = ?, port = ?, base_dn = ?, bind_dn = ? WHERE id = 1'
                : 'UPDATE ad_settings SET is_enabled = ?, host = ?, port = ?, base_dn = ?, bind_dn = ?, bind_password = ? WHERE id = 1';
            const params = (!bind_password || isMasked)
                ? [is_enabled ? 1 : 0, host, port, base_dn, bind_dn]
                : [is_enabled ? 1 : 0, host, port, base_dn, bind_dn, bind_password];
            await db.run(setSql, params);
            res.json({ message: 'Paramètres AD enregistrés' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur enregistrement paramètres AD' });
        }
    });

    app.post('/api/auth/ad-ping', authenticateAdmin, async (req, res) => {
        const config = req.body;
        try {
            // Fetch the actual password from DB because the frontend sends '********'
            const dbSettings = await db.get('SELECT bind_password FROM ad_settings WHERE id = 1');
            const actualPassword = (config.bind_password === '********' || config.bind_password === '••••••••') && dbSettings 
                ? dbSettings.bind_password 
                : config.bind_password;

            if (!actualPassword) return res.status(400).json({ message: 'Mot de passe manquant pour le test' });

            const client = ldap.createClient({
                url: `ldap://${config.host}:${config.port}`,
                connectTimeout: 5000,
                timeout: 5000
            });
            client.on('error', (err) => {
                res.status(400).json({ message: 'Erreur de liaison AD: ' + err.message });
            });
            client.bind(config.bind_dn, actualPassword, (err) => {
                client.destroy();
                if (err) return res.status(400).json({ message: 'Erreur de liaison AD: ' + err.message });
                res.json({ success: true, message: 'Ping réussi ! Connexion AD établie.' });
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur inattendue: ' + error.message });
        }
    });

    app.post('/api/auth/ad-test', authenticateAdmin, async (req, res) => {
        const { username, host, port, base_dn, bind_dn, bind_password, is_enabled } = req.body;
        try {
            const dbSettings = await db.get('SELECT bind_password FROM ad_settings WHERE id = 1');
            const actualPassword = (bind_password === '********' || bind_password === '••••••••') && dbSettings 
                ? dbSettings.bind_password 
                : bind_password;

            if (!actualPassword) return res.status(400).json({ message: 'Bind password missing for test' });

            const client = ldap.createClient({
                url: `ldap://${host}:${port}`,
                connectTimeout: 5000,
                timeout: 5000
            });
            
            client.on('error', (err) => {
                console.error('[AD TEST] Connection error:', err.message);
                res.status(400).json({ message: 'Erreur de liaison AD: ' + err.message });
            });

            client.bind(bind_dn, actualPassword, (err) => {
                if (err) {
                    client.destroy();
                    console.error('[AD TEST] Bind error:', err.message);
                    return res.status(400).json({ message: 'Échec de l\'authentification du compte de service : ' + err.message });
                }
                
                const safeUser = escapeLDAPSearchFilter(username);
                const searchOptions = {
                    filter: `(|(sAMAccountName=${safeUser})(mail=${safeUser})(cn=${safeUser})(userPrincipalName=${safeUser}))`,
                    scope: 'sub',
                    attributes: ['dn', 'cn', 'memberOf', 'mail', 'displayName', 'userPrincipalName']
                };
                
                console.log(`[AD TEST] Searching with filter: ${searchOptions.filter} in ${base_dn}`);

                client.search(base_dn, searchOptions, (err, searchRes) => {
                    if (err) {
                        client.destroy();
                        console.error('[AD TEST] Search trigger error:', err.message);
                        return res.status(400).json({ message: 'Erreur d\'initialisation recherche AD : ' + err.message });
                    }

                    let userEntry = null;
                    searchRes.on('searchEntry', (entry) => { 
                        userEntry = flattenLDAPEntry(entry);
                        console.log('[AD TEST] Entry found:', userEntry?.dn);
                    });

                    searchRes.on('error', (err) => { 
                        console.error('[AD TEST] Search execution error:', err.message);
                        client.destroy(); 
                        res.status(500).json({ message: err.message }); 
                    });

                    searchRes.on('end', () => {
                        if (userEntry) {
                            client.destroy();
                            res.json({ success: true, message: 'Utilisateur trouvé avec succès.', data: userEntry });
                        } else {
                            console.warn(`[AD TEST] No match for ${username}. Probing Base DN ${base_dn}...`);
                            // Diagnostic: list first 5 people in that Base DN to see if it's reachable/correct
                            client.search(base_dn, { filter: '(objectClass=person)', scope: 'sub', sizeLimit: 5 }, (err2, res2) => {
                                let count = 0;
                                if (err2) {
                                    client.destroy();
                                    return res.status(404).json({ message: `Utilisateur non trouvé. Impossible de lister le Base DN: ${err2.message}` });
                                }
                                res2.on('searchEntry', () => { count++; });
                                res2.on('error', (err2_exec) => {
                                    console.error('[AD TEST] Fallback search execution error:', err2_exec.message);
                                    client.destroy();
                                    // Don't crash here, just return the 404 with error info
                                    if (!res.headersSent) {
                                        res.status(404).json({ message: `Utilisateur non trouvé. Erreur diagnostic : ${err2_exec.message}` });
                                    }
                                });
                                res2.on('end', () => {
                                    if (!res.headersSent) {
                                        client.destroy();
                                        const msg = count > 0 
                                            ? `Utilisateur non trouvé, mais ${count}+ personnes sont visibles dans ce Base DN. Vérifiez le login '${username}'.` 
                                            : `Aucune personne trouvée dans '${base_dn}'. Le Base DN est probablement trop restrictif ou incorrect.`;
                                        res.status(404).json({ message: msg });
                                    }
                                });
                            });
                        }
                    });
                });
            });

        } catch (error) {
            console.error('[AD TEST] Unexpected error:', error);
            res.status(500).json({ message: 'Erreur inattendue: ' + error.message });
        }
    });

    // --- Azure AD Settings Routes ---
    app.get('/api/admin/ad/search', authenticateAdmin, async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);

        try {
            const config = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!config || !config.is_enabled) return res.status(400).json({ message: 'Active Directory désactivé' });
            
            // Re-fetch bind password
            if (config.bind_password === '********' || config.bind_password === '••••••••') {
                const dbConfig = await db.get('SELECT bind_password FROM ad_settings WHERE id = 1');
                config.bind_password = dbConfig.bind_password;
            }

            const client = ldap.createClient({
                url: `ldap://${config.host}:${config.port}`,
                connectTimeout: 5000,
                timeout: 5000
            });

            client.on('error', (err) => {
                res.status(500).json({ message: 'LDAP Error: ' + err.message });
            });

            client.bind(config.bind_dn, config.bind_password, (err) => {
                if (err) {
                    client.destroy();
                    return res.status(500).json({ message: 'LDAP Bind Error: ' + err.message });
                }

                const safeQuery = escapeLDAPSearchFilter(q);
                const searchOptions = {
                    filter: `(|(sAMAccountName=*${safeQuery}*)(displayName=*${safeQuery}*)(mail=*${safeQuery}*)(sn=*${safeQuery}*)(givenName=*${safeQuery}*)(cn=*${safeQuery}*))`,
                    scope: 'sub',
                    attributes: ['sAMAccountName', 'displayName', 'mail', 'sn', 'givenName', 'cn'],
                    sizeLimit: 20
                };

                const results = [];
                client.search(config.base_dn, searchOptions, (err, searchRes) => {
                    if (err) {
                        client.destroy();
                        return res.status(500).json({ message: 'Search initiation error: ' + err.message });
                    }

                    searchRes.on('searchEntry', (entry) => {
                        results.push(flattenLDAPEntry(entry));
                    });

                    searchRes.on('error', (err) => {
                        client.destroy();
                        res.status(500).json({ message: 'Search execution error: ' + err.message });
                    });

                    searchRes.on('end', () => {
                        client.destroy();
                        res.json(results);
                    });
                });
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur recherche AD: ' + error.message });
        }
    });

    /**
     * @openapi
     * /api/azure-ad-settings/status:
     *   get:
     *     tags: [Directory - Entra ID (Azure AD)]
     *     summary: Récupère le statut d'activation d'Azure AD
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Statut d'activation récupéré
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 is_enabled:
     *                   type: boolean
     *                   example: true
     */
    app.get('/api/azure-ad-settings/status', async (req, res) => {
        try {
            const settings = await db.get('SELECT is_enabled FROM azure_ad_settings WHERE id = 1');
            res.json({ is_enabled: !!(settings && settings.is_enabled) });
        } catch (error) {
            res.json({ is_enabled: false });
        }
    });

    app.get('/api/azure-ad-settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (settings && settings.client_secret) settings.client_secret = '••••••••';
            res.json(settings);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture paramètres Azure AD' });
        }
    });

    /**
     * @openapi
     * /api/azure-ad-settings:
     *   post:
     *     tags: [Directory - Entra ID (Azure AD)]
     *     summary: Enregistre les paramètres Azure AD
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres enregistrés
     */
    app.post('/api/azure-ad-settings', authenticateAdmin, async (req, res) => {
        const { is_enabled, tenant_id, client_id, client_secret, redirect_uri } = req.body;
        try {
            const isMasked = client_secret === '••••••••' || client_secret === '********';
            const setSql = (!client_secret || isMasked)
                ? 'UPDATE azure_ad_settings SET is_enabled = ?, tenant_id = ?, client_id = ?, redirect_uri = ? WHERE id = 1'
                : 'UPDATE azure_ad_settings SET is_enabled = ?, tenant_id = ?, client_id = ?, client_secret = ?, redirect_uri = ? WHERE id = 1';
            const params = (!client_secret || isMasked)
                ? [is_enabled ? 1 : 0, tenant_id, client_id, redirect_uri]
                : [is_enabled ? 1 : 0, tenant_id, client_id, client_secret, redirect_uri];
            await db.run(setSql, params);
            res.json({ message: 'Paramètres Azure AD enregistrés' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur enregistrement paramètres Azure AD' });
        }
    });

    app.post('/api/azure-ad/test-connection', authenticateAdmin, async (req, res) => {
        let { tenant_id, client_id, client_secret } = req.body;
        try {
            // Support masked secret
            if (client_secret === '••••••••' || client_secret === '********') {
                const dbSettings = await db.get('SELECT client_secret FROM azure_ad_settings WHERE id = 1');
                if (dbSettings) client_secret = dbSettings.client_secret;
            }

            const tokenRes = await axios.post(`https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: client_secret
            }));

            if (tokenRes.data && tokenRes.data.access_token) {
                res.json({ success: true, message: 'Connexion Azure AD réussie (Access Token obtenu).' });
            } else {
                throw new Error('Réponse Microsoft invalide');
            }
        } catch (error) {
            const msg = error.response?.data?.error_description || error.message;
            res.status(400).json({ success: false, message: 'Échec du test Azure AD : ' + msg });
        }
    });

    // --- Azure AD OAuth ---
    app.get('/api/auth/azure/login', async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (!settings || !settings.is_enabled) return res.status(503).json({ message: 'Azure AD désactivé' });
            const params = new URLSearchParams({
                client_id: settings.client_id,
                response_type: 'code',
                redirect_uri: settings.redirect_uri,
                response_mode: 'query',
                scope: 'openid profile email User.Read',
                state: req.query.from || '12345'
            });
            res.redirect(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/authorize?${params.toString()}`);
        } catch (error) {
            res.status(500).json({ message: 'Erreur initialisation Azure AD' });
        }
    });

    app.get('/api/auth/azure/callback', async (req, res) => {
        const { code, state } = req.query;
        try {
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            const tokenRes = await axios.post(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: settings.client_id,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: settings.redirect_uri,
                client_secret: settings.client_secret
            }));
            const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } });
            const azureUser = userRes.data;
            const email = azureUser.mail || azureUser.userPrincipalName;
            const username = email.split('@')[0].toLowerCase();

            // Handle local user mapping or creation
            // For now, redirect with a temporary code or token
            const token = jwt.sign({ username, source: 'azure' }, SECRET_KEY);
            // Redirect back to either the source app or APM frontend
            const target = state && state.startsWith('http') ? state : 'http://localhost:8000';
            res.redirect(`${target}/login?token=${token}`);
        } catch (error) {
            console.error('[AZURE] Callback Error:', error.message);
            res.redirect(`http://localhost:8000/login?error=azure_failed`);
        }
    });

    // --- Azure AD Lookup ---
    app.post('/api/admin/azure/lookup', authenticateAdmin, async (req, res) => {
        const { username } = req.body;
        try {
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            const tokenRes = await axios.post(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({
                client_id: settings.client_id,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default',
                client_secret: settings.client_secret
            }));
            const searchRes = await axios.get('https://graph.microsoft.com/v1.0/users', {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
                params: {
                    '$filter': `startsWith(userPrincipalName, '${username}') or startsWith(displayName, '${username}') or mail eq '${username}'`,
                    '$select': 'displayName,userPrincipalName,mail,jobTitle,department,id',
                    '$top': 1
                }
            });
            if (searchRes.data.value && searchRes.data.value.length > 0) {
                res.json({ success: true, data: searchRes.data.value[0] });
            } else {
                res.json({ success: false, message: 'Aucun utilisateur trouvé' });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
};
