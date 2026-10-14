import { findUserByAlias, DEMO_PASSWORD } from './store.js';

const SESSION = 'plz_mock_session';
const listeners = new Set();
const auth = { currentUser: null, app: null };
const toUser = uid => ({ uid, getIdToken: async () => `mock-token:${uid}` });
try { const uid = sessionStorage.getItem(SESSION); if (uid) auth.currentUser = toUser(uid); } catch { /* no session */ }
const notify = () => listeners.forEach(cb => cb(auth.currentUser));

export const browserSessionPersistence = { type: 'SESSION' };
export function getAuth() { return auth; }
export function connectAuthEmulator() {}
export async function setPersistence() {}
export function onAuthStateChanged(_auth, cb) { listeners.add(cb); setTimeout(() => cb(auth.currentUser), 0); return () => listeners.delete(cb); }
export async function signInWithEmailAndPassword(_auth, email, password) {
  const user = await findUserByAlias(email);
  if (!user || password !== DEMO_PASSWORD) throw Object.assign(new Error('Invalid credential'), { code: 'auth/invalid-credential' });
  auth.currentUser = toUser(user.id);
  sessionStorage.setItem(SESSION, user.id);
  notify();
  return { user: auth.currentUser };
}
export async function signOut() { auth.currentUser = null; sessionStorage.removeItem(SESSION); notify(); }
