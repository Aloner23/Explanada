function planUsers(users) {
  const ordered = [...users].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const reserved = new Set(ordered.map(u => u.username?.trim().toLowerCase()));
  const used = new Set();
  return ordered.map(user => {
    const original = user.username?.trim();
    if (!original) throw new Error(`Missing username: ${user.id}`);
    let username = original; let suffix = 2;
    if (used.has(username.toLowerCase())) {
      do { username = `${original}-${suffix++}`; } while (reserved.has(username.toLowerCase()) || used.has(username.toLowerCase()));
    }
    used.add(username.toLowerCase());
    return { id: user.id, previousUsername: user.legacyUsername || original, username, role: user.role, tenantId: user.tenantId || null, active: user.active !== false };
  });
}
module.exports = { planUsers };
