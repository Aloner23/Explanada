const { before, after, test } = require('node:test');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc } = require('firebase/firestore');
const { ref, uploadString } = require('firebase/storage');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-plaza', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync('firestore.rules', 'utf8') }, storage: { host: '127.0.0.1', port: 9199, rules: fs.readFileSync('storage.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, role, active, tenantId] of [['owner', 'OWNER', true], ['parking', 'PARKING_STAFF', true], ['tenant', 'TENANT', true, 't1'], ['disabled', 'OWNER', false]]) {
      await setDoc(doc(db, 'plz_users', id), { id, role, active, ...(tenantId ? { tenantId } : {}) });
    }
    for (const id of ['t1', 't2']) await setDoc(doc(db, 'plz_tenants', id), { id });
    await setDoc(doc(db, 'plz_transactions', 'rent1'), { tenantId: 't1', type: 'RENT', amount: 500 });
    await setDoc(doc(db, 'plz_config', 'global'), { hourlyRate: 15 });
    await setDoc(doc(db, 'plz_tickets', 'ticket1'), { id: 'ticket1', entryTime: '2026-01-01T08:00:00Z', status: 'active' });
  });
});
after(async () => { await env?.cleanup(); });
test('public cannot read credentials or write financial data', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDocs(collection(db, 'plz_users')));
  await assertFails(getDocs(collection(db, 'plz_reservations')));
  await assertFails(setDoc(doc(db, 'plz_transactions', 'fake'), { amount: 999 }));
  await assertFails(setDoc(doc(db, 'plz_config', 'global'), { hourlyRate: 0 }));
  await assertSucceeds(getDoc(doc(db, 'plz_config', 'global')));
});
test('active owner reads operations but cannot edit roles directly', async () => {
  const db = env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDocs(collection(db, 'plz_tenants')));
  await assertFails(updateDoc(doc(db, 'plz_users', 'parking'), { role: 'OWNER' }));
  await assertFails(setDoc(doc(db, 'plz_tenants', 'secret'), { systemPassword: 'secret' }));
});
test('deactivated owner loses access even with an unexpired token', async () => {
  await assertFails(getDocs(collection(env.authenticatedContext('disabled').firestore(), 'plz_transactions')));
});
test('tenant sees only own records and cannot invent payments', async () => {
  const db = env.authenticatedContext('tenant').firestore();
  await assertSucceeds(getDoc(doc(db, 'plz_tenants', 't1')));
  await assertFails(getDoc(doc(db, 'plz_tenants', 't2')));
  await assertSucceeds(getDocs(query(collection(db, 'plz_transactions'), where('tenantId', '==', 't1'))));
  await assertFails(getDocs(collection(db, 'plz_transactions')));
  await assertFails(setDoc(doc(db, 'plz_transactions', 'fake-rent'), { tenantId: 't1', type: 'RENT', amount: 1000 }));
  await assertFails(getDocs(collection(db, 'plz_tickets')));
});
test('parking staff can charge tickets but cannot replace their entry identity', async () => {
  const db = env.authenticatedContext('parking').firestore();
  await assertSucceeds(updateDoc(doc(db, 'plz_tickets', 'ticket1'), { status: 'paid' }));
  await assertFails(updateDoc(doc(db, 'plz_tickets', 'ticket1'), { entryTime: '2026-02-01T08:00:00Z' }));
  await assertFails(getDocs(collection(db, 'plz_payroll')));
});
test('Storage rejects anonymous uploads', async () => {
  await assertFails(uploadString(ref(env.unauthenticatedContext().storage(), 'uploads/attack.html'), '<script/>', 'raw', { contentType: 'text/html' }));
});
