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
        const last = await db.all('SELECT * FROM proxy_logs ORDER BY id DESC LIMIT 5');
        
        console.log(`TOTAL LOGS: ${count.c}`);
        console.log('\n--- LAST 5 LOGS ---');
        last.forEach(log => {
            console.log(`ID: ${log.id}, App: ${log.app_id}, Path: ${log.endpoint}, Status: ${log.status}, Time: ${log.timestamp}`);
        });

        await db.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

check();
