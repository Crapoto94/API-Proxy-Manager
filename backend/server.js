require('dotenv').config();
const express = require('express');

const cors = require('cors');
const path = require('path');
const setupDb = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = 8001;
const SECRET_KEY = 'votre_cle_secrete_ici'; // À sécuriser via .env plus tard

// Swagger Configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API Proxy Manager (APM) Documentation',
            version: '1.0.0',
            description: 'Documentation interactive des API du portail APM (Mail, SMS, AD, Oracle, etc.)',
            contact: {
                name: 'DSI Hub Support'
            },
        },
        servers: [
            {
                url: process.env.BACKEND_URL || 'http://localhost:8001',
                description: 'Serveur Backend API'
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-KEY'
                }
            }
        },
        security: [
            { bearerAuth: [] },
            { ApiKeyAuth: [] }
        ]
    },
    apis: [path.join(__dirname, 'server.js'), path.join(__dirname, 'routes', '*.js')],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

app.use(cors());
app.use(express.json());

// Middleware d'authentification simple (à affiner)
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.status(403).json({ message: 'Token invalide ou expiré' });
            if (user.role !== 'admin') return res.status(403).json({ message: 'Droits insuffisants' });
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: 'Authentification requise' });
    }
};

let db;

async function startServer() {
    db = await setupDb();
    
    // --- DATA RECOVERY SCRIPT (from DsiHUB) ---
    try {
        const dsiHubDbPath = path.resolve(__dirname, '../../DsiHUB/backend/database.sqlite');
        const fs = require('fs');
        if (fs.existsSync(dsiHubDbPath)) {
            const sqlite3 = require('sqlite3').verbose();
            const { open } = require('sqlite');
            const dsiHubDb = await open({
                filename: dsiHubDbPath,
                driver: sqlite3.Database
            });

            const importTable = async (tableName) => {
                const count = await db.get(`SELECT COUNT(*) as c FROM ${tableName}`);
                if (count.c === 0) {
                    console.log(`[APM INIT] Importing ${tableName} from DsiHUB...`);
                    try {
                        const rows = await dsiHubDb.all(`SELECT * FROM ${tableName}`);
                        if (rows.length > 0) {
                            const keys = Object.keys(rows[0]);
                            const placeholders = keys.map(() => '?').join(',');
                            const stmt = await db.prepare(`INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`);
                            for (const row of rows) {
                                await stmt.run(Object.values(row));
                            }
                            await stmt.finalize();
                            console.log(`[APM INIT] ${rows.length} rows imported into ${tableName}`);
                        }
                    } catch (e) {
                         console.warn(`[APM INIT] Failed to import ${tableName}: ${e.message}`);
                    }
                }
            };

            await importTable('ad_settings');
            await importTable('azure_ad_settings');
            await importTable('oracle_settings');
            await importTable('glpi_settings');
            await importTable('oracle_sync_config');
            await importTable('mail_settings');
            await importTable('frizbi_settings');
            await importTable('messages');
            await importTable('email_templates');
            
            await dsiHubDb.close();
        }
    } catch (e) {
        console.error('[APM INIT] Data recovery error:', e.message);
    }
    // ------------------------------------------

    // --- ENSURE ADMIN USER ---
    try {
        const hashedPassword = await bcrypt.hash('admin', 10);
        await db.run('INSERT OR IGNORE INTO users (username, password, role, email) VALUES (?, ?, ?, ?)', 
            ['admin', hashedPassword, 'admin', 'admin@dsihub.local']);
        // Force update if it already exists but with wrong password
        await db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, 'admin']);
        console.log('[APM] Admin user reset to admin/admin');
    } catch (e) {
        console.error('[APM] Admin reset error:', e.message);
    }
    // --------------------------

    // --- SWAGGER ROUTES ---
    /**
     * @openapi
     * /api/status:
     *   get:
     *     tags: [System]
     *     summary: Vérifie l'état de l'API APM
     *     responses:
     *       200:
     *         description: API opérationnelle
     */
    app.get('/api/status', (req, res) => {
        res.json({ status: 'APM Core API is running', version: '1.0.0' });
    });

    /**
     * @openapi
     * /api-docs:
     *   get:
     *     tags: [System]
     *     summary: Documentation Swagger UI
     */
    app.use('/api-docs', swaggerUi.serve, (req, res) => {
        const dynamicDocs = JSON.parse(JSON.stringify(swaggerDocs));
        const host = req.get('host');
        const protocol = req.protocol; 
        
        // Priorité : 1. Query Param ?url= | 2. ENV BACKEND_URL | 3. Host actuel
        const serverUrl = req.query.url || process.env.BACKEND_URL || `${protocol}://${host}`;
        
        dynamicDocs.servers = [
            {
                url: serverUrl,
                description: 'Backend API'
            }
        ];
        swaggerUi.setup(dynamicDocs)(req, res);
    });

    /**
     * @openapi
     * /swagger.json:
     *   get:
     *     tags: [System]
     *     summary: Récupère la spécification OpenAPI brute (JSON)
     */
    app.get('/swagger.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerDocs);
    });

    // Login (pour l'admin APM)
    /**
     * @openapi
     * /api/auth/login:
     *   post:
     *     tags: [Auth]
     *     summary: Authentification Administrateur APM
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
     *     responses:
     *       200:
     *         description: Authentification réussie
     *       401:
     *         description: Identifiants invalides
     */
    app.post('/api/auth/login', async (req, res) => {
        const { username, password } = req.body;
        try {
            const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
            if (user && await bcrypt.compare(password, user.password)) {
                const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
                res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
            } else {
                res.status(401).json({ message: 'Identifiants invalides' });
            }
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    // Dashboard Stats API
    app.get('/api/dashboard/stats', authenticateAdmin, async (req, res) => {
        try {
            const logStats = await db.get('SELECT COUNT(*) as c FROM proxy_logs');
            const appCount = await db.get('SELECT COUNT(*) as c FROM external_apps');
            
            const stats = {
                requests: logStats.c,
                alerts: 0,
                latency: '42ms',
                apps: appCount.c,
                services: [
                    { name: 'Active Directory', status: 'online', type: 'Auth' },
                    { name: 'SMTP Mail', status: 'online', type: 'Notification' },
                    { name: 'Frizbi SMS', status: 'online', type: 'Notification' },
                    { name: 'Oracle Production', status: 'online', type: 'Database' }
                ]
            };
            
            // Real check for AD
            const ad = await db.get('SELECT is_enabled FROM ad_settings WHERE id = 1');
            stats.services[0].status = ad?.is_enabled ? 'online' : 'offline';
            
            // Real check for Frizbi
            const frizbi = await db.get('SELECT is_enabled FROM frizbi_settings WHERE id = 1');
            stats.services[2].status = frizbi?.is_enabled ? 'online' : 'offline';

            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    // Importation des futurs modules de routes ici...
    require('./routes/content')(app, db, authenticateAdmin);
    require('./routes/notifications')(app, db, authenticateAdmin);
    require('./routes/directory')(app, db, authenticateAdmin, SECRET_KEY);
    require('./routes/database')(app, db, authenticateAdmin);
    require('./routes/glpi')(app, db, authenticateAdmin);
    require('./routes/users')(app, db, authenticateAdmin);
    require('./routes/proxy')(app, db, authenticateAdmin);
    require('./routes/o365')(app, db, authenticateAdmin);
    
    app.listen(PORT, () => {
        console.log(`[APM] Backend started on http://localhost:${PORT}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start APM server:', err);
});
