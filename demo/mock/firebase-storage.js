export function getStorage() { return { type: 'mock-storage' }; }
export function connectStorageEmulator() {}
export function ref(_storage, path) { return { path }; }
export async function uploadBytes(r, file) { return { ref: { ...r, file } }; }
export async function getDownloadURL(r) { return r.file ? URL.createObjectURL(r.file) : ''; }
