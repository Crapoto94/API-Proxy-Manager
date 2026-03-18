const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function check() {
    try {
        const db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        const count = await db.get('SELECT COUNT(*) as c FROM proxy_logs');
        console.log(`Log count: ${count.c}`);

        console.log('\n--- Last 10 Proxy Logs ---');
        const logs = await db.all('SELECT * FROM proxy_logs ORDER BY id DESC LIMIT 10');
        console.log(JSON.stringify(logs, null, 2));

        await db.close();
    } catch (err) {
        console.error('Error during DB check:', err);
    }
}

check();
