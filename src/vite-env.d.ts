/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_EMULATOR_HOST?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  readonly VITE_EMAILJS_TEMPLATE_ID?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_REPLY_TO_EMAIL?: string;
  readonly VITE_BASE_PATH?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

/** Hosting origin used by the desktop client (file://); injected by vite.config.ts. */
declare const __API_BASE_URL__: string;

/** The active plaza configuration JSON (config/plaza.config.json by default). */
declare module '@plaza-config' {
  const config: unknown;
  export default config;
}
