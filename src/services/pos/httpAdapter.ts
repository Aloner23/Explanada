import { PosAdapter, PosSale, PosSaleResult } from './types';

type FetchLike = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Sends sales to the `posProxy` Cloud Function (`/pos-api/*`), which forwards them
 * to `POS_API_URL`. The upstream is expected to implement the generic contract:
 *
 *   POST /sales   body: PosSale  →  { folio: string }
 *   GET  /health                 →  { ok: true }
 */
export function createHttpPosAdapter(fetchImpl: FetchLike, options: { baseUrl?: string; timeoutMs?: number } = {}): PosAdapter {
  const base = options.baseUrl ?? '/pos-api';
  const timeoutMs = options.timeoutMs ?? 30000;
  const call = async (path: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${path}`, { ...init, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Error POS ${response.status}`);
      return body;
    } finally { clearTimeout(timer); }
  };
  return {
    id: 'http',
    enabled: true,
    async submitSale(sale: PosSale): Promise<PosSaleResult> {
      const body = await call('/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sale) });
      const folio = body?.folio ?? body?.data?.folio;
      if (typeof folio !== 'string' || !folio) throw new Error(body?.message || 'El POS no devolvió un folio.');
      return { folio, raw: body };
    },
    async healthCheck() {
      try { return (await call('/health')).ok === true; } catch { return false; }
    },
  };
}

export const disabledPosAdapter: PosAdapter = {
  id: 'disabled',
  enabled: false,
  async submitSale() { throw new Error('La integración POS está deshabilitada en plaza.config (pos.adapter = "disabled").'); },
};
