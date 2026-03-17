const axios = require('axios');

module.exports = function(app, db, authenticateAdmin) {

    // GLPI Settings API
    /**
     * @openapi
     * /api/glpi-settings:
     *   get:
     *     tags: [Monitoring - GLPI]
     *     summary: Récupère les paramètres GLPI
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres récupérés
     */
    app.get('/api/glpi-settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            res.json(settings || { url: '', app_token: '', user_token: '', is_enabled: 0 });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture paramètres GLPI' });
        }
    });

    app.post('/api/glpi-settings', authenticateAdmin, async (req, res) => {
        const { url, app_token, user_token, login, password, is_enabled } = req.body;
        try {
            const exists = await db.get('SELECT id FROM glpi_settings WHERE id = 1');
            if (exists) {
                await db.run(
                    'UPDATE glpi_settings SET url = ?, app_token = ?, user_token = ?, login = ?, password = ?, is_enabled = ? WHERE id = 1',
                    [url, app_token, user_token, login, password, is_enabled ? 1 : 0]
                );
            } else {
                await db.run(
                    'INSERT INTO glpi_settings (id, url, app_token, user_token, login, password, is_enabled) VALUES (1, ?, ?, ?, ?, ?, ?)',
                    [url, app_token, user_token, login, password, is_enabled ? 1 : 0]
                );
            }
            res.json({ message: 'Paramètres GLPI enregistrés' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur enregistrement paramètres GLPI' });
        }
    });

    /**
     * @openapi
     * /api/glpi/test-connection:
     *   post:
     *     tags: [Monitoring - GLPI]
     *     summary: Teste la connexion à l'API GLPI
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Connexion réussie
     */
    app.post('/api/glpi/test-connection', authenticateAdmin, async (req, res) => {
        let { url, app_token, user_token, login, password } = req.body;
        try {
            url = (url || '').trim();
            app_token = (app_token || '').trim();
            user_token = (user_token || '').trim();
            login = (login || '').trim();
            password = (password || '').trim();

            if (url && !url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const commonHeaders = {
                'App-Token': app_token,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = '';
            if (login && password) {
                authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
            } else {
                authHeader = `user_token ${user_token}`;
            }

            const response = await axios.get(`${url}/initSession`, {
                headers: {
                    ...commonHeaders,
                    'Authorization': authHeader
                },
                timeout: 10000
            });

            if (response.data && response.data.session_token) {
                await axios.get(`${url}/killSession`, {
                    headers: {
                        ...commonHeaders,
                        'Session-Token': response.data.session_token
                    }
                });
                res.json({ success: true, message: 'Connexion GLPI réussie !' });
            } else {
                res.status(400).json({ success: false, message: 'Réponse invalide de GLPI' });
            }
        } catch (error) {
            const msg = error.response?.data?.[1] || error.response?.data?.message || error.message;
            res.status(500).json({ success: false, message: `Erreur de connexion : ${msg}` });
        }
    });

    app.get('/api/glpi/tickets-count', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) {
                return res.status(400).json({ message: 'Paramètres GLPI non configurés' });
            }

            let url = settings.url.trim();
            let app_token = (settings.app_token || '').trim();
            let user_token = (settings.user_token || '').trim();
            let login = (settings.login || '').trim();
            let password = (settings.password || '').trim();

            if (!url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const commonHeaders = {
                'App-Token': app_token,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = '';
            if (login && password) {
                authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
            } else {
                authHeader = `user_token ${user_token}`;
            }

            const sessionRes = await axios.get(`${url}/initSession`, {
                headers: {
                    ...commonHeaders,
                    'Authorization': authHeader
                },
                timeout: 10000
            });

            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) {
                return res.status(401).json({ message: 'Impossible d\'initier la session GLPI.' });
            }

            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`;
            const ticketsRes = await axios.get(searchUrl, { headers: commonHeaders });

            let count = 0;
            if (ticketsRes.data && ticketsRes.data.totalcount !== undefined) {
                count = parseInt(ticketsRes.data.totalcount, 10) || 0;
            }
            res.json({ count });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.get('/api/glpi/recent-tickets', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

            let url = settings.url.trim();
            if (!url.includes('apirest.php')) url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;

            const commonHeaders = { 'App-Token': settings.app_token, 'Accept': 'application/json' };
            const authHeader = settings.login && settings.password 
                ? `Basic ${Buffer.from(`${settings.login}:${settings.password}`).toString('base64')}`
                : `user_token ${settings.user_token}`;

            const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
            const sessionToken = sessionRes.data?.session_token;
            
            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            // On récupère les 10 derniers tickets
            const ticketsRes = await axios.get(`${url}/Ticket?session_token=${sessionToken}&range=0-9&order=DESC&sort=date_mod`, { headers: commonHeaders });
            res.json({ tickets: Array.isArray(ticketsRes.data) ? ticketsRes.data : [] });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
};
