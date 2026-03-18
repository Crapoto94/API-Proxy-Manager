const express = require('express');
const axios = require('axios');

module.exports = (app, db, authenticateAdmin) => {
    const router = express.Router();

    // Helper: Get Graph API Token
    async function getGraphToken(settings) {
        if (!settings || !settings.tenant_id || !settings.client_id || !settings.client_secret) {
            throw new Error('O365 configuration is incomplete');
        }

        const url = `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`;
        const params = new URLSearchParams();
        params.append('client_id', settings.client_id);
        params.append('scope', 'https://graph.microsoft.com/.default');
        params.append('client_secret', settings.client_secret);
        params.append('grant_type', 'client_credentials');

        const response = await axios.post(url, params);
        return response.data.access_token;
    }

    /**
     * @openapi
     * /api/o365/settings:
     *   get:
     *     tags: [O365]
     *     summary: Récupère les paramètres O365
     */
    router.get('/settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM o365_settings WHERE id = 1');
            res.json(settings || {});
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/o365/settings:
     *   put:
     *     tags: [O365]
     *     summary: Sauvegarde les paramètres O365
     */
    router.put('/settings', authenticateAdmin, async (req, res) => {
        const { tenant_id, client_id, client_secret, mailbox, is_enabled } = req.body;
        try {
            await db.run(
                `UPDATE o365_settings SET 
                tenant_id = ?, 
                client_id = ?, 
                client_secret = ?, 
                mailbox = ?, 
                is_enabled = ? 
                WHERE id = 1`,
                [tenant_id, client_id, client_secret, mailbox, is_enabled ? 1 : 0]
            );
            res.json({ message: 'Settings updated' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/o365/test:
     *   post:
     *     tags: [O365]
     *     summary: Teste la connexion Microsoft Graph
     */
    router.post('/test', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM o365_settings WHERE id = 1');
            const token = await getGraphToken(settings);
            
            // Test specifically for mailbox access since Mail.Read is the core requirement
            // Using /messages?$top=1 avoids needing User.Read.All if Mail.Read(Basic) is granted
            await axios.get(`https://graph.microsoft.com/v1.0/users/${settings.mailbox}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { '$top': 1 }
            });

            res.json({ success: true, message: 'Connexion réussie : Accès à la boîte mail confirmé' });
        } catch (error) {
            const errorDetails = error.response?.data?.error || error.response?.data || error.message;
            console.error('[O365 TEST ERROR]:', JSON.stringify(errorDetails, null, 2));
            
            res.status(200).json({ 
                success: false, 
                error: errorDetails.message || errorDetails.error_description || (typeof errorDetails === 'string' ? errorDetails : 'Erreur inconnue')
            });
        }
    });

    /**
     * @openapi
     * /api/o365/messages:
     *   get:
     *     tags: [O365]
     *     summary: Liste les messages de la boîte mail
     */
    router.get('/messages', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM o365_settings WHERE id = 1 AND is_enabled = 1');
            if (!settings) return res.status(503).json({ error: 'O365 service disabled' });

            const token = await getGraphToken(settings);
            const response = await axios.get(`https://graph.microsoft.com/v1.0/users/${settings.mailbox}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    '$select': 'id,subject,receivedDateTime,from,isRead',
                    '$orderby': 'receivedDateTime desc',
                    '$top': 50
                }
            });

            res.json(response.data.value);
        } catch (error) {
            console.error('[O365 MESSAGES ERROR]:', error.response?.data || error.message);
            res.status(500).json({ error: error.response?.data?.message || error.message });
        }
    });

    /**
     * @openapi
     * /api/o365/messages/{id}:
     *   get:
     *     tags: [O365]
     *     summary: Récupère un message spécifique
     */
    router.get('/messages/:id', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM o365_settings WHERE id = 1 AND is_enabled = 1');
            if (!settings) return res.status(503).json({ error: 'O365 service disabled' });

            const token = await getGraphToken(settings);
            const response = await axios.get(`https://graph.microsoft.com/v1.0/users/${settings.mailbox}/messages/${req.params.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            res.json(response.data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/o365/harvest:
     *   post:
     *     tags: [O365]
     *     summary: Moissonne les derniers messages et les stocke en local
     */
    router.post('/harvest', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM o365_settings WHERE id = 1 AND is_enabled = 1');
            if (!settings) return res.status(503).json({ error: 'O365 service disabled' });

            const token = await getGraphToken(settings);
            const response = await axios.get(`https://graph.microsoft.com/v1.0/users/${settings.mailbox}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { '$top': 50, '$select': 'id,subject,receivedDateTime,from,bodyPreview,isRead' }
            });

            const messages = response.data.value;
            let count = 0;

            for (const msg of messages) {
                const existing = await db.get('SELECT id FROM o365_messages WHERE id = ?', [msg.id]);
                if (!existing) {
                    await db.run(
                        'INSERT INTO o365_messages (id, subject, from_name, from_email, received_at, body_preview) VALUES (?, ?, ?, ?, ?, ?)',
                        [
                            msg.id,
                            msg.subject,
                            msg.from?.emailAddress?.name || 'Inconnu',
                            msg.from?.emailAddress?.address || '',
                            msg.receivedDateTime,
                            msg.bodyPreview
                        ]
                    );
                    count++;
                }
            }

            res.json({ success: true, message: `${count} nouveaux messages moissonnés`, total_harvested: count });
        } catch (error) {
            console.error('[O365 HARVEST ERROR]:', error.response?.data || error.message);
            res.status(500).json({ error: error.message });
        }
    });

    app.use('/api/o365', router);
};
