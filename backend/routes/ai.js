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

// Délai d'attente par défaut pour /api/v1/ai/query (runAiQuery), quand
// ai_settings.query_timeout_ms n'est pas configuré. Volontairement plus large
// que l'ancien 60000ms codé en dur : une IA locale (Ollama, gros modèle) ou un
// prompt long (résumé de réunion complet) peut largement dépasser 60s.
// Configurable via l'écran Paramétrage IA (PUT /api/ai/settings).
const DEFAULT_QUERY_TIMEOUT_MS = 300000; // 5 min

// Longueur max de réponse (max_tokens, en tokens), quand ai_settings.max_tokens n'est pas
// configuré. Remplace l'ancienne valeur codée en dur (4000) qui coupait les réponses un peu
// longues ("⚠️ Réponse tronquée (limite de longueur atteinte)." — ajouté ci-dessous quand
// finish_reason === 'length') — pas de raison de brider un modèle local (ex. matériel dédié)
// comme on limiterait un coût d'API cloud. Configurable via l'écran Paramétrage IA
// (PUT /api/ai/settings), comme query_timeout_ms.
const DEFAULT_MAX_TOKENS = 16000;

// Prompt utilisé pour le test de santé (bouton "Tester" et job planifié toutes les heures) :
// volontairement minimal, identique à celui d'analyse-mail, pour vérifier rapidement qu'un
// modèle répond sans consommer inutilement de quota.
const HEALTH_CHECK_PROMPT = 'Réponds uniquement par : OK';

// Délai avant de déclarer un modèle "down" au test de santé — le TTFT (time to first token)
// d'Ollama (modèles internes, sur matériel dédié — souvent un gros modèle chargé à froid) et de
// NVIDIA NIM peut largement dépasser le défaut Groq (cloud, TTFT rapide) : un timeout trop court
// déclare à tort un modèle "down" alors qu'il ne s'agit que de latence, ce qui le retire des
// sélecteurs de modèle des applications clientes (cf. /api/v1/ai/models, filtré côté AppDSI sur
// le flag actif). 2 min pour ollama/nvidia, 20s pour groq (déjà rapide en pratique).
const HEALTH_CHECK_TIMEOUT_MS = { ollama: 120000, nvidia: 120000, groq: 20000 };

/** Draine un flux Node en texte — utilisé pour lire le corps d'une réponse d'erreur reçue
 * en mode streaming (responseType 'stream'), afin d'en extraire un message exploitable. */
function streamToString(stream) {
    return new Promise((resolve, reject) => {
        let data = '';
        stream.on('data', c => { data += c.toString('utf8'); });
        stream.on('end', () => resolve(data));
        stream.on('error', reject);
    });
}

/**
 * Appelle une API de complétion de chat compatible OpenAI (Groq, NVIDIA NIM, Ollama) et
 * retourne le texte de la réponse. Port JS de _call_openai_compatible_chat (analyse-mail
 * app.py:3815).
 *
 * Si `onChunk(delta, fullSoFar)` est fourni, la requête passe en streaming SSE
 * (stream: true côté fournisseur) et `onChunk` est appelé à chaque fragment de texte reçu —
 * permet de suivre une génération en temps réel (cf. startAiQueryAsync / query-progress)
 * au lieu d'attendre la réponse complète comme le fait l'appel classique.
 */
async function callOpenAiCompatible(apiUrl, apiKey, model, prompt, timeout, providerLabel, maxTokens = DEFAULT_MAX_TOKENS, onChunk = null) {
    const useStream = typeof onChunk === 'function';
    try {
        const response = await axios.post(apiUrl, {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: maxTokens,
            stream: useStream
        }, {
            timeout,
            responseType: useStream ? 'stream' : 'json',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': useStream ? 'text/event-stream' : 'application/json',
                // Certains fournisseurs (dont Groq, derrière Cloudflare) bloquent le
                // User-Agent par défaut des clients HTTP, détecté comme un bot (HTTP 403).
                'User-Agent': 'Mozilla/5.0 (compatible; APM/1.0)'
            }
        });

        if (!useStream) {
            const choice = (response.data.choices || [])[0];
            if (!choice) throw new Error(`Réponse ${providerLabel} vide (aucun choix retourné)`);
            let content = choice.message.content;
            if (choice.finish_reason === 'length') {
                content += '\n\n⚠️ Réponse tronquée (limite de longueur atteinte).';
            }
            return content;
        }

        // Mode streaming : le corps est un flux de lignes "data: {...}\n\n" (format SSE
        // standard OpenAI-compatible), terminé par une ligne "data: [DONE]".
        return await new Promise((resolve, reject) => {
            let full = '';
            let buffer = '';
            let finishReason = null;
            let settled = false;

            response.data.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop(); // ligne potentiellement incomplète : conservée pour le prochain chunk
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const payload = trimmed.slice(5).trim();
                    if (!payload || payload === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(payload);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            full += delta;
                            onChunk(delta, full);
                        }
                        if (parsed.choices?.[0]?.finish_reason) {
                            finishReason = parsed.choices[0].finish_reason;
                        }
                    } catch (e) {
                        // Ligne SSE non-JSON (garde-fou — ne devrait pas arriver) : ignorée.
                    }
                }
            });
            response.data.on('end', () => {
                if (settled) return;
                settled = true;
                if (finishReason === 'length') {
                    full += '\n\n⚠️ Réponse tronquée (limite de longueur atteinte).';
                }
                resolve(full);
            });
            response.data.on('error', (err) => {
                if (settled) return;
                settled = true;
                reject(err);
            });
        });
    } catch (error) {
        if (error.response) {
            let msg;
            if (error.response.data && typeof error.response.data.pipe === 'function') {
                // Réponse d'erreur reçue en mode stream (responseType 'stream') : c'est un
                // flux, pas du JSON déjà parsé — on le draine pour en tirer un message lisible.
                try {
                    const text = await streamToString(error.response.data);
                    try { msg = JSON.parse(text)?.error?.message || text; } catch { msg = text; }
                } catch { msg = `HTTP ${error.response.status}`; }
            } else {
                msg = error.response.data?.error?.message || JSON.stringify(error.response.data);
            }
            throw new Error(`Erreur API ${providerLabel} (HTTP ${error.response.status}) : ${msg}`);
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error(`Délai dépassé en contactant l'API ${providerLabel}`);
        }
        throw new Error(`Erreur réseau vers l'API ${providerLabel} : ${error.message}`);
    }
}

async function callGroqChat(prompt, apiKey, model, timeout = 60000, maxTokens = DEFAULT_MAX_TOKENS, onChunk = null) {
    if (!apiKey) throw new Error('Clé API Groq non configurée');
    return callOpenAiCompatible(GROQ_API_URL, apiKey, model, prompt, timeout, 'Groq', maxTokens, onChunk);
}

async function callNvidiaChat(prompt, apiKey, model, timeout = 60000, maxTokens = DEFAULT_MAX_TOKENS, onChunk = null) {
    if (!apiKey) throw new Error('Clé API NVIDIA non configurée');
    return callOpenAiCompatible(NVIDIA_API_URL, apiKey, model, prompt, timeout, 'NVIDIA', maxTokens, onChunk);
}

async function callOllamaChat(prompt, url, model, timeout = 120000, maxTokens = DEFAULT_MAX_TOKENS, onChunk = null) {
    if (!url) throw new Error("URL de l'instance Ollama non configurée");
    const ollamaApiUrl = url.replace(/\/$/, '') + '/v1/chat/completions';
    // Ollama n'exige pas de clé API — un jeton factice suffit pour le header Authorization.
    return callOpenAiCompatible(ollamaApiUrl, 'ollama', model, prompt, timeout, 'Ollama', maxTokens, onChunk);
}

async function callProviderChat(provider, prompt, settings, model, timeout, maxTokens = DEFAULT_MAX_TOKENS, onChunk = null) {
    if (provider === 'groq') return callGroqChat(prompt, settings.groq_api_key, model, timeout, maxTokens, onChunk);
    if (provider === 'nvidia') return callNvidiaChat(prompt, settings.nvidia_api_key, model, timeout, maxTokens, onChunk);
    if (provider === 'ollama') return callOllamaChat(prompt, settings.ollama_url, model, timeout, maxTokens, onChunk);
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
async function testModel(db, model, settings, timeout = HEALTH_CHECK_TIMEOUT_MS[model.provider] || 20000) {
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
 * Détermine l'ordre des modèles à essayer (modèle demandé puis défaut puis premier actif de
 * chaque autre fournisseur) et les paramètres de requête (timeout, max_tokens) — factorisé
 * entre runAiQuery (synchrone) et startAiQueryAsync (asynchrone + progression).
 */
async function resolveQueryPlan(db, preferredModelId) {
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

    const timeout = (settings && Number.isFinite(settings.query_timeout_ms) && settings.query_timeout_ms > 0)
        ? settings.query_timeout_ms
        : DEFAULT_QUERY_TIMEOUT_MS;
    const maxTokens = (settings && Number.isFinite(settings.max_tokens) && settings.max_tokens > 0)
        ? settings.max_tokens
        : DEFAULT_MAX_TOKENS;

    return { settings, ordered, timeout, maxTokens };
}

/**
 * Interroge l'IA : essaie d'abord le modèle demandé (preferredModelId, optionnel), puis
 * bascule automatiquement sur le premier modèle actif de chaque autre fournisseur en cas
 * d'échec (panne, quota dépassé, clé invalide...). Port JS de run_ai_analysis (analyse-mail
 * app.py:3895).
 */
async function runAiQuery(db, prompt, preferredModelId) {
    const { settings, ordered, timeout, maxTokens } = await resolveQueryPlan(db, preferredModelId);

    const errors = [];
    for (const m of ordered) {
        try {
            const response = await callProviderChat(m.provider, prompt, settings, m.model, timeout, maxTokens);
            return { provider: m.provider, provider_label: m.provider_label, model: m.model, model_name: m.name, response };
        } catch (error) {
            errors.push(`${m.provider_label} (${m.model}) : ${error.message}`);
        }
    }
    throw new Error(`Tous les modèles IA configurés ont échoué. ${errors.join(' | ')}`);
}

// Jobs de requêtes IA asynchrones (startAiQueryAsync) — permet à un appelant externe (ex.
// AppDSI) de suivre une génération en temps réel (tokensReceived augmente au fil du flux SSE
// fournisseur) au lieu d'attendre la réponse complète comme /api/v1/ai/query. En mémoire,
// comme les jobs équivalents côté AppDSI (contratAiJobs, summarizeJobs) — perdus si l'APM
// redémarre en cours de génération, ce qui reste rare et sans conséquence grave (l'appelant
// relance simplement).
let queryJobs = {};

/** Purge les jobs terminés/en échec de plus de 35 min — évite la fuite mémoire. */
function pruneQueryJobs() {
    const cutoff = Date.now() - 35 * 60 * 1000;
    for (const key of Object.keys(queryJobs)) {
        if (queryJobs[key].createdAt < cutoff) delete queryJobs[key];
    }
}

/**
 * Variante asynchrone de runAiQuery : démarre la génération en tâche de fond et renvoie
 * immédiatement un queryId. La progression est consultable via getQueryJobStatus —
 * tokensReceived (estimation ~4 caractères/token, faute de tokenizer exact ici) augmente en
 * temps réel pendant status='running' grâce au streaming SSE de callOpenAiCompatible.
 * Comme runAiQuery, bascule vers le fournisseur actif suivant en cas d'échec — mais
 * uniquement avant qu'un flux n'ait commencé à produire du texte (une fois des caractères
 * reçus, on ne rejoue pas le prompt sur un autre fournisseur pour ne pas produire une
 * réponse incohérente à mi-chemin).
 */
function startAiQueryAsync(db, prompt, preferredModelId) {
    const queryId = `q_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    queryJobs[queryId] = { status: 'running', tokensReceived: 0, charsReceived: 0, createdAt: Date.now() };
    pruneQueryJobs();

    (async () => {
        const job = queryJobs[queryId];
        try {
            const { settings, ordered, timeout, maxTokens } = await resolveQueryPlan(db, preferredModelId);
            const errors = [];
            let succeeded = false;

            for (const m of ordered) {
                if (job.charsReceived > 0) break; // un flux a déjà démarré : pas de bascule fournisseur en cours de route
                try {
                    const onChunk = (delta, fullSoFar) => {
                        job.charsReceived = fullSoFar.length;
                        job.tokensReceived = Math.round(job.charsReceived / 4);
                        // Texte partiel exposé en direct (status='running') — permet à
                        // l'appelant d'afficher la réponse au fil de l'eau plutôt qu'attendre
                        // la complétion ; réécrit avec la valeur définitive à la complétion.
                        job.response = fullSoFar;
                        job.provider = m.provider;
                        job.provider_label = m.provider_label;
                        job.model = m.model;
                    };
                    const response = await callProviderChat(m.provider, prompt, settings, m.model, timeout, maxTokens, onChunk);
                    job.status = 'completed';
                    job.response = response;
                    job.provider = m.provider;
                    job.provider_label = m.provider_label;
                    job.model = m.model;
                    job.model_name = m.name;
                    succeeded = true;
                    break;
                } catch (error) {
                    errors.push(`${m.provider_label} (${m.model}) : ${error.message}`);
                }
            }
            if (!succeeded) {
                job.status = 'error';
                job.error = `Tous les modèles IA configurés ont échoué. ${errors.join(' | ')}`;
            }
        } catch (error) {
            job.status = 'error';
            job.error = error.message;
        }
    })();

    return queryId;
}

function getQueryJobStatus(queryId) {
    return queryJobs[queryId] || null;
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
        const { groq_api_key, nvidia_api_key, ollama_url, ollama_enabled, default_model_id, query_timeout_ms, max_tokens } = req.body;
        try {
            let timeout = parseInt(query_timeout_ms, 10);
            if (!Number.isFinite(timeout) || timeout <= 0) timeout = DEFAULT_QUERY_TIMEOUT_MS;
            // Bornes de sécurité : au moins 10s, au plus 20 min (évite qu'une saisie
            // erronée ne bloque un worker indéfiniment).
            timeout = Math.min(Math.max(timeout, 10000), 1200000);

            let maxTokens = parseInt(max_tokens, 10);
            if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = DEFAULT_MAX_TOKENS;
            // Bornes de sécurité : au moins 256 tokens (réponse minimale exploitable), au
            // plus 128000 (au-delà, la plupart des fournisseurs rejettent la requête eux-mêmes).
            maxTokens = Math.min(Math.max(maxTokens, 256), 128000);

            await db.run(
                `UPDATE ai_settings SET groq_api_key = ?, nvidia_api_key = ?, ollama_url = ?,
                    ollama_enabled = ?, default_model_id = ?, query_timeout_ms = ?, max_tokens = ? WHERE id = 1`,
                [groq_api_key || '', nvidia_api_key || '', ollama_url || '', ollama_enabled ? 1 : 0, default_model_id || null, timeout, maxTokens]
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
    app.locals.startAiQueryAsync = (prompt, preferredModelId) => startAiQueryAsync(db, prompt, preferredModelId);
    app.locals.getQueryJobStatus = (queryId) => getQueryJobStatus(queryId);
    app.locals.testAllModels = () => testAllModels(db);
};
