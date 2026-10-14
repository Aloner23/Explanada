const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
function load(file, globals = {}, requireMock = () => ({})) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  // Modules that import the plaza config get the real sample config (config/plaza.config.json).
  const req = name => (/config\/plaza$/.test(name) ? plazaModule() : requireMock(name));
  vm.runInNewContext(output, { exports, require: req, console, Date, Math, Intl, crypto: globalThis.crypto, structuredClone, ...globals });
  return exports;
}
function plazaModule() {
  const logic = load('src/config/plazaLogic.ts');
  const plaza = logic.normalizePlazaConfig(JSON.parse(fs.readFileSync('config/plaza.config.json', 'utf8')));
  return { ...logic, plaza, findPlazaSpace: ref => logic.findSpace(ref, plaza.spaces), formatMoney: (a, d) => logic.formatMoneyFor(plaza, a, d) };
}
test('existing parking tests fail the process on any assertion failure', () => {
  const parking = load('src/utils/parkingLogic.ts'); let failures = 0;
  load('src/tests/parkingLogic.test.ts', { console: { log() {}, error() { failures++; } } }, () => parking);
  assert.equal(failures, 0);
});
test('ticket identifiers do not collide across a realistic workload', () => {
  const { generateTicketId } = load('src/utils/parkingLogic.ts');
  const ids = Array.from({ length: 10000 }, generateTicketId);
  assert.equal(new Set(ids).size, 10000);
  assert.match(ids[0], /^[0-9A-F-]{36}$/);
});
test('HTML report drops executable content and all attributes', () => {
  const window = new JSDOM('').window;
  const { safeReportHtml } = load('src/utils/safeHtml.ts', { document: window.document, DOMParser: window.DOMParser, Node: window.Node, Element: window.Element });
  const html = safeReportHtml('<p onclick="bad()">OK<img src=x onerror="bad()"><script>bad()</script><svg onload="bad()"/><a href="javascript:bad()">link</a><strong>safe</strong></p>');
  assert.ok(!/onerror|onclick|script|svg|javascript|href/.test(html));
  assert.match(html, /OK/);
});
test('legacy credential cleanup retains pending transactions', () => {
  const window = new JSDOM('', { url: 'https://example.test' }).window;
  window.localStorage.setItem('explanada_offline_queue', JSON.stringify([{ table: 'plz_transactions', data: { id: 't1', amount: 30 } }, { table: 'plz_users', data: { id: 'u1', password: 'secret' } }]));
  load('src/utils/cachePrivacy.ts').scrubLegacyCredentials(window.localStorage);
  const queue = JSON.parse(window.localStorage.getItem('explanada_offline_queue'));
  assert.equal(queue.length, 2); assert.equal(queue[0].data.amount, 30); assert.equal(queue[1].data.password, undefined);
});
test('failed Firebase read preserves cache and reports failure', async () => {
  const storage = new Map();
  const { dataService, TABLES } = load('src/services/dataService.ts', {
    navigator: { onLine: true, userAgent: 'review' }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    console: { log() {}, warn() {}, error() {} }
  }, name => name.includes('firebaseConfig') ? { auth: { currentUser: { uid: 'u1' } } } : {
    collection: () => ({}), getDocs: async () => { throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' }); }
  });
  dataService._cacheOwner = 'u1'; dataService._memoryCache = { tenants: [{ id: 't1' }] };
  const result = await dataService.getAllData([TABLES.TENANTS]);
  assert.equal(result.tenants.length, 1); assert.equal(result.loadErrors.length, 1);
});
test('cache never follows a different authenticated user', () => {
  const auth = { currentUser: { uid: 'u1' } };
  const { dataService } = load('src/services/dataService.ts', { navigator: { onLine: false }, localStorage: { getItem: () => null } }, name => name.includes('firebaseConfig') ? { auth } : {});
  dataService._cacheOwner = 'u1'; dataService._memoryCache = { tenants: [{ id: 'private' }] };
  auth.currentUser = { uid: 'u2' };
  assert.equal(dataService._getCache().tenants, undefined);
});
test('POS allowlist denies arbitrary routes and destructive verbs', () => {
  const { allowedPosRequest } = require('../../functions/security');
  assert.equal(allowedPosRequest('POST', '/sales'), true);
  assert.equal(allowedPosRequest('GET', '/health'), true);
  assert.equal(allowedPosRequest('GET', '/sales/TX-123'), true);
  assert.equal(allowedPosRequest('DELETE', '/sales/TX-123'), false);
  assert.equal(allowedPosRequest('GET', '/sales/../admin'), false);
  assert.equal(allowedPosRequest('GET', '/../admin'), false);
  assert.equal(allowedPosRequest('POST', '/admin/delete-all'), false);
});
test('migration keeps the first legacy identity and assigns stable unique names without losing records', () => {
  const { planUsers } = require('../../scripts/migration-plan.cjs');
  const users = [{ id: 'c', username: 'local', role: 'TENANT', tenantId: '3' }, { id: 'a', username: 'local', role: 'TENANT', tenantId: '1' }, { id: 'b', username: 'local-2', role: 'TENANT', tenantId: '2' }];
  const plan = planUsers(users);
  assert.equal(plan.length, 3); assert.equal(plan[0].username, 'local');
  assert.equal(plan[2].username, 'local-3'); assert.equal(plan[2].tenantId, '3');
  assert.equal(new Set(plan.map(u => u.username)).size, 3);
});
test('offline parking payments replay as one atomic batch', async () => {
  const storage = new Map(); const navigator = { onLine: false };
  let commits = 0, writes = 0;
  const { dataService } = load('src/services/dataService.ts', { navigator, localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) } }, name => name.includes('firebaseConfig') ? { auth: { currentUser: { uid: 'u1' } } } : { doc: () => ({}), writeBatch: () => ({ set() { writes++; }, async commit() { commits++; } }) });
  await dataService.saveParkingPayment({ id: 'ticket', status: 'paid' }, { id: 'tx-ticket', type: 'PARKING', amount: 30 });
  assert.equal(dataService.getPendingQueue().length, 1);
  assert.equal(dataService.getPendingQueue()[0].action, 'BATCH');
  navigator.onLine = true; await dataService.syncPendingRecords();
  assert.equal(commits, 1); assert.equal(writes, 2); assert.equal(dataService.getPendingQueue().length, 0);
});

test('auditor respects historical dashboard year, completed payments and no-date questions', async () => {
  const prompts = []; let selected;
  const service = load('src/services/geminiService.ts', {}, name => name.includes('authService') ? {
    authenticatedFetch: async (_path, init) => {
      const prompt = JSON.parse(init.body).contents; prompts.push(prompt);
      return { ok: true, json: async () => ({ text: prompt.includes('Extrae SOLO') ? '{"month":"SELECTED","year":"SELECTED"}' : '<p>Informe</p>' }) };
    }
  } : { calculateFinancialBreakdown: txs => { selected = txs; return new Proxy({}, { get: () => 0 }); } });
  const txs = [{ id: 'old', date: '2025-03-02' }, { id: 'new', date: '2026-03-02' }, { id: 'pending', date: '2025-03-03', status: 'pending' }];
  await service.analyzeBusinessPerformance(txs, [], [], '2025');
  assert.deepEqual(Array.from(selected, x => x.id), ['old']);
  assert.match(prompts.at(-1), /Año 2025/); assert.ok(!prompts.at(-1).includes('NaN'));
  await service.analyzeBusinessPerformance(txs, [], [], '03/2025', 'Cómo mejorar el margen');
  assert.deepEqual(Array.from(selected, x => x.id), ['old']); assert.match(prompts.at(-1), /03\/2025/);
});
test('auditor surfaces provider errors instead of presenting them as a report', async () => {
  const service = load('src/services/geminiService.ts', {}, name => name.includes('authService') ? {
    authenticatedFetch: async () => ({ ok: false, json: async () => ({ error: 'Cuota agotada' }) })
  } : { calculateFinancialBreakdown: () => new Proxy({}, { get: () => 0 }) });
  await assert.rejects(service.analyzeBusinessPerformance([], [], [], '2025'), /Cuota agotada/);
});
test('auditor safely distinguishes provider rejection, quota, timeout and empty output', async () => {
  const { generateAnalysis } = require('../../functions/analysis');
  for (const [status, code] of [[403, 'AI_CREDENTIAL'], [429, 'AI_QUOTA'], [404, 'AI_MODEL'], [500, 'AI_PROVIDER']]) {
    const result = await generateAnalysis('synthetic', 'test-key', async () => ({ ok: false, status, json: async () => ({}) }));
    assert.equal(result.code, code); assert.ok(!JSON.stringify(result).includes('test-key'));
  }
  assert.equal((await generateAnalysis('synthetic', 'test-key', async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } }) }))).code, 'AI_CREDENTIAL');
  assert.equal((await generateAnalysis('synthetic', 'test-key', async () => { throw new Error('timeout'); })).code, 'AI_CONNECTION');
  assert.equal((await generateAnalysis('synthetic', 'test-key', async () => ({ ok: true, json: async () => ({}) }))).code, 'AI_EMPTY');
  const success = await generateAnalysis('synthetic', 'test-key', async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }, { text: '<p>OK</p>' }] } }] }) }));
  assert.equal(success.text, '<p>OK</p>');
});
test('invalid record cannot contaminate cache or report a successful queued save', async () => {
  let saved = 0;
  const { dataService, TABLES } = load('src/services/dataService.ts', {
    navigator: { onLine: false }, localStorage: { getItem: () => null, setItem() { saved++; } }
  }, name => name.includes('firebaseConfig') ? { auth: { currentUser: { uid: 'u1' } } } : {});
  for (const id of [undefined, '', 'undefined', 'a/b']) {
    await assert.rejects(dataService.upsertRecord(TABLES.TRANSACTIONS, { id, amount: 12 }), /identificador válido/);
  }
  assert.equal(saved, 0);
});
test('cash history renders only 50 of 10000 transactions while retaining total and pagination', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { TransactionHistory } = load('src/components/common/TransactionHistory.tsx', {}, name => name === 'react' ? React : new Proxy({}, { get: () => () => null }));
  const transactions = Array.from({ length: 10000 }, (_, i) => ({ id: `t${i}`, date: '2025-07-01', type: 'PARKING', amount: 10, description: 'ENTRY_ROW' }));
  const html = renderToStaticMarkup(React.createElement(TransactionHistory, { transactions, onEdit() {}, onDelete() {}, onAddMovement() {}, onAddHistorical() {} }));
  assert.equal((html.match(/ENTRY_ROW/g) || []).length, 50);
  assert.match(html, /10000 movimientos/); assert.match(html, /Página 1 de 200/); assert.match(html, /Siguiente/);
});
test('store publishes independent snapshots so saved amounts recalculate without cloud reloads', async () => {
  const cache = { transactions: [{ id: 't1', amount: 10 }], tenants: [{ id: 'tenant', details: { rent: 50 } }] };
  let reads = 0;
  const { useStore } = load('src/store/useStore.ts', {}, name => name === 'zustand' ? require('zustand') : name.includes('dataService') ? {
    dataService: { _getCache: () => cache, syncPendingRecords: async () => {}, getAllData: async () => { reads++; return cache; } }
  } : {});
  await useStore.getState().loadData();
  const initial = useStore.getState().transactions;
  cache.transactions[0].amount = 20;
  assert.equal(initial[0].amount, 10);
  useStore.getState().syncFromLocalCache();
  const saved = useStore.getState().transactions;
  assert.notEqual(initial, saved); assert.equal(saved[0].amount, 20);
  const tenantSnapshot = useStore.getState().tenants;
  cache.transactions.push({ id: 't2', amount: 30 });
  cache.tenants[0].details.rent = 100;
  useStore.getState().syncFromLocalCache();
  assert.equal(saved.length, 1); assert.equal(tenantSnapshot[0].details.rent, 50);
  assert.equal(useStore.getState().transactions.reduce((s, t) => s + t.amount, 0), 50);
  assert.equal(reads, 1);
});
test('session restoration requires server-confirmed active profile and strips legacy credentials', async () => {
  let profile = { role: 'OWNER', active: true, password: 'legacy' }; let signouts = 0, reads = 0;
  const auth = { currentUser: { uid: 'owner' } };
  const { restoreSession } = load('src/services/authService.ts', {}, name => name.includes('firebaseConfig') ? { auth } : name === 'firebase/auth' ? { signOut: async () => { signouts++; } } : { doc: () => ({}), getDocFromServer: async () => { reads++; return { data: () => profile }; } });
  const user = await restoreSession();
  assert.equal(user.id, 'owner'); assert.equal(user.password, undefined); assert.equal(reads, 1);
  profile.active = false; assert.equal(await restoreSession(), null); assert.equal(signouts, 1);
  auth.currentUser = null; assert.equal(await restoreSession(), null); assert.equal(reads, 2);
});
test('auditor distinguishes recorded net from cash adjustments and counts occupied overdue units', async () => {
  let prompt;
  const metrics = { totalRevenue: 100, realGeneralIncome: 120, totalNeto: 80, realParking: 120, totalCars: 10, historical_fund: 70, events: 15, events_by_space: { 'salon-a': 15 } };
  const service = load('src/services/geminiService.ts', {}, name => name.includes('authService') ? {
    authenticatedFetch: async (_path, init) => { prompt = JSON.parse(init.body).contents; return { ok: true, json: async () => ({ text: '<p>OK</p>' }) }; }
  } : { calculateFinancialBreakdown: () => new Proxy(metrics, { get: (o, k) => o[k] || 0 }) });
  await service.analyzeBusinessPerformance([], [{ status: 'active' }, { status: 'late' }, { status: 'vacant' }], [], '2025');
  assert.match(prompt, /Margen registrado sobre ingresos del sistema: 80.00%/);
  assert.match(prompt, /2 ocupados.*66.7%/);
  assert.match(prompt, /NO meta ni tarifa esperada/);
  assert.match(prompt, /históricos registrados: \$70/);
  assert.match(prompt, /Eventos y espacios rentables: \$15/);
  assert.match(prompt, /Salón A \(\$15\)/);
});
