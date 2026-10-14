import { getDb, persist } from './store.js';

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const snap = (table, id) => { const data = getDb()[table]?.[id]; return { id, exists: () => data !== undefined, data: () => clone(data), metadata: { fromCache: false }, ref: { table, id } }; };
const delay = () => new Promise(r => setTimeout(r, 15));

export const CACHE_SIZE_UNLIMITED = -1;
export function initializeFirestore() { return { type: 'mock-firestore' }; }
export function getFirestore() { return { type: 'mock-firestore' }; }
export function connectFirestoreEmulator() {}
export function collection(_db, table) { return { table, filters: [] }; }
export function doc(_db, table, id) { return { table, id }; }
export function where(field, op, value) { return { field, op, value }; }
export function orderBy() { return null; }
export function limit() { return null; }
export function startAfter() { return null; }
export function query(col, ...constraints) { return { table: col.table, filters: [...col.filters, ...constraints.filter(c => c && c.op)] }; }

const ops = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '!=': (a, b) => a !== b };
export async function getDocs(q) {
  await delay();
  const rows = Object.values(getDb()[q.table] || {}).filter(r => q.filters.every(f => ops[f.op](r[f.field], f.value)));
  const docs = rows.map(r => snap(q.table, r.id));
  return { docs, empty: docs.length === 0, size: docs.length };
}
export async function getDoc(ref) { await delay(); return snap(ref.table, ref.id); }
export const getDocFromServer = getDoc;
function write(ref, data, options) {
  const db = getDb(); db[ref.table] ||= {};
  db[ref.table][ref.id] = options?.merge ? { ...(db[ref.table][ref.id] || {}), ...clone(data) } : clone(data);
}
export async function setDoc(ref, data, options) { await delay(); write(ref, data, options); persist(); }
export async function updateDoc(ref, data) { await delay(); write(ref, data, { merge: true }); persist(); }
export async function deleteDoc(ref) { await delay(); delete getDb()[ref.table]?.[ref.id]; persist(); }
export function writeBatch() {
  const ops = [];
  return { set(ref, data, options) { ops.push([ref, data, options]); }, async commit() { await delay(); ops.forEach(o => write(...o)); persist(); } };
}
export function onSnapshot(ref, next) { const t = setTimeout(() => next(snap(ref.table, ref.id)), 0); return () => clearTimeout(t); }
export async function terminate() {}
export async function clearIndexedDbPersistence() {}
