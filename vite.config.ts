import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Secrets are held by Cloud Functions, never embedded into the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-plaza';
  // `--mode mock`: swap the Firebase SDK for an in-browser backend with synthetic data
  // (demo/mock). Lets the UI run with no Java, emulators or cloud project.
  const mock = mode === 'mock';
  const mockAlias = (name: string) => path.resolve(__dirname, `./demo/mock/firebase-${name}.js`);
  // Plaza branding/rules: config/plaza.config.json unless PLAZA_CONFIG points elsewhere.
  const plazaConfig = path.resolve(__dirname, env.PLAZA_CONFIG || process.env.PLAZA_CONFIG || './config/plaza.config.json');
  // GitHub Pages serves the mock demo under /<repo>/; Electron needs relative paths.
  const base = env.VITE_BASE_PATH || './';

  return {
    base, // './' by default: Electron loads assets via file://
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Demo with emulators: forward the Hosting rewrites to the Functions emulator.
      proxy: env.VITE_USE_EMULATORS === 'true' ? {
        '/account-api': { target: `http://127.0.0.1:5001/${projectId}/us-central1/accountApi`, changeOrigin: true },
        '/pos-api': { target: `http://127.0.0.1:5001/${projectId}/us-central1/posProxy`, changeOrigin: true },
      } : undefined,
    },
    plugins: [react()],
    define: {
      'process.env.APP_VERSION': JSON.stringify(process.env.npm_package_version),
      // Injected as a constant (not import.meta) so the module stays loadable by the node:test harness.
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || '')
    },
    resolve: {
      alias: [
        { find: '@plaza-config', replacement: plazaConfig },
        { find: '@', replacement: path.resolve(__dirname, './src') },
        ...(mock ? ['app', 'auth', 'firestore', 'storage'].map(name => ({ find: new RegExp(`^firebase/${name}$`), replacement: mockAlias(name) })) : []),
      ]
    }
  };
});
