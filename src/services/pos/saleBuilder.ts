import { PosSale, PosPaymentMethod } from './types';

interface TxLike { id: string; amount: number; description?: string; paymentMethod?: string; created_at?: string; date?: string }
interface SaleContext { terminalId: string; branchId: string; currency: string; pricesIncludeTax: boolean; taxRate: number; hourlyRate: number }

const METHOD: Record<string, PosPaymentMethod> = { CASH: 'CASH', CARD: 'CARD', MERCADO_PAGO: 'TRANSFER', MEMBRESIA: 'MEMBERSHIP' };

/**
 * Turns a parking transaction into a generic `PosSale`: billable hours at the
 * configured rate, with the difference to the amount actually charged expressed
 * as a discount percentage (tolerances, tenant rate, conventions, memberships).
 */
export function buildParkingSale(tx: TxLike, ctx: SaleContext, durationOverride?: number): PosSale {
  let duration = durationOverride;
  if (duration === undefined) {
    const match = (tx.description || '').match(/\((\d+) min\)/);
    duration = match ? parseInt(match[1], 10) : 60;
  }
  const hours = Math.max(1, Math.ceil(duration / 60));
  const rate = ctx.hourlyRate || 1;
  const standard = hours * rate;
  const charged = Math.max(0, Number(tx.amount) || 0);
  const discountPct = standard > 0 ? Number(Math.min(100, Math.max(0, (1 - charged / standard) * 100)).toFixed(4)) : 0;
  return {
    externalRef: tx.id,
    terminalId: ctx.terminalId,
    branchId: ctx.branchId,
    currency: ctx.currency,
    pricesIncludeTax: ctx.pricesIncludeTax,
    taxRate: ctx.taxRate,
    items: [{ sku: 'PARKING-HOUR', description: 'Servicio de estacionamiento', quantity: hours, unitPrice: rate, discountPct, total: charged }],
    payments: [{ method: METHOD[tx.paymentMethod || 'CASH'] || 'OTHER', amount: charged }],
    createdAt: tx.created_at || (tx.date ? `${tx.date}T12:00:00.000Z` : new Date().toISOString()),
  };
}
