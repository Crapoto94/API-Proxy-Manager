const express = require('express');
const bcrypt = require('bcryptjs');

/**
 * @openapi
 * tags:
 *   name: Users
 *   description: Gestion des utilisateurs de la console APM
 */

module.exports = (app, db, authenticateAdmin) => {
    const router = express.Router();

    /**
     * @openapi
     * /api/users:
     *   get:
     *     tags: [Users]
     *     summary: Liste tous les utilisateurs
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Liste des utilisateurs
     */
    router.get('/', authenticateAdmin, async (req, res) => {
        try {
            const users = await db.all('SELECT id, username, email, role FROM users');
            res.json(users);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/users:
     *   post:
     *     tags: [Users]
     *     summary: Créer un nouvel utilisateur
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               username:
     *                 type: string
     *               password:
     *                 type: string
     *               email:
     *                 type: string
     *               role:
     *                 type: string
     *     responses:
     *       201:
     *         description: Utilisateur créé
     */
    router.post('/', authenticateAdmin, async (req, res) => {
        const { username, password, email, role } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Nom d’utilisateur et mot de passe requis' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const result = await db.run(
                'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, email || '', role || 'user']
            );
            res.status(201).json({ id: result.lastID, username, email, role });
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ message: 'Cet utilisateur existe déjà' });
            }
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/users/{id}:
     *   put:
     *     tags: [Users]
     *     summary: Modifier un utilisateur
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Utilisateur mis à jour
     */
    router.put('/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const { username, email, role, password } = req.body;

        try {
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await db.run(
                    'UPDATE users SET username = ?, email = ?, role = ?, password = ? WHERE id = ?',
                    [username, email, role, hashedPassword, id]
                );
            } else {
                await db.run(
                    'UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?',
                    [username, email, role, id]
                );
            }
            res.json({ message: 'Utilisateur mis à jour' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/users/{id}:
     *   delete:
     *     tags: [Users]
     *     summary: Supprimer un utilisateur
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Utilisateur supprimé
     */
    router.delete('/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        
        // Empêcher la suppression du compte admin principal si c'est le dernier
        if (id == 1) {
            return res.status(403).json({ message: 'Impossible de supprimer le compte administrateur principal' });
        }

        try {
            await db.run('DELETE FROM users WHERE id = ?', [id]);
            res.json({ message: 'Utilisateur supprimé' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.use('/api/users', router);
};
