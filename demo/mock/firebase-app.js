import { installMockApi } from './api.js';
export function initializeApp(config) { installMockApi(); return { name: '[mock]', options: config }; }
export function getApp() { return { name: '[mock]' }; }
