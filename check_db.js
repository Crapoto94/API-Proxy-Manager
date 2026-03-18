const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function check() {
    const db = await open({
        filename: path.join(__dirname, 'backend', 'database.sqlite'),
        driver: sqlite3.Database
    });

    console.log('--- External Apps ---');
    const apps = await db.all('SELECT * FROM external_apps');
    console.log(apps);

    console.log('\n--- Proxy Logs (last 5) ---');
    const logs = await db.all('SELECT * FROM proxy_logs ORDER BY timestamp DESC LIMIT 5');
    console.log(logs);

    await db.close();
}

check().catch(console.error);
