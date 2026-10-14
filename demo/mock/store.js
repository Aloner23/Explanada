// In-browser mock backend used by `npm run demo:mock` (no Java, no Firebase project).
// It replaces the Firebase SDK modules through Vite aliases and answers the
// /account-api and /pos-api routes, always with the synthetic dataset in demo/data.mjs.
// NOTE: this mode does not evaluate firestore.rules; use `npm run demo` (emulators) for that.
import { buildDemoData, DEMO_USERS, DEMO_PASSWORD } from '../data.mjs';
import plazaConfig from '@plaza-config';

const KEY = 'plz_mock_db_v2';
let db;

export function getDb() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
  if (!db) {
    db = {};
    for (const [table, rows] of Object.entries(buildDemoData(plazaConfig))) db[table] = Object.fromEntries(rows.map(r => [r.id, r]));
  }
  return db;
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota: keep in memory */ } }
export function resetDb() { localStorage.removeItem(KEY); db = undefined; }

async function sha256(text) {
  const bytes = new TextEncoder().encode(text.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function findUserByAlias(email) {
  for (const u of DEMO_USERS) if (`${await sha256(u.username)}@users.explanada.invalid` === email) return u;
  return null;
}
export { DEMO_PASSWORD };
