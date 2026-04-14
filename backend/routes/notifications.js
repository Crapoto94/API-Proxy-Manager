const nodemailer = require('nodemailer');
const brevoTransport = require('nodemailer-brevo-transport');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = function(app, db, authenticateAdmin) {

    // --- Helper sendMail (Module scope) ---
    async function sendMail(to, subject, content, options = {}) {
        const s = await db.get('SELECT * FROM mail_settings WHERE id = 1');
        if (!s) {
            console.error('[MAIL SYSTEM] Aucun paramètre trouvé en base (id=1)');
            throw new Error("Paramètres mail non configurés");
        }

        if (s.global_enable === 0 || s.global_enable === false) {
            console.log(`[MAIL SYSTEM] Envoi global désactivé. Mail ignoré pour: ${to}`);
            throw new Error('L\'envoi global de mails est désactivé dans les paramètres.');
        }

        const senderEmail = options.fromEmail || s.sender_email;
        const senderName = options.fromName || s.sender_name || 'APM';
        const useTemplate = options.useTemplate !== undefined ? options.useTemplate : true;

        if (!senderEmail) {
            throw new Error("L'adresse email de l'expéditeur n'est pas configurée");
        }

        let html = content;
        const attachments = [];

        if (useTemplate) {
            let htmlTemplate = (s.template_html || '{{content}}');
            html = htmlTemplate.replace('{{content}}', content);

            // Logo CID handling
            const logoPath = path.join(__dirname, '..', 'magapp_img', 'logo_dsi.png');
            if (html.includes('logo_dsi.png') && fs.existsSync(logoPath)) {
                const cid = 'logo_dsi';
                html = html.split('logo_dsi.png').join(`cid:${cid}`);
                attachments.push({
                    filename: 'logo_dsi.png',
                    content: fs.readFileSync(logoPath).toString('base64'),
                    cid: cid
                });
            }
        }

        // Dynamic Base64 extraction to CID (Always applied to the final HTML)
        const base64Regex = /src=["']data:(image\/[a-zA-Z+]*);base64,([^"']+)["']/g;
        let match;
        let imgCounter = 1;
        while ((match = base64Regex.exec(html)) !== null) {
            const mime = match[1];
            const data = match[2];
            const ext = mime.split('/')[1] || 'png';
            const cid = `img_cid_${imgCounter}`;
            
            html = html.replace(match[0], `src="cid:${cid}"`);
            attachments.push({
                filename: `image_${imgCounter}.${ext}`,
                content: data,
                cid: cid
            });
            imgCounter++;
        }

        // Add custom attachments from options
        if (options.attachments && Array.isArray(options.attachments)) {
            options.attachments.forEach(att => {
                if (att.filename && att.content) {
                    attachments.push({
                        filename: att.filename,
                        content: att.content,
                        cid: att.cid // optional
                    });
                }
            });
        }

        if (s.use_api === 1 || s.use_api === true) {
            const apiKey = (s.api_key || '').trim();
            if (!apiKey) throw new Error("Clé API Brevo manquante");

            const apiUrl = s.api_url || 'https://api.brevo.com/v3/smtp/email';
            const payload = {
                sender: { name: senderName, email: senderEmail },
                to: [{ email: to }],
                subject: subject,
                htmlContent: html
            };

            if (attachments.length > 0) {
                payload.attachment = attachments.map(a => ({
                    content: a.content,
                    name: a.filename,
                    contentId: `<${a.cid}>`
                }));
            }

            const config = {
                headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }
            };

            if (s.proxy_host) {
                config.proxy = { host: s.proxy_host, port: parseInt(s.proxy_port || 80) };
            }

            try {
                console.log(`[MAIL SYSTEM] Envoi via API Brevo à: ${to}`);
                await axios.post(apiUrl, payload, config);
            } catch (apiError) {
                console.error('[MAIL SYSTEM] API Error:', apiError.response?.data || apiError.message);
                throw apiError;
            }
        } else {
            // SMTP
            if (!s.smtp_host) throw new Error("Hôte SMTP non configuré");

            console.log(`[MAIL SYSTEM] Tentative SMTP: ${s.smtp_host}:${s.smtp_port} (User: ${s.smtp_user})`);
            const transporter = nodemailer.createTransport({
                host: s.smtp_host,
                port: s.smtp_port,
                secure: s.smtp_secure === 'ssl',
                auth: { user: s.smtp_user, pass: s.smtp_pass },
                tls: { rejectUnauthorized: false }
            });

            try {
                await transporter.sendMail({
                    from: `"${senderName}" <${senderEmail}>`,
                    to,
                    subject,
                    html,
                    attachments: attachments.map(a => ({
                        filename: a.filename,
                        content: Buffer.from(a.content, 'base64'),
                        cid: a.cid
                    }))
                });
                console.log(`[MAIL SYSTEM] SMTP Mail envoyé avec succès à: ${to}`);
            } catch (smtpError) {
                console.error('[MAIL SYSTEM] SMTP Error:', smtpError);
                throw smtpError;
            }
        }
    }

    // --- Mail Routes ---
    /**
     * @openapi
     * /api/mail-settings:
     *   get:
     *     tags: [Notifications - Mail]
     *     summary: Récupère les paramètres SMTP/Brevo
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres récupérés
     */
    app.get('/api/mail-settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM mail_settings WHERE id = 1');
            res.json(settings);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/mail-settings:
     *   post:
     *     tags: [Notifications - Mail]
     *     summary: Met à jour les paramètres Mail
     *     security: [{ bearerAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *     responses:
     *       200:
     *         description: Mise à jour réussie
     */
    app.post('/api/mail-settings', authenticateAdmin, async (req, res) => {
        const s = req.body;
        try {
            await db.run(`
                UPDATE mail_settings SET 
                    smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, 
                    smtp_secure = ?, proxy_host = ?, proxy_port = ?, 
                    sender_email = ?, sender_name = ?, api_key = ?, template_html = ?,
                    global_enable = ?, use_api = ?, api_url = ?
                WHERE id = 1
            `, [
                s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass,
                s.smtp_secure, s.proxy_host, s.proxy_port,
                s.sender_email, s.sender_name, s.api_key, s.template_html,
                s.global_enable ? 1 : 0, s.use_api ? 1 : 0, s.api_url
            ]);
            res.json({ message: 'Paramètres mail mis à jour' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/send-test-mail:
     *   post:
     *     tags: [Notifications - Mail]
     *     summary: Envoie un email de test
     *     security: [{ bearerAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               to:
     *                 type: string
     *     responses:
     *       200:
     *         description: Mail envoyé
     */
    app.post('/api/send-test-mail', authenticateAdmin, async (req, res) => {
        const { to } = req.body;
        console.log(`[MAIL SYSTEM] Test mail request to: ${to}`);
        try {
            await sendMail(to, "Test d'envoi APM", "<p>Ceci est un mail de test envoyé depuis l'<strong>API Proxy Manager</strong>.</p>", {
                // Posibilité de tester une PJ ici si besoin
            });
            res.json({ message: 'Mail de test envoyé avec succès' });
        } catch (error) {
            console.error('[MAIL SYSTEM] Route error:', error);
            res.status(500).json({ message: error.message });
        }
    });

    // --- Frizbi Helpers ---
    async function frizbiLogin(config) {
        const { api_url, client_id, client_secret } = config;
        try {
            const response = await axios.post(`${api_url}/api/auth/login`, {
                login: client_id,
                password: client_secret
            });
            return response.data.token;
        } catch (error) {
            console.error('[FRIZBI] Login error:', error.response?.data || error.message);
            throw new Error(`Échec de l'authentification Frizbi : ${error.response?.data?.message || error.message}`);
        }
    }

    // --- Frizbi SMS Routes ---
    /**
     * @openapi
     * /api/admin/frizbi-settings:
     *   get:
     *     tags: [Notifications - SMS Frizbi]
     *     summary: Récupère les paramètres Frizbi
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres récupérés
     */
    app.get('/api/admin/frizbi-settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
            if (settings && settings.client_secret) settings.client_secret = '••••••••';
            res.json(settings);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/admin/frizbi-settings:
     *   post:
     *     tags: [Notifications - SMS Frizbi]
     *     summary: Met à jour les paramètres Frizbi
     *     security: [{ bearerAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *     responses:
     *       200:
     *         description: Mise à jour réussie
     */
    app.post('/api/admin/frizbi-settings', authenticateAdmin, async (req, res) => {
        const { is_enabled, api_url, client_id, client_secret, sender_id } = req.body;
        try {
            // Logic similar to AD: don't overwrite if masked
            const dbSettings = await db.get('SELECT client_secret FROM frizbi_settings WHERE id = 1');
            const actualSecret = (client_secret === '••••••••' || !client_secret) && dbSettings
                ? dbSettings.client_secret
                : client_secret;

            await db.run(`
                UPDATE frizbi_settings 
                SET is_enabled = ?, api_url = ?, client_id = ?, client_secret = ?, sender_id = ?
                WHERE id = 1
            `, [is_enabled ? 1 : 0, api_url, client_id, actualSecret, sender_id]);
            res.json({ message: 'Paramètres Frizbi mis à jour' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/admin/frizbi/test-connection:
     *   post:
     *     tags: [Notifications - SMS Frizbi]
     *     summary: Teste la connexion à l'API Frizbi
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Connexion réussie
     */
    app.post('/api/admin/frizbi/test-connection', authenticateAdmin, async (req, res) => {
        let { api_url, client_id, client_secret } = req.body;
        try {
            const dbSettings = await db.get('SELECT client_secret FROM frizbi_settings WHERE id = 1');
            if (client_secret === '••••••••' && dbSettings) client_secret = dbSettings.client_secret;

            if (!api_url || !client_id || !client_secret) {
                throw new Error('URL, Client ID ou Secret manquants');
            }

            const token = await frizbiLogin({ api_url, client_id, client_secret });
            if (token) {
                res.json({ success: true, message: 'Connexion à Frizbi réussie !' });
            } else {
                throw new Error('Aucun token reçu de Frizbi');
            }
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    });

    /**
     * @openapi
     * /api/admin/frizbi/send-test:
     *   post:
     *     tags: [Notifications - SMS Frizbi]
     *     summary: Envoie un SMS de test
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: SMS envoyé
     */
    app.post('/api/admin/frizbi/send-test', authenticateAdmin, async (req, res) => {
        const { mobile } = req.body;
        try {
            const settings = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
            if (!settings || !settings.is_enabled) return res.status(400).json({ message: 'Le service SMS est désactivé' });
            if (!settings.api_url || !settings.client_id || !settings.client_secret) return res.status(400).json({ message: 'Identifiants API ou URL manquants' });
            
            // 1. Login
            const token = await frizbiLogin(settings);

            // 2. Format request based on Frizbi V2 spec
            const payload = {
                customerSmsId: `test_apm_${Date.now()}`,
                title: "Test APM",
                message: "Ceci est un SMS de test envoyé depuis l'API Proxy Manager.",
                customerSenderId: settings.sender_id || 'APM',
                smsContacts: [
                    {
                        customerSmsContactId: `contact_${Date.now()}`,
                        mobile: mobile,
                        firstName: "Test",
                        lastName: "APM"
                    }
                ]
            };

            const response = await axios.post(`${settings.api_url}/api/sms/send`, payload, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });

            if (response.data.status === 'success') {
                res.json({ success: true, message: 'SMS de test envoyé avec succès !' });
            } else {
                throw new Error(response.data.message || 'Erreur lors de l’envoi');
            }
        } catch (error) {
            console.error('[FRIZBI] Send error:', error.response?.data || error.message);
            res.status(500).json({ success: false, message: error.response?.data?.message || error.message });
        }
    });

    // We can also export sendMail if other modules need it
    app.locals.sendMail = sendMail;
};
