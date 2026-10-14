import { PosAdapter, PosSale, PosSaleResult } from './types';

/**
 * In-memory POS used by the demo and by tests. It behaves like a well-mannered
 * bridge: deterministic folios, idempotent on `externalRef`, and rejects
 * malformed sales the same way a real backend would.
 */
export function createMockPosAdapter(options: { latencyMs?: number } = {}): PosAdapter & { sales: Map<string, PosSale & { folio: string }> } {
  const sales = new Map<string, PosSale & { folio: string }>();
  let counter = 1000;
  return {
    id: 'mock',
    enabled: true,
    sales,
    async submitSale(sale: PosSale): Promise<PosSaleResult> {
      if (options.latencyMs) await new Promise(r => setTimeout(r, options.latencyMs));
      if (!sale.externalRef) throw new Error('Venta sin referencia externa.');
      if (!sale.items.length) throw new Error('Venta sin conceptos.');
      const paid = sale.payments.reduce((s, p) => s + p.amount, 0);
      const total = sale.items.reduce((s, i) => s + i.total, 0);
      if (Math.abs(paid - total) > 0.01) throw new Error(`Pagos (${paid}) no cuadran con el total (${total}).`);
      const existing = sales.get(sale.externalRef);
      if (existing) return { folio: existing.folio };
      const folio = `MOCK-${++counter}`;
      sales.set(sale.externalRef, { ...sale, folio });
      return { folio };
    },
    async healthCheck() { return true; },
  };
}
