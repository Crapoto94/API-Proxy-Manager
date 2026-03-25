const oracledb = require('oracledb');

module.exports = function(app, db, authenticateAdmin) {

    // --- Oracle Helpers ---
    async function getOracleConnection(settings) {
        if (!settings || !settings.is_enabled) {
            throw new Error('La connexion Oracle est désactivée.');
        }
        const config = {
            user: settings.username,
            password: settings.password,
            connectString: settings.connectString || `${settings.host}:${settings.port}/${settings.service_name}`
        };
        try {
            return await oracledb.getConnection(config);
        } catch (err) {
            throw new Error(`Erreur de connexion Oracle : ${err.message}`);
        }
    }

    // --- Oracle Settings Routes ---
    /**
     * @openapi
     * /api/oracle-settings:
     *   get:
     *     tags: [Database - Oracle]
     *     summary: Récupère les paramètres de connexion Oracle
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Paramètres récupérés
     */
    app.get('/api/oracle-settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.all('SELECT * FROM oracle_settings ORDER BY id');
            if (settings) settings.forEach(s => { if (s.password) s.password = '********'; });
            res.json(settings);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.post('/api/oracle-settings', authenticateAdmin, async (req, res) => {
        const { type, host, port, service_name, connectString, username, password, is_enabled } = req.body;
        console.log(`[ORACLE SETTINGS] Saving for ${type}...`);
        try {
            const sql = (password === '********' || !password)
                ? 'UPDATE oracle_settings SET host = ?, port = ?, service_name = ?, connectString = ?, username = ?, is_enabled = ? WHERE type = ?'
                : 'UPDATE oracle_settings SET host = ?, port = ?, service_name = ?, connectString = ?, username = ?, password = ?, is_enabled = ? WHERE type = ?';
            const params = (password === '********' || !password)
                ? [host, port, service_name, connectString, username, is_enabled ? 1 : 0, type]
                : [host, port, service_name, connectString, username, password, is_enabled ? 1 : 0, type];
            
            const result = await db.run(sql, params);
            if (result.changes === 0) {
                 // Try insert if update failed (though seeded, let's be safe)
                 console.log(`[ORACLE SETTINGS] No row for ${type}, performing insert...`);
                 const insertSql = 'INSERT INTO oracle_settings (type, host, port, service_name, connectString, username, password, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
                 const insertParams = [type, host, port, service_name, connectString, username, password === '********' ? '' : password, is_enabled ? 1 : 0];
                 await db.run(insertSql, insertParams);
            }
            
            res.json({ success: true, message: 'Paramètres Oracle enregistrés' });
        } catch (error) {
            console.error(`[ORACLE SETTINGS ERROR] ${error.message}`);
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/oracle/test-connection:
     *   post:
     *     tags: [Database - Oracle]
     *     summary: Teste une connexion Oracle
     *     security: [{ bearerAuth: [] }]
     *     responses:
     *       200:
     *         description: Test réussi
     */
    app.post('/api/oracle/test-connection', authenticateAdmin, async (req, res) => {
        const { type } = req.body;
        let connection;
        try {
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);
            const result = await connection.execute('SELECT 1 FROM DUAL');
            res.json({ success: true, message: `Connexion réussie !`, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) {} }
        }
    });

    // --- Oracle Explorer Routes ---
    app.post('/api/oracle/check-tables', authenticateAdmin, async (req, res) => {
        const { type } = req.body;
        let connection;
        try {
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);
            const result = await connection.execute('SELECT TNAME FROM TAB WHERE TABTYPE IN (\'TABLE\', \'VIEW\')');
            res.json({ success: true, details: result.rows.map(row => row[0]) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) {} }
        }
    });

    app.post('/api/oracle/table-columns', authenticateAdmin, async (req, res) => {
        const { type, tableName } = req.body;
        let connection;
        try {
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);
            const result = await connection.execute(`SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`, [tableName.toUpperCase()]);
            res.json({ success: true, columns: result.rows.map(row => row[0]) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) {} }
        }
    });

    // --- SQL Explorer API (SQLite) ---
    app.get('/api/admin/sql/databases', authenticateAdmin, async (req, res) => {
        try {
            const databases = await db.all("PRAGMA database_list");
            res.json(databases);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.get('/api/admin/sql/tables', authenticateAdmin, async (req, res) => {
        try {
            const dbName = req.query.db || 'main';
            const tables = await db.all(`SELECT name, type FROM "${dbName}".sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`);
            res.json(tables);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.post('/api/oracle/table-preview', authenticateAdmin, async (req, res) => {
        const { type, tableName } = req.body;
        let connection;
        try {
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);

            const result = await connection.execute(
                `SELECT * FROM ${tableName.toUpperCase()} WHERE ROWNUM <= 1`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            res.json({
                success: true,
                preview: result.rows.length > 0 ? result.rows[0] : {}
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) { } }
        }
    });

    // --- Oracle Sync Config Routes ---
    app.get('/api/oracle/sync-config/:type', authenticateAdmin, async (req, res) => {
        const { type } = req.params;
        try {
            const config = await db.all('SELECT * FROM oracle_sync_config WHERE type = ?', [type]);
            res.json(config);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture config sync Oracle' });
        }
    });

    app.post('/api/oracle/sync-config', authenticateAdmin, async (req, res) => {
        const { type, tables, filters, advancedConfigs } = req.body;
        try {
            await db.run('BEGIN TRANSACTION');
            await db.run('DELETE FROM oracle_sync_config WHERE type = ?', [type]);
            for (const tableName of tables) {
                const filter = filters && filters[tableName] ? filters[tableName] : '';
                const configJson = advancedConfigs && advancedConfigs[tableName] ? JSON.stringify(advancedConfigs[tableName]) : null;
                await db.run(
                    'INSERT INTO oracle_sync_config (type, table_name, where_clause, config_json) VALUES (?, ?, ?, ?)',
                    [type, tableName, filter, configJson]
                );
            }
            await db.run('COMMIT');
            res.json({ success: true, message: 'Configuration de synchronisation enregistrée' });
        } catch (error) {
            await db.run('ROLLBACK');
            res.status(500).json({ message: 'Erreur sauvegarde config sync Oracle', error: error.message });
        }
    });

    function parseOracleDate(val) {
        if (val === null || val === undefined) return null;
        const s = String(val).trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
        const frMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        if (frMatch) {
            const d = frMatch[1].padStart(2, '0');
            const m = frMatch[2].padStart(2, '0');
            const y = frMatch[3];
            return `${y}-${m}-${d}`;
        }
        try {
            const cleanS = s.replace(/\s*\(.*\)$/, '');
            const d = new Date(cleanS);
            if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        } catch (e) { }
        return s;
    }

    app.post('/api/oracle/test-join', authenticateAdmin, async (req, res) => {
        const { type, secondaryTable, joinField, labelFields, searchValue } = req.body;
        let connection;
        try {
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);
            const concatLabel = labelFields.map(f => `"${f}"`).join(" || ' ' || ");
            const query = `SELECT ${concatLabel} as RESULT FROM ${secondaryTable} WHERE ${joinField} = :val AND ROWNUM <= 1`;
            const result = await connection.execute(query, [searchValue], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            res.json({
                success: true,
                result: result.rows.length > 0 ? result.rows[0].RESULT : null
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) { } }
        }
    });

    app.post('/api/oracle/import-tables', authenticateAdmin, async (req, res) => {
        const { type, tables: providedTables, filters: providedFilters, substitutions, tableConfig, primaryKeys } = req.body;
        const dateFields = req.body.dateFields || {};
        let tablesToSync = [];
        let connection;
        try {
            if (providedTables && Array.isArray(providedTables) && providedTables.length > 0) {
                tablesToSync = providedTables.map(t => ({
                    table_name: t,
                    where_clause: providedFilters && providedFilters[t] ? providedFilters[t] : ''
                }));
            } else {
                const savedConfig = await db.all('SELECT table_name, where_clause, config_json FROM oracle_sync_config WHERE type = ?', [type]);
                tablesToSync = savedConfig.map(c => ({
                    table_name: c.table_name,
                    where_clause: c.where_clause,
                    config_json: c.config_json ? JSON.parse(c.config_json) : null
                }));
            }
            if (tablesToSync.length === 0) return res.status(400).json({ success: false, message: "Aucun objet à synchroniser" });
            const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
            connection = await getOracleConnection(settings);
            const report = [];
            for (const config of tablesToSync) {
                const tableName = config.table_name;
                const mainPrefix = type.toUpperCase() === 'RH' ? '' : tableName.toUpperCase() + "_";
                try {
                    const tableSettings = config.config_json || {};
                    const selectedCols = providedTables ? (tableConfig && tableConfig[tableName]) : tableSettings.selectedFields;
                    const pkField = providedTables ? (primaryKeys && primaryKeys[tableName]) : tableSettings.primaryKey;
                    const tableSubst = providedTables ? (substitutions && substitutions[tableName] || {}) : (tableSettings.substitutions || {});
                    const tableDateFields = providedTables ? (dateFields && dateFields[`${type}:${tableName}`] || []) : (tableSettings.dateFields || []);

                    const metaRes = await connection.execute(`SELECT * FROM ${tableName} WHERE 1=0`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                    const allTableColumns = metaRes.metaData.map(m => m.name);
                    const columnsToImport = (selectedCols && Array.isArray(selectedCols)) ? allTableColumns.filter(c => selectedCols.includes(c)) : allTableColumns;

                    let selectParts = [];
                    let joinParts = [];
                    let aliasIdx = 1;
                    const colSourceMap = {};

                    for (const col of columnsToImport) {
                        if (tableSubst[col]) {
                            const { secondaryTable, joinField, labelFields } = tableSubst[col];
                            const alias = `S${aliasIdx++}`;
                            const secPrefix = secondaryTable.toUpperCase() + "_";
                            if (labelFields && labelFields.length > 0) {
                                labelFields.forEach(f => {
                                    const localJoinCol = `${secPrefix}${f}`;
                                    selectParts.push(`NVL(CAST(${alias}."${f}" AS VARCHAR2(4000)), 'XXXXX') AS "${localJoinCol}"`);
                                });
                            } else {
                                let localColName = `${mainPrefix}${col}`;
                                selectParts.push(`T1."${col}" AS "${localColName}"`);
                                colSourceMap[localColName] = col;
                            }
                            joinParts.push(`LEFT JOIN ${secondaryTable} ${alias} ON T1."${col}" = ${alias}."${joinField}"`);
                        } else {
                            let localColName = `${mainPrefix}${col}`;
                            selectParts.push(`T1."${col}" AS "${localColName}"`);
                            colSourceMap[localColName] = col;
                        }
                    }
                    let query = `SELECT ${selectParts.join(', ')} FROM ${tableName} T1 ${joinParts.join(' ')}`;
                    const rawWhere = config.where_clause ? config.where_clause.trim() : "";
                    const whereClause = rawWhere.replace(/"/g, "'");
                    if (whereClause) {
                        const hasWhere = /^where\s/i.test(whereClause);
                        let formattedWhere = hasWhere ? whereClause : `WHERE ${whereClause}`;
                        const reserved = ['WHERE', 'AND', 'OR', 'LIKE', 'IN', 'NULL', 'IS', 'NOT', 'BETWEEN', 'ORDER', 'BY', 'DESC', 'ASC', 'DATE', 'TO_DATE', 'TO_CHAR', 'NVL', 'COALESCE', 'TRIM', 'UPPER', 'LOWER', 'SUBSTR', 'INSTR', 'COUNT', 'SUM', 'ROWNUM'];
                        formattedWhere = formattedWhere.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
                            if (reserved.includes(match.toUpperCase())) return match;
                            return `T1."${match}"`;
                        });
                        query += ` ${formattedWhere}`;
                    }
                    const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                    const localTableName = type.toUpperCase() === 'RH' ? tableName : `oracle_${tableName.toLowerCase()}`;
                    const finalColumns = result.metaData.map(m => m.name);
                    const dbPrefixMap = { 'FINANCES': 'gf', 'RH': 'rh' };
                    const targetSchema = dbPrefixMap[type.toUpperCase()];
                    const dbPrefix = targetSchema ? `${targetSchema}.` : '';
                    const fullLocalTableName = `${dbPrefix}${localTableName}`;
                    await db.run(`DROP TABLE IF EXISTS ${fullLocalTableName}`);
                    const pkLocalField = pkField ? `${mainPrefix}${pkField}` : null;
                    const createCols = finalColumns.map(col => `"${col}" TEXT${col === pkLocalField ? ' PRIMARY KEY' : ''}`).join(', ');
                    await db.run(`CREATE TABLE ${fullLocalTableName} (${createCols})`);
                    if (result.rows.length > 0) {
                        const placeholders = finalColumns.map(() => '?').join(',');
                        const insertSql = `INSERT INTO ${fullLocalTableName} (${finalColumns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;
                        await db.run('BEGIN TRANSACTION');
                        try {
                            for (const rowObj of result.rows) {
                                const fullValues = [];
                                for (const col of finalColumns) {
                                    let val = rowObj[col];
                                    const originalFieldName = colSourceMap[col];
                                    if (originalFieldName && (tableDateFields.includes(originalFieldName) || originalFieldName.toUpperCase().includes('DATE'))) {
                                        val = parseOracleDate(val);
                                    }
                                    fullValues.push(val !== null ? String(val) : null);
                                }
                                await db.run(insertSql, fullValues);
                            }
                            await db.run('COMMIT');
                        } catch (e) { await db.run('ROLLBACK'); throw e; }
                    }
                    report.push({ table: tableName, status: 'OK', count: result.rows.length, localTable: fullLocalTableName });
                } catch (err) {
                    report.push({ table: tableName, status: 'ERROR', message: err.message });
                }
            }
            res.json({ success: true, message: `Synchronisation Oracle ${type} terminée.`, report });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            if (connection) { try { await connection.close(); } catch (e) { } }
        }
    });

    // --- SQL Explorer API (SQLite) ---
    app.get('/api/admin/sql/databases', authenticateAdmin, async (req, res) => {
        try {
            const databases = await db.all("PRAGMA database_list");
            res.json(databases);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.get('/api/admin/sql/tables', authenticateAdmin, async (req, res) => {
        try {
            const dbName = req.query.db || 'main';
            const tables = await db.all(`SELECT name, type FROM "${dbName}".sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`);
            res.json(tables);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.get('/api/admin/sql/table-info/:tableName', authenticateAdmin, async (req, res) => {
        const { tableName } = req.params;
        const dbName = req.query.db || 'main';
        try {
            const columns = await db.all(`PRAGMA "${dbName}".table_info("${tableName}")`);
            const pks = columns.filter(c => c.pk).map(c => c.name);
            const indices = await db.all(`PRAGMA "${dbName}".index_list("${tableName}")`);
            const count = await db.get(`SELECT count(*) as cnt FROM "${dbName}"."${tableName}"`);
            res.json({ pk: pks, indices: indices.map(i => i.name), count: count.cnt });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    /**
     * @openapi
     * /api/admin/sql/query:
     *   post:
     *     tags: [Database - SQL Explorer]
     *     summary: Exécute une requête SQL sur la base SQLite locale
     *     security: [{ bearerAuth: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               sql:
     *                 type: string
     *               expertMode:
     *                 type: boolean
     *     responses:
     *       200:
     *         description: Requête exécutée
     */
    app.post('/api/admin/sql/query', authenticateAdmin, async (req, res) => {
        try {
            const { sql, expertMode } = req.body;
            if (!sql) return res.status(400).json({ message: 'Requête SQL manquante' });
            
            const isSelect = sql.trim().toLowerCase().startsWith('select') || sql.trim().toLowerCase().startsWith('pragma');
            
            if (!isSelect && !expertMode) {
                return res.status(400).json({ message: 'Seules les requêtes SELECT sont autorisées en mode standard' });
            }
            
            const startTime = Date.now();
            
            if (isSelect) {
                const records = await db.all(sql);
                res.json({ records, count: records.length, executionTime: Date.now() - startTime });
            } else {
                const result = await db.run(sql);
                res.json({ 
                    records: [{ message: `Opération réussie. Lignes modifiées : ${result.changes}` }], 
                    count: 1, 
                    executionTime: Date.now() - startTime 
                });
            }
            
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
};
