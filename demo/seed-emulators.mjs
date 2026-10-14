// Seeds the Firebase Emulator Suite (project `demo-plaza`) with the synthetic dataset.
// Refuses to run unless both emulator hosts are set, so it can never touch a real project.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { buildDemoData, DEMO_USERS, DEMO_PASSWORD } from './data.mjs';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { usernameEmail } = require('../functions/security.js');

const projectId = process.env.GCLOUD_PROJECT || 'demo-plaza';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Seed aborted: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must point to local emulators.');
  process.exit(1);
}
if (!projectId.startsWith('demo-')) {
  console.error(`Seed aborted: project "${projectId}" is not a demo-* project.`);
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const auth = admin.auth();

for (const user of DEMO_USERS) {
  const identity = { uid: user.id, email: usernameEmail(user.username), password: DEMO_PASSWORD, disabled: false };
  try { await auth.updateUser(user.id, identity); } catch { await auth.createUser(identity); }
}

const plazaFile = process.env.PLAZA_CONFIG || new URL('../config/plaza.config.json', import.meta.url);
const data = buildDemoData(JSON.parse(readFileSync(plazaFile, 'utf8')));
let total = 0;
for (const [collection, rows] of Object.entries(data)) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + 400)) batch.set(db.collection(collection).doc(row.id), row);
    await batch.commit();
  }
  total += rows.length;
}

console.log(`Seeded ${total} synthetic documents and ${DEMO_USERS.length} accounts into ${projectId}.`);
console.log(`Usuarios: ${DEMO_USERS.map(u => `${u.username} (${u.role})`).join(', ')} — contraseña: ${DEMO_PASSWORD}`);
await admin.app().delete();
