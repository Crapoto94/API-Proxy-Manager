const express = require('express');
const axios = require('axios');

/**
 * @openapi
 * tags:
 *   name: AI
 *   description: Paramétrage des fournisseurs IA (Groq, NVIDIA NIM, Ollama) — mêmes fournisseurs
 *     et mêmes paramètres que l'outil analyse-mail. Voir aussi les routes publiques
 *     /api/v1/ai/* (Proxy APIs) pour l'interrogation externe.
 */

// URLs des API compatibles OpenAI. NVIDIA NIM dispose d'un très grand catalogue de modèles
// en évolution constante (pas de liste figée) : l'admin saisit librement l'identifiant du
// modèle de son choix, comme dans analyse-mail.
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const PROVIDER_LABELS = { groq: 'Groq', nvidia: 'NVIDIA', ollama: 'Ollama' };

// Prompt utilisé pour le test de santé (bouton "Tester" et job planifié toutes les heures) :
// volontairement minimal, identique à celui d'analyse-mail, pour vérifier rapidement qu'un
// modèle répond sans consommer inutilement de quota.
const HEALTH_CHECK_PROMPT = 'Réponds uniquement par : OK';

/**
 * Appelle une API de complétion de chat compatible OpenAI (Groq, NVIDIA NIM, Ollama) et
 * retourne le texte de la réponse. Port JS de _call_openai_compatible_chat (analyse-mail
 * app.py:3815).
 */
async function callOpenAiCompatible(apiUrl, apiKey, model, prompt, timeout, providerLabel) {
    try {
        const response = await axios.post(apiUrl, {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 4000
        }, {
            timeout,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // Certains fournisseurs (dont Groq, derrière Cloudflare) bloquent le
                // User-Agent par défaut des clients HTTP, détecté comme un bot (HTTP 403).
                'User-Agent': 'Mozilla/5.0 (compatible; APM/1.0)'
            }
        });

        const choice = (response.data.choices || [])[0];
        if (!choice) throw new Error(`Réponse ${providerLabel} vide (aucun choix retourné)`);
        let content = choice.message.content;
        if (choice.finish_reason === 'length') {
            content += '\n\n⚠️ Réponse tronquée (limite de longueur atteinte).';
        }
        return content;
    } catch (error) {
        if (error.response) {
            const msg = error.response.data?.error?.message || JSON.stringify(error.response.data);
            throw new Error(`Erreur API ${providerLabel} (HTTP ${error.response.status}) : ${msg}`);
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error(`Délai dépassé en contactant l'API ${providerLabel}`);
        }
        throw new Error(`Erreur réseau vers l'API ${providerLabel} : ${error.message}`);
    }
}

async function callGroqChat(prompt, apiKey, model, timeout = 60000) {
    if (!apiKey) throw new Error('Clé API Groq non configurée');
    return callOpenAiCompatible(GROQ_API_URL, apiKey, model, prompt, timeout, 'Groq');
}

async function callNvidiaChat(prompt, apiKey, model, timeout = 60000) {
    if (!apiKey) throw new Error('Clé API NVIDIA non configurée');
    return callOpenAiCompatible(NVIDIA_API_URL, apiKey, model, prompt, timeout, 'NVIDIA');
}

async function callOllamaChat(prompt, url, model, timeout = 120000) {
    if (!url) throw new Error("URL de l'instance Ollama non configurée");
    const ollamaApiUrl = url.replace(/\/$/, '') + '/v1/chat/completions';
    // Ollama n'exige pas de clé API — un jeton factice suffit pour le header Authorization.
    return callOpenAiCompatible(ollamaApiUrl, 'ollama', model, prompt, timeout, 'Ollama');
}

async function callProviderChat(provider, prompt, settings, model, timeout) {
    if (provider === 'groq') return callGroqChat(prompt, settings.groq_api_key, model, timeout);
    if (provider === 'nvidia') return callNvidiaChat(prompt, settings.nvidia_api_key, model, timeout);
    if (provider === 'ollama') return callOllamaChat(prompt, settings.ollama_url, model, timeout);
    throw new Error(`Fournisseur inconnu : ${provider}`);
}

function providerActive(provider, settings) {
    if (provider === 'groq') return !!settings.groq_api_key;
    if (provider === 'nvidia') return !!settings.nvidia_api_key;
    if (provider === 'ollama') return !!settings.ollama_enabled && !!settings.ollama_url;
    return false;
}

/**
 * Retourne tous les modèles configurés, enrichis du fournisseur actif/inactif, du modèle
 * par défaut, et de l'état de leur dernier test. Port JS de get_all_ai_models (analyse-mail
 * app.py:3674) : si aucun default_model_id n'est positionné (ou qu'il ne correspond plus à
 * un modèle actif), le premier modèle actif devient le défaut implicite.
 */
async function getModelsWithStatus(db) {
    const settings = await db.get('SELECT * FROM ai_settings WHERE id = 1');
    const rows = await db.all(`
        SELECT m.id, m.provider, m.name, m.model, m.is_active,
               s.status, s.message, s.latency_ms, s.tested_at
        FROM ai_models m
        LEFT JOIN ai_model_status s ON s.model_id = m.id
        ORDER BY m.provider, m.id
    `);

    const models = rows.map(row => {
        const active = !!row.is_active && providerActive(row.provider, settings || {});
        return {
            id: row.id,
            key: `${row.provider}:${row.id}`,
            provider: row.provider,
            provider_label: PROVIDER_LABELS[row.provider] || row.provider,
            name: row.name,
            model: row.model,
            is_active: !!row.is_active,
            active,
            is_default: settings && settings.default_model_id === row.id,
            last_test: {
                status: row.status || 'unknown',
                message: row.message || null,
                latency_ms: row.latency_ms || null,
                tested_at: row.tested_at || null
            }
        };
    });

    if (!models.some(m => m.is_default)) {
        const firstActive = models.find(m => m.active);
        if (firstActive) firstActive.is_default = true;
    }

    return models;
}

/**
 * Envoie le prompt de test à un modèle et enregistre le résultat dans ai_model_status.
 * Utilisé par le bouton "Tester" (test-model, test-all) et par le job planifié horaire.
 */
async function testModel(db, model, settings, timeout = 20000) {
    const start = Date.now();
    try {
        const reply = await callProviderChat(model.provider, HEALTH_CHECK_PROMPT, settings, model.model, timeout);
        const latency = Date.now() - start;
        await db.run(
            `INSERT INTO ai_model_status (model_id, status, message, latency_ms, tested_at)
             VALUES (?, 'ok', ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(model_id) DO UPDATE SET status='ok', message=excluded.message,
                latency_ms=excluded.latency_ms, tested_at=excluded.tested_at`,
            [model.id, String(reply).trim().slice(0, 200), latency]
        );
        return { success: true, message: `Modèle « ${model.model} » opérationnel, réponse : ${String(reply).trim().slice(0, 200)}` };
    } catch (error) {
        const latency = Date.now() - start;
        await db.run(
            `INSERT INTO ai_model_status (model_id, status, message, latency_ms, tested_at)
             VALUES (?, 'error', ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(model_id) DO UPDATE SET status='error', message=excluded.message,
                latency_ms=excluded.latency_ms, tested_at=excluded.tested_at`,
            [model.id, error.message.slice(0, 500), latency]
        );
        return { success: false, message: error.message };
    }
}

/**
 * Teste en parallèle tous les modèles dont le fournisseur est configuré ("rapidement",
 * comme demandé pour le job horaire) et met à jour leur statut. Les modèles dont le
 * fournisseur n'est pas configuré sont ignorés (pas de clé API à tester).
 */
async function testAllModels(db) {
    const settings = await db.get('SELECT * FROM ai_settings WHERE id = 1');
    const models = await db.all('SELECT * FROM ai_models WHERE is_active = 1');
    const testable = models.filter(m => providerActive(m.provider, settings || {}));

    const results = await Promise.allSettled(testable.map(m => testModel(db, m, settings)));
    const okCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`[AI HEALTHCHECK] ${okCount}/${testable.length} modèle(s) OK (${models.length - testable.length} ignoré(s), fournisseur non configuré)`);
    return { tested: testable.length, ok: okCount };
}

/**
 * Interroge l'IA : essaie d'abord le modèle demandé (preferredModelId, optionnel), puis
 * bascule automatiquement sur le premier modèle actif de chaque autre fournisseur en cas
 * d'échec (panne, quota dépassé, clé invalide...). Port JS de run_ai_analysis (analyse-mail
 * app.py:3895).
 */
async function runAiQuery(db, prompt, preferredModelId) {
    const settings = await db.get('SELECT * FROM ai_settings WHERE id = 1');
    const models = await getModelsWithStatus(db);
    const activeModels = models.filter(m => m.active);
    if (activeModels.length === 0) {
        throw new Error('Aucun fournisseur IA configuré (Groq, NVIDIA ou Ollama)');
    }

    const ordered = [];
    const seenProviders = new Set();

    if (preferredModelId) {
        // Accepte l'id numérique, la clé "provider:id", l'identifiant technique du modèle
        // (ex. "llama-3.1-8b-instant") ou son nom convivial (ex. "Rapide") — un appelant
        // externe n'a en général connaissance que de ce que /api/v1/ai/models lui a montré.
        const wanted = String(preferredModelId);
        const chosen = activeModels.find(m =>
            String(m.id) === wanted || m.key === wanted || m.model === wanted || m.name === wanted);
        if (chosen) {
            ordered.push(chosen);
            seenProviders.add(chosen.provider);
        }
    }
    if (ordered.length === 0) {
        const def = activeModels.find(m => m.is_default);
        if (def) { ordered.push(def); seenProviders.add(def.provider); }
    }
    for (const provider of ['groq', 'nvidia', 'ollama']) {
        if (seenProviders.has(provider)) continue;
        const candidate = activeModels.find(m => m.provider === provider);
        if (candidate) { ordered.push(candidate); seenProviders.add(provider); }
    }

    const errors = [];
    for (const m of ordered) {
        try {
            const response = await callProviderChat(m.provider, prompt, settings, m.model, 60000);
            return { provider: m.provider, provider_label: m.provider_label, model: m.model, model_name: m.name, response };
        } catch (error) {
            errors.push(`${m.provider_label} (${m.model}) : ${error.message}`);
        }
    }
    throw new Error(`Tous les modèles IA configurés ont échoué. ${errors.join(' | ')}`);
}

module.exports = (app, db, authenticateAdmin) => {
    const router = express.Router();

    /**
     * @openapi
     * /api/ai/settings:
     *   get:
     *     tags: [AI]
     *     summary: Récupère le paramétrage IA (clés API et URL par fournisseur, modèle par défaut)
     */
    router.get('/settings', authenticateAdmin, async (req, res) => {
        try {
            const settings = await db.get('SELECT * FROM ai_settings WHERE id = 1');
            res.json(settings || {});
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/settings:
     *   put:
     *     tags: [AI]
     *     summary: Met à jour le paramétrage IA
     */
    router.put('/settings', authenticateAdmin, async (req, res) => {
        const { groq_api_key, nvidia_api_key, ollama_url, ollama_enabled, default_model_id } = req.body;
        try {
            await db.run(
                `UPDATE ai_settings SET groq_api_key = ?, nvidia_api_key = ?, ollama_url = ?,
                    ollama_enabled = ?, default_model_id = ? WHERE id = 1`,
                [groq_api_key || '', nvidia_api_key || '', ollama_url || '', ollama_enabled ? 1 : 0, default_model_id || null]
            );
            res.json({ message: 'Paramètres IA enregistrés' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/models:
     *   get:
     *     tags: [AI]
     *     summary: Liste les modèles configurés avec l'état de leur dernier test
     */
    router.get('/models', authenticateAdmin, async (req, res) => {
        try {
            res.json(await getModelsWithStatus(db));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/models:
     *   post:
     *     tags: [AI]
     *     summary: Ajoute un modèle pour un fournisseur (Groq, NVIDIA ou Ollama)
     */
    router.post('/models', authenticateAdmin, async (req, res) => {
        const { provider, name, model } = req.body;
        if (!['groq', 'nvidia', 'ollama'].includes(provider)) {
            return res.status(400).json({ error: 'Fournisseur inconnu' });
        }
        if (!name || !model) {
            return res.status(400).json({ error: 'Nom et identifiant technique du modèle requis' });
        }
        try {
            const result = await db.run('INSERT INTO ai_models (provider, name, model) VALUES (?, ?, ?)', [provider, name.trim(), model.trim()]);
            res.status(201).json({ id: result.lastID });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/models/{id}:
     *   put:
     *     tags: [AI]
     *     summary: Met à jour un modèle (nom, identifiant technique, actif/inactif)
     */
    router.put('/models/:id', authenticateAdmin, async (req, res) => {
        const { name, model, is_active } = req.body;
        try {
            await db.run('UPDATE ai_models SET name = ?, model = ?, is_active = ? WHERE id = ?',
                [name, model, is_active ? 1 : 0, req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/models/{id}:
     *   delete:
     *     tags: [AI]
     *     summary: Supprime un modèle
     */
    router.delete('/models/:id', authenticateAdmin, async (req, res) => {
        try {
            await db.run('DELETE FROM ai_models WHERE id = ?', [req.params.id]);
            res.json({ message: 'Modèle supprimé' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/models/{id}/test:
     *   post:
     *     tags: [AI]
     *     summary: Teste immédiatement un modèle précis (bouton "Tester")
     */
    router.post('/models/:id/test', authenticateAdmin, async (req, res) => {
        try {
            const model = await db.get('SELECT * FROM ai_models WHERE id = ?', [req.params.id]);
            if (!model) return res.status(404).json({ error: 'Modèle introuvable' });
            const settings = await db.get('SELECT * FROM ai_settings WHERE id = 1');
            const result = await testModel(db, model, settings || {});
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    /**
     * @openapi
     * /api/ai/test-all:
     *   post:
     *     tags: [AI]
     *     summary: Teste immédiatement tous les modèles actifs (bouton "Tester tous")
     */
    router.post('/test-all', authenticateAdmin, async (req, res) => {
        try {
            res.json(await testAllModels(db));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.use('/api/ai', router);

    // Exposés pour les autres modules (proxy.js pour l'API externe, server.js pour le job
    // planifié horaire) sans dépendance circulaire — même pattern que app.locals.sendMail.
    app.locals.getAiModelsWithStatus = () => getModelsWithStatus(db);
    app.locals.runAiQuery = (prompt, preferredModelId) => runAiQuery(db, prompt, preferredModelId);
    app.locals.testAllModels = () => testAllModels(db);
};
