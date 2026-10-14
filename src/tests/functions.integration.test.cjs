const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
process.env.GCLOUD_PROJECT = 'demo-plaza';
const endpoints = require('../../functions/index.js');
const admin = require('../../functions/node_modules/firebase-admin');
const { usernameEmail } = require('../../functions/security');
let accountServer, posServer, base, posBase;
const tokens = {};
async function send(path, body, token, method = 'POST', target = base) {
  return fetch(target + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body) });
}
before(async () => {
  accountServer = http.createServer(endpoints.accountApi);
  posServer = http.createServer(endpoints.posProxy);
  await new Promise(resolve => accountServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => posServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${accountServer.address().port}`;
  posBase = `http://127.0.0.1:${posServer.address().port}`;
  for (const [id, role] of [['http-owner', 'OWNER'], ['http-tenant', 'TENANT'], ['http-disabled', 'OWNER']]) {
    await admin.auth().createUser({ uid: id, email: usernameEmail(id), password: 'test-password-strong' });
    await admin.firestore().collection('plz_users').doc(id).set({ id, role, active: id !== 'http-disabled', username: id, ...(role === 'TENANT' ? { tenantId: 't-http' } : {}) });
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: usernameEmail(id), password: 'test-password-strong', returnSecureToken: true }) });
    tokens[id] = (await response.json()).idToken;
    assert.ok(tokens[id]);
  }
  await admin.firestore().collection('plz_reservations').doc('private').set({ date: '2099-01-01', startTime: '10:00', endTime: '12:00', hallName: 'Test', clientName: 'PRIVATE', clientEmail: 'private@example.test', status: 'confirmed' });
});
after(async () => {
  await Promise.all([new Promise(r => accountServer.close(r)), new Promise(r => posServer.close(r))]);
  await admin.app().delete();
});
test('POS rejects anonymous, invalid, inactive and tenant sessions before upstream access', async () => {
  for (const token of [undefined, 'invalid', tokens['http-disabled'], tokens['http-tenant']]) {
    const res = await send('/pos-api/health', null, token, 'GET', posBase);
    assert.ok([401, 403].includes(res.status));
  }
  const denied = await send('/pos-api/private-admin', null, tokens['http-owner'], 'GET', posBase);
  assert.equal(denied.status, 403);
  const notConfigured = await send('/pos-api/health', null, tokens['http-owner'], 'GET', posBase);
  assert.equal(notConfigured.status, 503);
});
test('public snapshot exposes availability but not folios or contact details', async () => {
  const response = await send('/account-api/public-snapshot', null, undefined, 'GET');
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  for (const r of snapshot.reservations) { assert.equal(r.clientEmail, undefined); assert.equal(r.clientName, undefined); assert.equal(r.id, undefined); }
});
test('user management creates Auth identity, never a password field; blank password preserves login', async () => {
  const user = { id: 'http-new', username: 'New Staff', role: 'STAFF', password: 'first-password', active: true };
  let response = await send('/account-api/users', user, tokens['http-owner']);
  assert.equal(response.status, 200);
  assert.equal((await admin.firestore().collection('plz_users').doc(user.id).get()).data().password, undefined);
  response = await send('/account-api/users', { ...user, password: '', name: 'Updated' }, tokens['http-owner']);
  assert.equal(response.status, 200);
  const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: usernameEmail(user.username), password: user.password, returnSecureToken: true }) });
  assert.equal(login.status, 200);
  const self = await send('/account-api/users', { id: 'http-owner', username: 'http-owner', role: 'STAFF' }, tokens['http-owner']);
  assert.equal(self.status, 400);
});
test('anonymous and tenant cannot manage accounts', async () => {
  assert.equal((await send('/account-api/users', {}, undefined)).status, 401);
  assert.equal((await send('/account-api/users', {}, tokens['http-tenant'])).status, 403);
});
test('public reservation cannot invent a completed payment', async () => {
  const beforeCount = (await admin.firestore().collection('plz_transactions').get()).size;
  const response = await send('/account-api/reservation', { date: '2099-03-15', startTime: '10:00', endTime: '12:00', hallName: 'Test', clientName: 'Test', clientEmail: 'test@example.test', status: 'confirmed', amount: 9999 });
  assert.equal(response.status, 200);
  const record = await response.json();
  assert.equal(record.status, 'pending'); assert.match(record.id, /^RES-.{36}$/);
  assert.equal((await admin.firestore().collection('plz_transactions').get()).size, beforeCount);
  const lookup = await send('/account-api/reservation-lookup', { id: record.id });
  assert.equal(lookup.status, 200);
  assert.equal((await send('/account-api/reservation-lookup', { id: 'private' })).status, 404);
});
test('analysis enforces authentication and returns safe configuration errors', async () => {
  assert.equal((await send('/account-api/analysis', { contents: 'synthetic' })).status, 401);
  assert.equal((await send('/account-api/analysis', { contents: 'synthetic' }, tokens['http-tenant'])).status, 403);
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await send('/account-api/analysis', { contents: 'synthetic' }, tokens['http-owner']);
    assert.equal(result.status, 503);
    assert.match((await result.json()).error, /configurado/);
  } finally { if (previous !== undefined) process.env.GEMINI_API_KEY = previous; }
});
