// Routes d'agenda Office 365 de l'APM (/api/v1/o365/calendar/events) avec Microsoft Graph simulé : aucun appel externe.
// Lancer : node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const axios = require('axios');

const graphCalls = [];
let graphDeleteError = null;
axios.post = async (url, body, opts) => {
    graphCalls.push({ method: 'POST', url, body, headers: opts && opts.headers });
    return url.includes('oauth2') ? { data: { access_token: 'JETON-GRAPH' } } : { data: { id: 'EV-123' } };
};
const graphPages = [];
axios.get = async (url, opts) => {
    graphCalls.push({ method: 'GET', url, params: opts && opts.params, headers: opts && opts.headers });
    return { data: graphPages.shift() || { value: [] } };
};
axios.delete = async (url, opts) => {
    graphCalls.push({ method: 'DELETE', url, headers: opts && opts.headers });
    if (graphDeleteError) throw graphDeleteError;
    return { status: 204 };
};

const APPS = {
    'CLE-AGENDA': { id: 1, name: 'Suivi des congés', api_key: 'CLE-AGENDA', is_active: 1, authorized_routes: JSON.stringify(['o365_calendar']) },
    'CLE-MAIL': { id: 2, name: 'Autre', api_key: 'CLE-MAIL', is_active: 1, authorized_routes: JSON.stringify(['mail_send']) },
};
let azureEnabled = true;
const fakeDb = {
    async get(sql, params) {
        if (/security_settings/.test(sql)) return { trust_proxies_enabled: 0 };
        if (/external_apps/.test(sql)) return APPS[params[0]];
        if (/azure_ad_settings/.test(sql)) return azureEnabled ? { is_enabled: 1, tenant_id: 'T', client_id: 'CLIENT-AZURE', client_secret: 'S-AZURE' } : { is_enabled: 0, tenant_id: 'T', client_id: 'CLIENT-AZURE', client_secret: 'S-AZURE' };
        if (/o365_settings/.test(sql)) return { tenant_id: 'T', client_id: 'CLIENT-MAIL', client_secret: 'S-MAIL', mailbox: 'collecte@ville.fr', is_enabled: 1 };
        return null;
    },
    async all() { return []; },
    async run() { return { lastID: 1 }; },
};

let server, base;
test.before(async () => {
    const app = express();
    app.use(express.json());
    require('../routes/proxy')(app, fakeDb, (req, res, next) => next());
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
test.after(() => server.close());
test.beforeEach(() => { graphCalls.length = 0; graphDeleteError = null; azureEnabled = true; });

const call = (method, path, key, body) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-KEY': key } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const EVENT = {
    mailbox: 'agent@ville.fr', subject: 'ABSENT', isAllDay: true, showAs: 'oof', sensitivity: 'private', isReminderOn: false,
    start: { dateTime: '2026-11-16T00:00:00', timeZone: 'Europe/Paris' }, end: { dateTime: '2026-11-17T00:00:00', timeZone: 'Europe/Paris' },
    body: { content: 'ne doit pas passer' }, attendees: ['x@y.fr'],
};

test('sans la permission o365_calendar : refusé (403)', async () => {
    const r = await call('POST', '/o365/calendar/events', 'CLE-MAIL', EVENT);
    assert.strictEqual(r.status, 403);
    assert.strictEqual(graphCalls.length, 0);
});

test('création : 201 avec l\'identifiant, seuls les champs autorisés vont à Graph, dans la boîte demandée', async () => {
    const r = await call('POST', '/o365/calendar/events', 'CLE-AGENDA', EVENT);
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(await r.json(), { id: 'EV-123' });
    const post = graphCalls.find((c) => c.url.includes('/events'));
    assert.strictEqual(post.url, 'https://graph.microsoft.com/v1.0/users/agent%40ville.fr/events');
    assert.strictEqual(post.headers.Authorization, 'Bearer JETON-GRAPH');
    assert.deepStrictEqual(Object.keys(post.body).sort(), ['end', 'isAllDay', 'isReminderOn', 'sensitivity', 'showAs', 'start', 'subject']);   // ni corps ni participants
    assert.strictEqual(post.body.subject, 'ABSENT');
    assert.strictEqual(post.body.showAs, 'oof');
});

test('création : la boîte est obligatoire (jamais la boîte de collecte par défaut) et les valeurs sont contrôlées', async () => {
    const { mailbox, ...sansBoite } = EVENT;
    let r = await call('POST', '/o365/calendar/events', 'CLE-AGENDA', sansBoite);
    assert.strictEqual(r.status, 400);
    r = await call('POST', '/o365/calendar/events', 'CLE-AGENDA', { ...EVENT, showAs: 'inconnu' });
    assert.strictEqual(r.status, 400);
    r = await call('POST', '/o365/calendar/events', 'CLE-AGENDA', { ...EVENT, subject: '' });
    assert.strictEqual(r.status, 400);
    r = await call('POST', '/o365/calendar/events', 'CLE-AGENDA', { ...EVENT, start: { dateTime: 'demain', timeZone: 'Europe/Paris' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(graphCalls.filter((c) => c.url.includes('/events')).length, 0);
});

test('suppression : 204 ; boîte obligatoire ; événement déjà supprimé : 404', async () => {
    let r = await call('DELETE', '/o365/calendar/events/EV-123?mailbox=agent@ville.fr', 'CLE-AGENDA');
    assert.strictEqual(r.status, 204);
    const del = graphCalls.find((c) => c.method === 'DELETE');
    assert.strictEqual(del.url, 'https://graph.microsoft.com/v1.0/users/agent%40ville.fr/events/EV-123');
    r = await call('DELETE', '/o365/calendar/events/EV-123', 'CLE-AGENDA');
    assert.strictEqual(r.status, 400);
    graphDeleteError = Object.assign(new Error('introuvable'), { response: { status: 404, data: { error: { message: 'The specified object was not found in the store.' } } } });
    r = await call('DELETE', '/o365/calendar/events/EV-999?mailbox=agent@ville.fr', 'CLE-AGENDA');
    assert.strictEqual(r.status, 404);
});

test("agenda : le jeton vient de l'application Azure AD (comme les rencontres d'AppDSI), à défaut de celle du collecteur mail", async () => {
    await call('POST', '/o365/calendar/events', 'CLE-AGENDA', EVENT);
    let token = graphCalls.find((c) => c.url.includes('oauth2'));
    assert.strictEqual(token.body.get('client_id'), 'CLIENT-AZURE');
    graphCalls.length = 0;
    azureEnabled = false;                                                 // application Azure AD désactivée : repli sur o365_settings
    await call('POST', '/o365/calendar/events', 'CLE-AGENDA', EVENT);
    token = graphCalls.find((c) => c.url.includes('oauth2'));
    assert.strictEqual(token.body.get('client_id'), 'CLIENT-MAIL');
});

test('liste : événements de la période (pagination suivie), seuls id/sujet/horaires/disponibilité sont retournés, boîte et dates obligatoires', async () => {
    graphCalls.length = 0;
    graphPages.push({ value: [{ id: 'A', subject: 'ABSENT', start: { dateTime: '2026-10-26T00:00:00' }, end: { dateTime: '2026-10-27T00:00:00' }, showAs: 'oof', body: 'secret' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page' });
    graphPages.push({ value: [{ id: 'B', subject: 'ABSENT', start: { dateTime: '2026-10-28T00:00:00' }, end: { dateTime: '2026-10-29T00:00:00' }, showAs: 'tentative' }] });
    let r = await call('GET', '/o365/calendar/events?mailbox=agent@ville.fr&start=2026-01-01&end=2027-12-31', 'CLE-AGENDA');
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.deepStrictEqual(body.events.map((e) => e.id), ['A', 'B']);
    assert.strictEqual(JSON.stringify(body).includes('secret'), false);
    const gets = graphCalls.filter((c) => c.method === 'GET');
    assert.strictEqual(gets[0].url, 'https://graph.microsoft.com/v1.0/users/agent%40ville.fr/calendarView');
    assert.strictEqual(gets[1].url, 'https://graph.microsoft.com/v1.0/next-page');
    r = await call('GET', '/o365/calendar/events?start=2026-01-01&end=2027-12-31', 'CLE-AGENDA');
    assert.strictEqual(r.status, 400);
    r = await call('GET', '/o365/calendar/events?mailbox=agent@ville.fr', 'CLE-AGENDA');
    assert.strictEqual(r.status, 400);
});
