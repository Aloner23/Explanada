import { browserSessionPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { User } from '../types';

// Stable internal email alias: users keep their existing username.
export async function usernameEmail(username: string) {
  const bytes = new TextEncoder().encode(username.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}@users.explanada.invalid`;
}

export async function login(username: string, password: string): Promise<User> {
  await setPersistence(auth, browserSessionPersistence);
  try {
    const result = await signInWithEmailAndPassword(auth, await usernameEmail(username), password);
    const snapshot = await getDocFromServer(doc(db, 'plz_users', result.user.uid));
    const profile = snapshot.data();
    if (!profile || profile.active !== true) throw new Error('Cuenta no disponible. Contacta a administración.');
    const { password: ignored, ...safeProfile } = profile;
    return { ...safeProfile, id: result.user.uid } as User;
  } catch (error: any) {
    await signOut(auth);
    if (['auth/invalid-credential', 'auth/user-disabled', 'auth/user-not-found', 'auth/wrong-password'].includes(error.code)) {
      throw new Error('Usuario o contraseña incorrectos, o cuenta desactivada.');
    }
    if (['auth/configuration-not-found', 'auth/operation-not-allowed'].includes(error.code)) {
      throw new Error('El acceso seguro aún no está habilitado. Contacta a administración.');
    }
    throw error;
  }
}

export const waitForAuth = () => new Promise<void>(resolve => {
  const unsubscribe = onAuthStateChanged(auth, () => { unsubscribe(); resolve(); });
});

// The packaged desktop client loads from file:// and must call the hosted API explicitly.
export const apiBase = () => window.location.protocol === 'file:'
  ? (typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__ : '') : '';

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  if (!auth.currentUser) throw new Error('Inicia sesión para continuar.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  return fetch(`${apiBase()}${path}`, { ...init, headers });
}

export async function saveUser(user: Partial<User>) {
  const response = await authenticatedFetch('/account-api/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user)
  });
  if (!response.ok) throw new Error((await response.json()).error || 'No se pudo guardar el usuario.');
  return response.json();
}

export async function restoreSession(): Promise<User | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const snapshot = await getDocFromServer(doc(db, 'plz_users', user.uid));
  const profile = snapshot.data();
  if (!profile || profile.active !== true || !['OWNER', 'ADMIN', 'STAFF', 'PARKING_STAFF', 'TENANT'].includes(profile.role)) {
    await signOut(auth);
    return null;
  }
  const { password, ...safe } = profile;
  return { ...safe, id: user.uid } as User;
}
