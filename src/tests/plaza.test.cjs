// Plaza configuration, generic POS adapter and per-space financial classification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Values created inside the vm realm have foreign prototypes; compare plain copies.
const plain = v => JSON.parse(JSON.stringify(v));
function load(file, requireMock = () => ({})) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { exports, require: requireMock, console, Date, Math, Intl, setTimeout, clearTimeout, AbortController, Promise }, { filename: file });
  return exports;
}
const logic = load('src/config/plazaLogic.ts');
const sample = JSON.parse(fs.readFileSync('config/plaza.config.json', 'utf8'));
const plaza = logic.normalizePlazaConfig(sample);

test('sample config validates and exposes branding, spaces and rules', () => {
  assert.equal(plaza.name, 'Plaza Demo');
  assert.match(plaza.colors.primary, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(plain(plaza.spaces.map(s => s.id)), ['salon-a', 'terraza', 'coworking']);
  assert.equal(plaza.currency, 'MXN');
  assert.equal(plaza.parking.partnerConvention.freeHours, 3);
  assert.ok(plaza.layout.buildings.length > 0);
});

test('invalid configs fail loudly instead of rendering a half-branded app', () => {
  assert.throws(() => logic.normalizePlazaConfig({}), /"name" es obligatorio/);
  assert.throws(() => logic.normalizePlazaConfig({ name: 'X', spaces: [{ name: 'A', pricing: { base: -1 } }] }), /pricing.base/);
  assert.throws(() => logic.normalizePlazaConfig({ name: 'X', spaces: [{ id: 'a', name: 'A', pricing: { base: 1 } }, { id: 'a', name: 'B', pricing: { base: 1 } }] }), /repetido/);
  assert.throws(() => logic.normalizePlazaConfig({ name: 'X', pos: { adapter: 'ftp' } }), /pos.adapter/);
});

test('minimal config gets defaults and a procedurally generated layout', () => {
  const cfg = logic.normalizePlazaConfig({
    name: 'Centro Mínimo',
    spaces: [{ name: 'Sala Única', pricing: { base: 1000 } }],
    locales: [{ id: 'L1', type: 'LOCAL' }, { id: 'L2', type: 'LOCAL' }, { id: 'O1', type: 'OFICINA' }],
  });
  assert.equal(cfg.spaces[0].id, 'sala-unica');
  assert.equal(cfg.parking.hourlyRate, 15);
  const { lot, buildings, parking } = cfg.layout;
  assert.deepEqual(plain(buildings.map(b => b.kind)), ['retail', 'office', 'events']);
  assert.deepEqual(plain(buildings[0].locales), ['L1', 'L2']);
  assert.equal(buildings[2].space, 'sala-unica');
  for (const r of [...buildings, ...parking]) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= lot.width && r.y + r.depth <= lot.depth, `${r.id || 'parking'} fits in the lot`);
  }
});

test('space pricing applies weekend and holiday rates from config', () => {
  const terraza = plaza.spaces.find(s => s.id === 'terraza');
  assert.deepEqual(plain(logic.spacePrice(terraza, '2026-03-03', plaza.calendar)), { amount: 5000, label: 'base' }); // Tuesday
  assert.deepEqual(plain(logic.spacePrice(terraza, '2026-03-07', plaza.calendar)), { amount: 9000, label: 'weekend' }); // Saturday
  assert.deepEqual(plain(logic.spacePrice(terraza, '2026-09-16', plaza.calendar)), { amount: 12000, label: 'holiday' });
  assert.equal(logic.isHoliday('2026-04-03', plaza.calendar), true); // Holy Friday 2026
  assert.equal(logic.spacePrice(plaza.spaces[0], '2026-03-07', plaza.calendar).amount, 4500); // no weekend price
});

test('spaces resolve by id, by name and inside free-text descriptions', () => {
  assert.equal(logic.findSpace('terraza', plaza.spaces).name, 'Terraza');
  assert.equal(logic.findSpace('Salón A', plaza.spaces).id, 'salon-a');
  assert.equal(logic.findSpace('Reserva: Coworking - Cliente (Anticipo)', plaza.spaces).id, 'coworking');
  assert.equal(logic.findSpace('Sala inexistente', plaza.spaces), undefined);
});

test('brand palette keeps the configured color at shade 600', () => {
  const shades = logic.brandShades('#0d9488');
  assert.equal(shades[600], '13 148 136');
  assert.equal(Object.keys(shades).length, 11);
});

test('event income is split per configured space, unmatched goes to "otros"', () => {
  const plazaMod = { ...logic, plaza };
  const fin = load('src/utils/financialCalculations.ts', name => (/config\/plaza$/.test(name) ? plazaMod : {}));
  const txs = [
    { id: '1', type: 'RESERVATION', subtype: 'EVENT', spaceId: 'salon-a', amount: 4500, description: 'Reserva', date: '2026-01-01' },
    { id: '2', type: 'RESERVATION', amount: 5000, description: 'Reserva: Cliente X', date: '2026-01-02' },
    { id: '3', type: 'RESERVATION', amount: 700, description: 'Reserva: evento sin espacio', date: '2026-01-03' },
    { id: '4', type: 'RENT', amount: 1000, description: 'Renta A-101', date: '2026-01-04' },
  ];
  const reservations = [{ id: 'r', clientName: 'Cliente X', hallName: 'Terraza', spaceId: 'terraza' }];
  const totals = fin.calculateFinancialBreakdown(txs, [], reservations, plaza.spaces);
  assert.equal(totals.events, 10200);
  assert.deepEqual(plain(totals.events_by_space), { 'salon-a': 4500, terraza: 5000, otros: 700 });
  assert.equal(totals.totalRevenue, 11200);
});

test('parking sale maps to the generic POS contract and the mock adapter is idempotent', async () => {
  const { buildParkingSale } = load('src/services/pos/saleBuilder.ts');
  const { createMockPosAdapter } = load('src/services/pos/mockAdapter.ts');
  const ctx = { terminalId: 'CAJA-1', branchId: '1', currency: 'MXN', pricesIncludeTax: true, taxRate: 0.16, hourlyRate: 15 };
  const sale = buildParkingSale({ id: 'tx-1', amount: 20, description: 'Cobro Estacionamiento (150 min)', paymentMethod: 'CARD' }, ctx);
  assert.equal(sale.items[0].quantity, 3);
  assert.equal(sale.items[0].discountPct, Number(((1 - 20 / 45) * 100).toFixed(4)));
  assert.deepEqual(plain(sale.payments), [{ method: 'CARD', amount: 20 }]);
  const pos = createMockPosAdapter();
  const first = await pos.submitSale(sale);
  const again = await pos.submitSale(sale);
  assert.equal(first.folio, again.folio);
  assert.equal(pos.sales.size, 1);
  await assert.rejects(pos.submitSale({ ...sale, externalRef: 'tx-2', payments: [{ method: 'CASH', amount: 1 }] }), /no cuadran/);
});

test('HTTP adapter posts PosSale to the proxy and rejects responses without a folio', async () => {
  const { createHttpPosAdapter } = load('src/services/pos/httpAdapter.ts');
  const calls = [];
  const ok = createHttpPosAdapter(async (path, init) => { calls.push([path, init.method]); return { ok: true, json: async () => ({ folio: 'F-1' }) }; });
  assert.equal((await ok.submitSale({ externalRef: 'x', items: [], payments: [] })).folio, 'F-1');
  assert.deepEqual(calls, [['/pos-api/sales', 'POST']]);
  const bad = createHttpPosAdapter(async () => ({ ok: true, json: async () => ({ message: 'sin folio' }) }));
  await assert.rejects(bad.submitSale({ externalRef: 'x', items: [], payments: [] }), /sin folio/);
  const down = createHttpPosAdapter(async () => ({ ok: false, status: 503, json: async () => ({ error: 'POS no configurado' }) }));
  await assert.rejects(down.submitSale({ externalRef: 'x', items: [], payments: [] }), /POS no configurado/);
});

test('tariff rules are configurable without touching the reference defaults', () => {
  const { calculateParkingCost } = load('src/utils/parkingLogic.ts');
  const cfg = { hourlyRate: 20, freeMinutes: 10, dailyMax: 300, selloDiscount: 0 };
  const exit = new Date('2026-01-01T12:00:00Z');
  const ticket = (mins, extra = {}) => ({ id: 't', entryTime: new Date(exit.getTime() - mins * 60000).toISOString(), plate: '', status: 'active', type: 'NORMAL', convention: 'NONE', ...extra });
  assert.equal(calculateParkingCost(ticket(90), cfg, exit).amount, 40);
  assert.equal(calculateParkingCost(ticket(70), cfg, exit).amount, 20); // within first-hour grace
  assert.equal(calculateParkingCost(ticket(70), cfg, exit, { firstHourGraceMinutes: 5 }).amount, 40);
  assert.equal(calculateParkingCost(ticket(90, { type: 'LOCATARIO' }), cfg, exit, { tenantRateDiscount: 8 }).amount, 24);
  assert.equal(calculateParkingCost(ticket(150, { convention: 'CONVENIO' }), cfg, exit, { partnerFreeHours: 1 }).amount, 40);
  assert.equal(calculateParkingCost(ticket(60 * 30), cfg, exit).amount, 300); // daily cap
});
