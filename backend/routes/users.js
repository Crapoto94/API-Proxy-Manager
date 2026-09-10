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
            const users = await db.all('SELECT id, username, email, role, is_ad FROM users');
            res.json(users);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    // --- ROLES API ---
    router.get('/roles', authenticateAdmin, async (req, res) => {
        try {
            const roles = await db.all('SELECT * FROM roles');
            // Parse permissions back to array
            const parsedRoles = roles.map(r => ({
                ...r,
                permissions: JSON.parse(r.permissions || '[]')
            }));
            res.json(parsedRoles);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    router.post('/roles', authenticateAdmin, async (req, res) => {
        const { name, permissions } = req.body;
        if (!name) return res.status(400).json({ message: 'Le nom du rôle est requis' });
        try {
            const result = await db.run(
                'INSERT INTO roles (name, permissions) VALUES (?, ?)',
                [name, JSON.stringify(permissions || [])]
            );
            res.status(201).json({ id: result.lastID, name, permissions: permissions || [] });
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ message: 'Ce rôle existe déjà' });
            }
            res.status(500).json({ message: error.message });
        }
    });

    router.put('/roles/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        const { name, permissions } = req.body;
        try {
            await db.run(
                'UPDATE roles SET name = ?, permissions = ? WHERE id = ?',
                [name, JSON.stringify(permissions || []), id]
            );
            res.json({ message: 'Rôle mis à jour' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    router.delete('/roles/:id', authenticateAdmin, async (req, res) => {
        const { id } = req.params;
        try {
            await db.run('DELETE FROM roles WHERE id = ?', [id]);
            res.json({ message: 'Rôle supprimé' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
    // -----------------

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
        const { username, password, email, role, is_ad } = req.body;
        
        // Mode local : mot de passe requis. Mode AD : mot de passe facultatif
        const isAdUser = is_ad ? 1 : 0;
        if (!username || (!password && !isAdUser)) {
            return res.status(400).json({ message: 'Nom d’utilisateur et mot de passe requis' });
        }

        try {
            const hashedPassword = password ? await bcrypt.hash(password, 10) : '';
            const result = await db.run(
                'INSERT INTO users (username, password, email, role, is_ad) VALUES (?, ?, ?, ?, ?)',
                [username, hashedPassword, email || '', role || 'user', isAdUser]
            );
            res.status(201).json({ id: result.lastID, username, email, role, is_ad: isAdUser });
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
        const { username, email, role, password, is_ad } = req.body;
        const isAdUser = is_ad !== undefined ? (is_ad ? 1 : 0) : null;

        try {
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                if (isAdUser !== null) {
                    await db.run(
                        'UPDATE users SET username = ?, email = ?, role = ?, password = ?, is_ad = ? WHERE id = ?',
                        [username, email, role, hashedPassword, isAdUser, id]
                    );
                } else {
                    await db.run(
                        'UPDATE users SET username = ?, email = ?, role = ?, password = ? WHERE id = ?',
                        [username, email, role, hashedPassword, id]
                    );
                }
            } else {
                if (isAdUser !== null) {
                    await db.run(
                        'UPDATE users SET username = ?, email = ?, role = ?, is_ad = ? WHERE id = ?',
                        [username, email, role, isAdUser, id]
                    );
                } else {
                    await db.run(
                        'UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?',
                        [username, email, role, id]
                    );
                }
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
