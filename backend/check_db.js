const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function check() {
    try {
        const db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        console.log('--- External Apps ---');
        const apps = await db.all('SELECT * FROM external_apps');
        console.log(JSON.stringify(apps, null, 2));

        console.log('\n--- Proxy Logs (last 5) ---');
        const logs = await db.all('SELECT * FROM proxy_logs ORDER BY timestamp DESC LIMIT 5');
        console.log(JSON.stringify(logs, null, 2));

        await db.close();
    } catch (err) {
        console.error('Error during DB check:', err);
    }
}

check();
