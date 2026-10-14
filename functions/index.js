const functions = require('firebase-functions/v1');
const { generateAnalysis } = require('./analysis');
const admin = require('firebase-admin');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { randomUUID, createHash } = require('node:crypto');
const { usernameEmail, allowedPosRequest, activeProfile } = require('./security');
admin.initializeApp();
const db = admin.firestore();

function appWithCors() {
  const app = express();
  app.set('query parser', 'simple');
  // file:// is used by the packaged desktop client; protected routes still require an ID token.
  const project = process.env.GCLOUD_PROJECT || 'demo-plaza';
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  const origins = new Set([`https://${project}.web.app`, `https://${project}.firebaseapp.com`, 'http://localhost:3000', 'null', ...extra]);
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origins.has(origin)) }));
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  return app;
}
async function requireUser(req, res, next) {
  try {
    const token = /^Bearer (.+)$/.exec(req.get('Authorization') || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Inicia sesión.' });
    const decoded = await admin.auth().verifyIdToken(token, true);
    const snapshot = await db.collection('plz_users').doc(decoded.uid).get();
    const profile = snapshot.data();
    if (!activeProfile(profile)) return res.status(403).json({ error: 'Cuenta desactivada.' });
    req.user = { ...profile, id: decoded.uid };
    next();
  } catch { res.status(401).json({ error: 'Sesión no válida.' }); }
}
const handler = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const pos = appWithCors();
pos.use(requireUser);
pos.all('*', handler(async (req, res) => {
  if (!['OWNER', 'ADMIN', 'PARKING_STAFF'].includes(req.user.role)) return res.status(403).json({ error: 'Acceso POS no autorizado.' });
  const path = req.path.replace(/^\/pos-api/, '');
  if (!allowedPosRequest(req.method, path)) return res.status(403).json({ error: 'Operación POS no permitida.' });
  const target = process.env.POS_API_URL;
  // Plain HTTP is refused unless the exact upstream is also named in POS_HTTP_EXCEPTION_URL.
  const httpException = process.env.POS_ALLOW_HTTP === 'true' && !!process.env.POS_HTTP_EXCEPTION_URL && target === process.env.POS_HTTP_EXCEPTION_URL;
  if (!target || (!target.startsWith('https://') && !httpException)) {
    return res.status(503).json({ error: 'El enlace seguro con POS aún no está configurado.' });
  }
  try {
    const response = await axios({
      method: req.method, url: `${target.replace(/\/$/, '')}${path}`, params: req.query,
      data: req.body, headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 240000, maxRedirects: 0
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 502).json({ error: 'El POS no pudo completar la operación.' });
  }
}));
exports.posProxy = functions.runWith({ timeoutSeconds: 300, memory: '256MB' }).https.onRequest(pos);

const account = appWithCors();
account.use((req, res, next) => { req.url = req.url.replace(/^\/account-api/, ''); next(); });
// Public availability contains no customer names, emails, folios or payment records.
account.get('/public-snapshot', handler(async (req, res) => {
  const [config, gallery, reservations] = await Promise.all([
    db.collection('plz_config').doc('global').get(), db.collection('plz_gallery').get(),
    db.collection('plz_reservations').where('date', '>=', new Date().toISOString().slice(0, 10)).select('date', 'startTime', 'endTime', 'hallName', 'spaceId', 'status').get()
  ]);
  const c = config.data() || {};
  res.json({ parkingConfig: { id: 'global', logoUrl: c.logoUrl || '', hourlyRate: c.hourlyRate || 15, dailyMax: c.dailyMax || 200, freeMinutes: c.freeMinutes || 15 },
    galleryImages: gallery.docs.map(d => ({ ...d.data(), id: d.id })),
    reservations: reservations.docs.map(d => d.data()) });
}));
async function publicLimit(req, res, next) {
  try {
    const key = createHash('sha256').update(`${req.ip}:${Math.floor(Date.now() / 3600000)}`).digest('hex');
    const ref = db.collection('plz_rate_limits').doc(key);
    const allowed = await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const count = snap.data()?.count || 0;
      if (count >= 20) return false;
      tx.set(ref, { count: count + 1, expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7200000) }); return true;
    });
    if (!allowed) return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' });
    next();
  } catch (e) { next(e); }
}
account.post('/reservation', publicLimit, handler(async (req, res) => {
  const { date, startTime, endTime, hallName, clientName, clientEmail, spaceId } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime ||
    ![hallName, clientName, clientEmail].every(v => typeof v === 'string' && v.length > 0 && v.length < 200) ||
    (spaceId !== undefined && (typeof spaceId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(spaceId)))) return res.status(400).json({ error: 'Datos de reserva incompletos.' });
  const id = `RES-${randomUUID().toUpperCase()}`;
  const record = { id, date, startTime, endTime, hallName, clientName, clientEmail, status: 'pending', ...(spaceId ? { spaceId } : {}) };
  // This is a request, never a confirmed payment or a guaranteed booking.
  await db.collection('plz_reservations').doc(id).create(record);
  res.json(record);
}));
account.post('/reservation-lookup', publicLimit, handler(async (req, res) => {
  const id = String(req.body.id || '').trim().toUpperCase();
  // New opaque folios are bearer capabilities. Legacy short folios require staff assistance.
  if (!/^RES-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(id)) return res.status(404).json({ error: 'Solicita a administración la consulta de folios anteriores.' });
  const snapshot = await db.collection('plz_reservations').doc(id).get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Folio no encontrado.' });
  if (req.body.cancel === true) {
    await snapshot.ref.update({ status: 'cancellation_requested', cancellationReason: String(req.body.reason || '').slice(0, 1000) });
  }
  res.json({ ...snapshot.data(), ...(req.body.cancel ? { status: 'cancellation_requested' } : {}) });
}));
account.use(requireUser);
account.post('/analysis', publicLimit, handler(async (req, res) => {
  if (!['OWNER', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Acceso no autorizado.' });
  const prompt = req.body.contents;
  if (typeof prompt !== 'string' || prompt.length > 50000) return res.status(400).json({ error: 'Consulta no válida.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'El análisis no está configurado.' });
  const result = await generateAnalysis(prompt, process.env.GEMINI_API_KEY);
  if (result.status !== 200) console.warn('Auditor provider failure', { code: result.code, status: result.status });
  const { status, ...body } = result;
  res.status(status).json(body);
}));
account.post('/users', handler(async (req, res) => {
  const actor = req.user;
  if (!['OWNER', 'ADMIN'].includes(actor.role)) return res.status(403).json({ error: 'Acceso no autorizado.' });
  const input = req.body;
  const id = input.id || randomUUID();
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || typeof input.username !== 'string' || !input.username.trim() || input.username.length > 128 ||
    !['OWNER', 'ADMIN', 'STAFF', 'PARKING_STAFF', 'TENANT'].includes(input.role)) return res.status(400).json({ error: 'Datos de usuario inválidos.' });
  const ref = db.collection('plz_users').doc(id);
  const existing = (await ref.get()).data();
  if (actor.role !== 'OWNER' && (input.role === 'OWNER' || existing?.role === 'OWNER')) return res.status(403).json({ error: 'Solo el dueño puede cambiar una cuenta de propietario.' });
  if (id === actor.id && (input.active === false || input.role !== actor.role)) return res.status(400).json({ error: 'No puedes quitar tu propio acceso.' });
  if ((!existing && !input.password) || (input.password && (typeof input.password !== 'string' || input.password.length < 6))) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const profile = { id, username: input.username.trim(), role: input.role, active: input.active !== false,
    name: String(input.name || input.username).slice(0, 200), permissions: Array.isArray(input.permissions) ? input.permissions.filter(p => typeof p === 'string').slice(0, 100) : [] };
  if (input.role === 'TENANT') {
    if (typeof input.tenantId !== 'string' || !input.tenantId) return res.status(400).json({ error: 'Falta el locatario asociado.' });
    profile.tenantId = input.tenantId;
  }
  const authUpdate = { email: usernameEmail(profile.username), disabled: !profile.active, ...(input.password ? { password: input.password } : {}) };
  // An Auth identity and a profile are different services. Roll back newly created
  // identities if saving their profile fails, so retrying the same user is safe.
  let created = false;
  try {
    if (existing) await admin.auth().updateUser(id, authUpdate);
    else { await admin.auth().createUser({ uid: id, ...authUpdate }); created = true; }
    await ref.set(profile); // Whitelist: passwords are never written to Firestore.
  } catch (error) {
    if (created) await admin.auth().deleteUser(id);
    else if (existing) await admin.auth().updateUser(id, { email: usernameEmail(existing.username), disabled: existing.active === false });
    throw error;
  }
  if (!profile.active) await admin.auth().revokeRefreshTokens(id);
  res.json(profile);
}));
account.post('/stamp', handler(async (req, res) => {
  if (req.user.role !== 'TENANT' || !req.user.tenantId || !/^[A-Za-z0-9-]{1,100}$/.test(req.body.ticketId || '')) return res.status(403).json({ error: 'Operación no permitida.' });
  const tenant = (await db.collection('plz_tenants').doc(req.user.tenantId).get()).data();
  if (!tenant) return res.status(403).json({ error: 'Locatario no disponible.' });
  const ref = db.collection('plz_tickets').doc(req.body.ticketId);
  const ok = await db.runTransaction(async tx => {
    const ticket = (await tx.get(ref)).data();
    if (!ticket || ticket.status !== 'active' || ticket.convention === 'SELLO') return false;
    tx.update(ref, { convention: 'SELLO', stamped_by_local: tenant.businessName || tenant.name, updated_at: new Date().toISOString() }); return true;
  });
  res.status(ok ? 200 : 409).json({ success: ok });
}));
account.use((error, req, res, next) => {
  // Log codes only; SDK messages can include account data.
  console.error('Account API error', error.code || 'internal');
  res.status(500).json({ error: 'No se pudo completar la operación. Intenta de nuevo o contacta a administración.' });
});
exports.accountApi = functions.runWith({ secrets: ['GEMINI_API_KEY'], timeoutSeconds: 60 }).https.onRequest(account);
