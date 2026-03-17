module.exports = function(app, db, authenticateAdmin) {
    // Email Templates API
    app.get('/api/email-templates', authenticateAdmin, async (req, res) => {
        try {
            const templates = await db.all('SELECT id, name, subject, content FROM email_templates');
            res.json(templates);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des modèles', error: error.message });
        }
    });

    app.post('/api/email-templates', authenticateAdmin, async (req, res) => {
        const { name, subject, content } = req.body;
        try {
            await db.run('INSERT INTO email_templates (name, subject, content) VALUES (?, ?, ?)', [name, subject, content]);
            res.json({ message: 'Modèle créé avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la création du modèle', error: error.message });
        }
    });

    app.put('/api/email-templates/:id', authenticateAdmin, async (req, res) => {
        const { name, subject, content } = req.body;
        try {
            await db.run('UPDATE email_templates SET name = ?, subject = ?, content = ? WHERE id = ?', [name, subject, content, req.params.id]);
            res.json({ message: 'Modèle mis à jour avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la mise à jour du modèle', error: error.message });
        }
    });

    app.delete('/api/email-templates/:id', authenticateAdmin, async (req, res) => {
        try {
            await db.run('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
            res.json({ message: 'Modèle supprimé avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la suppression du modèle', error: error.message });
        }
    });

    // Messages API
    app.get('/api/messages', authenticateAdmin, async (req, res) => {
        try {
            const messages = await db.all('SELECT * FROM messages ORDER BY code ASC');
            res.json(messages);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des messages', error: error.message });
        }
    });

    app.get('/api/messages/code/:code', async (req, res) => {
        try {
            const message = await db.get('SELECT * FROM messages WHERE code = ?', [req.params.code]);
            res.json(message || { content: '' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération du message', error: error.message });
        }
    });

    app.post('/api/messages', authenticateAdmin, async (req, res) => {
        const { code, libelle, content } = req.body;
        try {
            await db.run('INSERT INTO messages (code, libelle, content) VALUES (?, ?, ?)', [code, libelle, content]);
            res.json({ message: 'Message créé avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la création du message', error: error.message });
        }
    });

    app.put('/api/messages/:id', authenticateAdmin, async (req, res) => {
        const { code, libelle, content } = req.body;
        try {
            await db.run('UPDATE messages SET code = ?, libelle = ?, content = ? WHERE id = ?', [code, libelle, content, req.params.id]);
            res.json({ message: 'Message mis à jour avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la mise à jour du message', error: error.message });
        }
    });

    app.delete('/api/messages/:id', authenticateAdmin, async (req, res) => {
        try {
            await db.run('DELETE FROM messages WHERE id = ?', [req.params.id]);
            res.json({ message: 'Message supprimé avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la suppression du message', error: error.message });
        }
    });
};
