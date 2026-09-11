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
app.use(express.json({ limit: '10mb' }));
app.use('/magapp_img', express.static(path.join(__dirname, 'magapp_img')));

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
        let { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Identifiants manquants' });
        }
        username = String(username).trim();
        // Comme AppDSI (server.js) : si l'utilisateur saisit son adresse mail plutôt que
        // son identifiant AD nu (réflexe naturel), on retire le suffixe avant la recherche
        // sAMAccountName — sinon la recherche AD ne trouve rien (identifiants pourtant
        // corrects) et la connexion échoue en 401.
        username = username.replace(/@ivry94\.fr$/i, '');

        // Comparaison insensible à la casse ET aux accents faite côté JS : le LOWER()
        // de SQLite ne sait pas mettre en minuscule les lettres accentuées (pas d'ICU
        // par défaut — LOWER('FOURBÉ') reste 'fourbÉ'), ce qui bloquait en 401 les
        // agents dont le nom/prénom contient un accent (ex. Valérie Fourbé) dès que la
        // casse de la lettre accentuée différait entre la saisie et la valeur stockée.
        const normalize = (s) => String(s || '').trim().toLowerCase().normalize('NFC');
        const targetUsername = normalize(username);

        const issueToken = async (user) => {
            let permissions = [];
            if (user.role === 'admin') {
                // Les admins ont accès à tout, on laissera le frontend gérer, mais mettons ["*"]
                permissions = ["*"];
            } else {
                const roleObj = await db.get('SELECT permissions FROM roles WHERE name = ?', [user.role]);
                if (roleObj && roleObj.permissions) {
                    try { permissions = JSON.parse(roleObj.permissions); } catch (e) {}
                }
            }
            const token = jwt.sign({
                id: user.id,
                username: user.username,
                role: user.role,
                permissions,
                is_ad: user.is_ad
            }, SECRET_KEY);
            return { token, user: { id: user.id, username: user.username, role: user.role, permissions, is_ad: user.is_ad } };
        };

        try {
            const allUsers = await db.all('SELECT * FROM users');
            let user = allUsers.find((u) => normalize(u.username) === targetUsername);

            // 1. Authentification AD en priorité — même logique que AppDSI (qui fonctionne
            //    pour les comptes accentués) : on tente l'AD dès qu'il est actif, SANS exiger
            //    qu'un compte local "is_ad" ait été créé au préalable. C'est ce prérequis
            //    manquant (aucune ligne locale pour l'agent) qui provoquait un 401
            //    "Identifiants invalides" alors que les identifiants AD étaient corrects : la
            //    recherche locale échouait avant même d'essayer l'AD. Le compte "admin" local
            //    reste toujours vérifié en local, pour ne jamais se retrouver bloqué dehors si
            //    l'AD est en panne.
            if (targetUsername !== 'admin') {
                const adConfig = await db.get('SELECT * FROM ad_settings WHERE id = 1');
                if (adConfig && adConfig.is_enabled && app.locals.authenticateAD) {
                    if (adConfig.bind_password === '********' || adConfig.bind_password === '••••••••') {
                        const dbConfig = await db.get('SELECT bind_password FROM ad_settings WHERE id = 1');
                        adConfig.bind_password = dbConfig.bind_password;
                    }

                    let adUser = null;
                    try {
                        adUser = await app.locals.authenticateAD(username, password, adConfig);
                    } catch (adErr) {
                        console.error('[AUTH] Erreur AD pendant le login:', adErr.message);
                    }

                    if (adUser) {
                        if (!user) {
                            // Auto-provisionnement au premier login AD réussi (comme AppDSI) :
                            // plus besoin qu'un admin crée le compte local à la main au préalable.
                            const result = await db.run(
                                'INSERT INTO users (username, password, email, role, is_ad) VALUES (?, ?, ?, ?, 1)',
                                [username, '', adUser.mail || adUser.email || '', 'user']
                            );
                            user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
                        } else if (!user.is_ad) {
                            await db.run('UPDATE users SET is_ad = 1 WHERE id = ?', [user.id]);
                            user.is_ad = 1;
                        }
                        return res.json(await issueToken(user));
                    }
                }
            }

            // 2. Authentification locale (compte admin, comptes non-AD, ou repli si AD
            //    désactivé/en échec — ex. un compte local créé avec is_ad=0)
            if (!user || !user.password) {
                return res.status(401).json({ message: 'Identifiants invalides' });
            }
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return res.status(401).json({ message: 'Identifiants invalides' });
            }

            res.json(await issueToken(user));
        } catch (error) {
            console.error('[AUTH ERROR]', error);
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
    require('./routes/ai')(app, db, authenticateAdmin);
    require('./routes/proxy')(app, db, authenticateAdmin);
    require('./routes/o365')(app, db, authenticateAdmin);

    app.listen(PORT, () => {
        console.log(`[APM] Backend started on http://localhost:${PORT}`);
    });

    // --- AI health check scheduler ---
    // Teste rapidement tous les modèles IA configurés toutes les heures (comme demandé),
    // pour que /api/v1/ai/models puisse renvoyer un statut sans re-tester en direct à
    // chaque appel. Premier passage peu après le démarrage pour ne pas partir avec un
    // statut "jamais testé", puis un passage par heure — même esprit que le
    // monitoring_scheduler_loop d'analyse-mail, sans dépendance supplémentaire (setInterval).
    setTimeout(() => {
        app.locals.testAllModels().catch(e => console.error('[AI HEALTHCHECK] Error:', e.message));
    }, 10000);
    setInterval(() => {
        app.locals.testAllModels().catch(e => console.error('[AI HEALTHCHECK] Error:', e.message));
    }, 60 * 60 * 1000);
}

startServer().catch(err => {
    console.error('Failed to start APM server:', err);
});
