/**
 * Generic point-of-sale (POS/ERP) integration contract.
 *
 * Explanada records every parking payment in Firestore first. A POS adapter is an
 * optional, pluggable step that mirrors that sale into an external POS/ERP and
 * returns its folio. Adapters never see Firebase credentials: the HTTP adapter
 * talks to the `posProxy` Cloud Function, which holds the upstream URL and only
 * forwards an allowlisted set of routes (see functions/security.js).
 *
 * To integrate a specific ERP, either implement a small bridge service that
 * speaks the `PosSale` JSON below (recommended — no client changes), or add a
 * new adapter here and register it in `../posService.ts`.
 */

export type PosPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MEMBERSHIP' | 'OTHER';

export interface PosSaleItem {
  sku: string;
  description: string;
  quantity: number;
  /** Unit price including taxes when `pricesIncludeTax` is true. */
  unitPrice: number;
  /** 0–100. */
  discountPct: number;
  total: number;
}

export interface PosSale {
  /** Idempotency key: the Explanada transaction id. Bridges must ignore repeats. */
  externalRef: string;
  terminalId: string;
  branchId: string;
  currency: string;
  pricesIncludeTax: boolean;
  taxRate: number;
  items: PosSaleItem[];
  payments: { method: PosPaymentMethod; amount: number }[];
  createdAt: string;
}

export interface PosSaleResult {
  folio: string;
  raw?: unknown;
}

export interface PosAdapter {
  /** Short identifier shown in the UI ("mock", "http", "disabled"). */
  readonly id: string;
  readonly enabled: boolean;
  /** Sends one sale. Must throw on failure so the caller can mark it for retry. */
  submitSale(sale: PosSale): Promise<PosSaleResult>;
  /** Optional connectivity check for the admin screen. */
  healthCheck?(): Promise<boolean>;
}
