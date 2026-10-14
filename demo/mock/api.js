// Mock of the Cloud Functions behind /account-api and /pos-api (see functions/index.js).
import { getDb, persist } from './store.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const uidFrom = init => /^Bearer mock-token:(.+)$/.exec(new Headers(init?.headers).get('Authorization') || '')?.[1];

const DEMO_REPORT = `<p><strong>Modo demostración.</strong> En producción este informe lo genera Google Gemini desde una Cloud Function
que conserva la clave en Secret Manager; el navegador solo envía las métricas agregadas del periodo.</p>
<ul><li><strong>Ocupación:</strong> revisar los locales vacantes y priorizar su comercialización.</li>
<li><strong>Cartera:</strong> dar seguimiento a los locatarios con pagos atrasados antes del día 10.</li>
<li><strong>Estacionamiento:</strong> comparar el promedio por vehículo contra la tarifa vigente en cada arqueo.</li></ul>`;

async function handle(path, init) {
  const db = getDb();
  const body = init?.body ? JSON.parse(init.body) : {};
  if (path === 'public-snapshot') {
    const c = db.plz_config.global || {};
    const today = new Date().toISOString().slice(0, 10);
    return json(200, { parkingConfig: { id: 'global', logoUrl: c.logoUrl || '', hourlyRate: c.hourlyRate, dailyMax: c.dailyMax, freeMinutes: c.freeMinutes },
      galleryImages: Object.values(db.plz_gallery),
      reservations: Object.values(db.plz_reservations).filter(r => r.date >= today).map(({ date, startTime, endTime, hallName, spaceId, status }) => ({ date, startTime, endTime, hallName, spaceId, status })) });
  }
  if (path === 'reservation') {
    const id = `RES-${crypto.randomUUID().toUpperCase()}`;
    const { date, startTime, endTime, hallName, clientName, clientEmail, spaceId } = body;
    const record = { id, date, startTime, endTime, hallName, clientName, clientEmail, status: 'pending', ...(spaceId ? { spaceId } : {}) };
    db.plz_reservations[id] = record; persist();
    return json(200, record);
  }
  if (path === 'reservation-lookup') {
    const r = db.plz_reservations[String(body.id || '').toUpperCase()];
    if (!r) return json(404, { error: 'Folio no encontrado.' });
    if (body.cancel === true) { r.status = 'cancellation_requested'; r.cancellationReason = String(body.reason || ''); persist(); }
    return json(200, r);
  }
  const uid = uidFrom(init);
  const me = uid && db.plz_users[uid];
  if (!me || me.active !== true) return json(401, { error: 'Inicia sesión.' });
  if (path === 'analysis') return ['OWNER', 'ADMIN'].includes(me.role) ? json(200, { text: body.contents?.includes('Extrae SOLO') ? '{"month":"SELECTED","year":"SELECTED"}' : DEMO_REPORT }) : json(403, { error: 'Acceso no autorizado.' });
  if (path === 'users') {
    if (!['OWNER', 'ADMIN'].includes(me.role)) return json(403, { error: 'Acceso no autorizado.' });
    const id = body.id || crypto.randomUUID();
    const { password, ...profile } = { ...body, id, active: body.active !== false };
    db.plz_users[id] = profile; persist();
    return json(200, profile);
  }
  if (path === 'stamp') {
    const t = db.plz_tickets[body.ticketId];
    const tenant = db.plz_tenants[me.tenantId];
    if (me.role !== 'TENANT' || !tenant) return json(403, { error: 'Operación no permitida.' });
    if (!t || t.status !== 'active' || t.convention === 'SELLO') return json(409, { success: false });
    Object.assign(t, { convention: 'SELLO', stamped_by_local: tenant.businessName, updated_at: new Date().toISOString() }); persist();
    return json(200, { success: true });
  }
  return json(404, { error: 'Ruta no disponible en modo demo.' });
}

let installed = false;
export function installMockApi() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const account = /\/account-api\/(.+)$/.exec(url.pathname);
    if (account) return handle(account[1], init);
    if (url.pathname.includes('/pos-api/')) return json(503, { error: 'El POS externo no está disponible en el modo demo.' });
    return realFetch(input, init);
  };
}
