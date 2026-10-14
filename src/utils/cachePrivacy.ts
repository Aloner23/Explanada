// Remove credentials left by older clients without discarding financial/offline work.
export function scrubLegacyCredentials(storage: Storage) {
  const scrub = (value: any): any => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['password', 'systemPassword'].includes(key)).map(([key, item]) => [key, scrub(item)]));
  };
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith('explanada_')) continue;
    try { storage.setItem(key, JSON.stringify(scrub(JSON.parse(storage.getItem(key)!)))); }
    catch { /* Keep unreadable or non-JSON entries; never erase pending work. */ }
  }
}
