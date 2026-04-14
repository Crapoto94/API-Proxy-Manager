const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function setupDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    // Ensure core tables exist (in case of fresh start)
    // Most tables will already be there from the copy
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            permissions TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            email TEXT,
            is_ad INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            libelle TEXT,
            content TEXT
        );

        CREATE TABLE IF NOT EXISTS email_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            subject TEXT,
            content TEXT
        );

        CREATE TABLE IF NOT EXISTS mail_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            smtp_host TEXT,
            smtp_port INTEGER,
            smtp_user TEXT,
            smtp_pass TEXT,
            smtp_secure TEXT,
            sender_name TEXT,
            sender_email TEXT,
            global_enable INTEGER DEFAULT 1,
            template_html TEXT,
            use_api INTEGER DEFAULT 0,
            api_key TEXT,
            api_url TEXT,
            proxy_host TEXT,
            proxy_port TEXT,
            footer_line1 TEXT,
            footer_line2 TEXT,
            footer_line3 TEXT,
            footer_color TEXT
        );

        CREATE TABLE IF NOT EXISTS frizbi_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            api_url TEXT,
            client_id TEXT,
            client_secret TEXT,
            sender_id TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ad_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            host TEXT,
            port INTEGER,
            bind_dn TEXT,
            bind_password TEXT,
            base_dn TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS azure_ad_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            client_id TEXT,
            client_secret TEXT,
            tenant_id TEXT,
            redirect_uri TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS oracle_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT UNIQUE,
            host TEXT,
            port INTEGER,
            service_name TEXT,
            connectString TEXT,
            username TEXT,
            password TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS oracle_sync_config (
            type TEXT PRIMARY KEY,
            table_name TEXT,
            columns TEXT,
            last_sync TEXT
        );

        CREATE TABLE IF NOT EXISTS rh_sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            level TEXT,
            message TEXT,
            details TEXT
        );

        CREATE TABLE IF NOT EXISTS external_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            api_key TEXT UNIQUE,
            is_active INTEGER DEFAULT 1,
            authorized_routes TEXT DEFAULT '["*"]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS proxy_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER,
            endpoint TEXT,
            method TEXT,
            query_params TEXT,
            payload TEXT,
            status INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(app_id) REFERENCES external_apps(id)
        );

        CREATE TABLE IF NOT EXISTS security_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            trust_proxies_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS trusted_ips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT UNIQUE,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS o365_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            tenant_id TEXT,
            client_id TEXT,
            client_secret TEXT,
            mailbox TEXT,
            is_enabled INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS o365_messages (
            id TEXT PRIMARY KEY,
            subject TEXT,
            from_name TEXT,
            from_email TEXT,
            received_at DATETIME,
            body_preview TEXT,
            is_processed INTEGER DEFAULT 0,
            harvested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS glpi_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            url TEXT,
            app_token TEXT,
            user_token TEXT,
            login TEXT,
            password TEXT,
            is_enabled INTEGER DEFAULT 0
        );
    `);

    // Migration to add authorized_routes if it doesn't exist (for existing databases)
    try {
        await db.run('ALTER TABLE external_apps ADD COLUMN authorized_routes TEXT DEFAULT \'["*"]\'');
    } catch (e) {
        // Column probably already exists
    }

    try {
        await db.run('ALTER TABLE users ADD COLUMN is_ad INTEGER DEFAULT 0');
    } catch (e) {
        // Column probably already exists
    }

    try {
        await db.run('ALTER TABLE proxy_logs ADD COLUMN response_payload TEXT');
        console.log('[DB] Colonne response_payload ajoutée à proxy_logs');
    } catch (e) {
        // Column probably already exists
    }

    // Insert default mail settings if not exists
    await db.run('INSERT OR IGNORE INTO mail_settings (id) VALUES (1)');
    await db.run('INSERT OR IGNORE INTO frizbi_settings (id) VALUES (1)');
    await db.run('INSERT OR IGNORE INTO ad_settings (id) VALUES (1)');
    await db.run('INSERT OR IGNORE INTO azure_ad_settings (id) VALUES (1)');
    await db.run('INSERT OR IGNORE INTO oracle_settings (type) VALUES (\'RH\')');
    await db.run('INSERT OR IGNORE INTO oracle_settings (type) VALUES (\'FINANCES\')');
    await db.run('INSERT OR IGNORE INTO security_settings (id) VALUES (1)');
    await db.run('INSERT OR IGNORE INTO o365_settings (id) VALUES (1)');
    await db.run('INSERT OR IGNORE INTO glpi_settings (id) VALUES (1)');

    // Seed default admin user if no users exist
    const userCount = await db.get('SELECT COUNT(*) as c FROM users');
    if (userCount.c === 0) {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('admin', 10);
        await db.run('INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)', 
            ['admin', hashedPassword, 'admin', 'admin@dsihub.local']);
        console.log('[APM DB] Default admin user created (admin / admin)');
    }

    return db;
}

module.exports = setupDb;
