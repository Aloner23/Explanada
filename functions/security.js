const { createHash } = require('node:crypto');
const usernameEmail = username => `${createHash('sha256').update(username.trim().toLowerCase()).digest('hex')}@users.explanada.invalid`;
// Generic POS bridge contract (see docs/POS.md). Anything else is refused before it
// reaches the upstream, including path traversal and destructive verbs.
const allowedPosRequest = (method, path) => {
  const routes = {
    GET: [/^\/health$/, /^\/sales\/[A-Za-z0-9_-]{1,128}$/],
    POST: [/^\/sales$/],
  };
  return (routes[method] || []).some(pattern => pattern.test(path));
};
const activeProfile = p => !!p && p.active === true;
module.exports = { usernameEmail, allowedPosRequest, activeProfile };
