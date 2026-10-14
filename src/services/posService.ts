import { Transaction, ParkingConfig } from '../types';
import { authenticatedFetch } from './authService';
import { plaza } from '../config/plaza';
import { PosAdapter, PosSale, PosSaleResult } from './pos/types';
import { createMockPosAdapter } from './pos/mockAdapter';
import { createHttpPosAdapter, disabledPosAdapter } from './pos/httpAdapter';
import { buildParkingSale } from './pos/saleBuilder';

export type { PosAdapter, PosSale, PosSaleResult } from './pos/types';

/** Picks the adapter named by `pos.adapter` in plaza.config. */
function selectAdapter(): PosAdapter {
  switch (plaza.pos.adapter) {
    case 'http': return createHttpPosAdapter(authenticatedFetch);
    case 'mock': return createMockPosAdapter({ latencyMs: 250 });
    default: return disabledPosAdapter;
  }
}

let adapter: PosAdapter = selectAdapter();

export const posService = {
  get adapter() { return adapter; },
  get enabled() { return adapter.enabled; },
  /** Swap the adapter at runtime (tests, or a plugin registering its own). */
  use(next: PosAdapter) { adapter = next; },

  buildParkingSale(tx: Transaction, config: ParkingConfig, durationOverride?: number): PosSale {
    return buildParkingSale(tx, {
      terminalId: config.posTerminalId || plaza.pos.terminalId,
      branchId: config.posBranchId || plaza.pos.branchId,
      currency: plaza.currency,
      pricesIncludeTax: plaza.tax.pricesIncludeTax,
      taxRate: plaza.tax.vatRate,
      hourlyRate: config.hourlyRate || plaza.parking.hourlyRate,
    }, durationOverride);
  },

  submitSale(sale: PosSale): Promise<PosSaleResult> {
    return adapter.submitSale(sale);
  },
};
