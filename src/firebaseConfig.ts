import { initializeApp } from "firebase/app";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAuth, connectAuthEmulator } from "firebase/auth";

// Public showcase: every value comes from VITE_* variables (see .env.example).
// Defaults target the local Firebase Emulator Suite with the fictitious project
// `demo-plaza`, so the app never talks to a real backend unless configured.
const env = import.meta.env;
const projectId = env.VITE_FIREBASE_PROJECT_ID || "demo-plaza";

const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || "demo-api-key",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
    appId: env.VITE_FIREBASE_APP_ID || "1:000000000000:web:demo",
};

const app = initializeApp(firebaseConfig);

// Auto-detect Long Polling para mejorar compatibilidad con redes móviles y proxies
export const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
});

// Firestore uses its default memory cache. The app keeps its own per-user offline
// queue; a shared IndexedDB database must not expose a previous account's records.

export const storage = getStorage(app);
export const auth = getAuth(app);

// Demo mode: connect to the local Emulator Suite (npm run demo).
if (env.VITE_USE_EMULATORS === "true") {
    const host = env.VITE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8089);
    connectStorageEmulator(storage, host, 9199);
}

export default app;
