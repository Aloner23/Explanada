/**
 * Pure plaza-configuration logic (no imports, so node:test can load it directly).
 * `plaza.ts` binds these helpers to the active config.
 */

export type SpaceKind = 'hall' | 'outdoor' | 'coworking' | 'sports' | 'other';
export type LocaleType = 'LOCAL' | 'OFICINA' | 'DEPORTIVO';
export type BuildingKind = 'retail' | 'office' | 'events' | 'outdoor' | 'sports' | 'food' | 'service';

export interface SpacePricing {
  /** Price for a regular day (Mon–Thu for spaces with weekend pricing). */
  base: number;
  /** Optional Fri–Sun price. */
  weekend?: number;
  /** Optional price on configured holidays. */
  holiday?: number;
  /** Hours included in the base price (informative). */
  blockHours?: number;
}

export interface PlazaSpace {
  id: string;
  name: string;
  kind: SpaceKind;
  capacity?: number;
  description?: string;
  features?: string[];
  pricing: SpacePricing;
  /** Share of a day's capacity one booking consumes in the owner's agenda heatmap (0–1). */
  agendaWeight?: number;
}

export interface PlazaLocale {
  id: string;
  type: LocaleType;
  areaM2?: number;
}

export interface LayoutRect { x: number; y: number; width: number; depth: number }
export interface LayoutBuilding extends LayoutRect {
  id: string;
  name: string;
  kind: BuildingKind;
  height: number;
  description?: string;
  /** Locales (by id) housed in this building. */
  locales?: string[];
  /** Bookable space (by id) this building represents. */
  space?: string;
}
export interface LayoutParking extends LayoutRect { spaces: number }
export interface LayoutGreen extends LayoutRect { trees?: number }
export interface PlazaLayout {
  lot: { width: number; depth: number };
  buildings: LayoutBuilding[];
  parking: LayoutParking[];
  greens: LayoutGreen[];
}

export interface ParkingRules {
  hourlyRate: number;
  freeMinutes: number;
  dailyMax: number;
  /** Tenants pay `hourlyRate - tenantRateDiscount` per hour. */
  tenantRateDiscount: number;
  /** Minutes after the first hour still charged as one hour. */
  firstHourGraceMinutes: number;
  /** After 2 h, minutes past the hour charged as `excessFee` instead of a full hour. */
  excessGraceMinutes: number;
  excessFee: number;
  /** Extra tolerance for registered frequent customers. */
  frequentCustomerExtraMinutes: number;
  /** Partner-business convention (e.g. car wash, cinema): first N hours free. */
  partnerConvention: { label: string; freeHours: number };
  /** Parking types offered as one-tap entry buttons in the booth. */
  quickEntryTypes: string[];
}

export interface PlazaConfig {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  logo: string;
  colors: { primary: string; accent: string; dark: string };
  locale: string;
  currency: string;
  timezone: string;
  contact: {
    address: string; reference: string; hours: string; whatsapp: string; whatsappLabel: string;
    email: string; instagram: string; facebook: string; tiktok: string; mapsUrl: string;
  };
  landing: { heroTitle: string; heroSubtitle: string; heroBadge: string; about: string[]; yearsLabel: string; yearsText: string };
  tax: { country: string; vatRate: number; pricesIncludeTax: boolean; taxIdLabel: string; genericTaxId: string; satAccounting: boolean };
  parking: ParkingRules;
  calendar: { holidays: string[]; includeHolyWeek: boolean };
  spaces: PlazaSpace[];
  locales: PlazaLocale[];
  layout: PlazaLayout;
  pos: { adapter: 'mock' | 'http' | 'disabled'; terminalId: string; branchId: string };
}

const DEFAULT_PARKING: ParkingRules = {
  hourlyRate: 15, freeMinutes: 15, dailyMax: 200, tenantRateDiscount: 5,
  firstHourGraceMinutes: 15, excessGraceMinutes: 15, excessFee: 5, frequentCustomerExtraMinutes: 15,
  partnerConvention: { label: 'Convenio comercio aliado', freeHours: 3 },
  quickEntryTypes: [],
};

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

/**
 * Validates a raw config object and fills defaults. Throws with a readable message
 * when a required field is missing or malformed, so a bad config fails the build
 * instead of rendering a half-branded app.
 */
export function normalizePlazaConfig(raw: any): PlazaConfig {
  if (!raw || typeof raw !== 'object') throw new Error('plaza.config: se esperaba un objeto JSON.');
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('plaza.config: "name" es obligatorio.');
  const spaces: PlazaSpace[] = (Array.isArray(raw.spaces) ? raw.spaces : []).map((s: any, i: number) => {
    if (typeof s?.name !== 'string' || !s.name.trim()) throw new Error(`plaza.config: spaces[${i}].name es obligatorio.`);
    const base = Number(s.pricing?.base);
    if (!Number.isFinite(base) || base < 0) throw new Error(`plaza.config: spaces[${i}].pricing.base debe ser un número ≥ 0.`);
    return {
      id: typeof s.id === 'string' && s.id ? s.id : slug(s.name), name: s.name.trim(), kind: s.kind || 'hall',
      capacity: s.capacity, description: s.description || '', features: Array.isArray(s.features) ? s.features : [],
      pricing: { base, weekend: s.pricing.weekend, holiday: s.pricing.holiday, blockHours: s.pricing.blockHours },
      agendaWeight: typeof s.agendaWeight === 'number' ? Math.min(1, Math.max(0, s.agendaWeight)) : 0.25,
    };
  });
  const ids = new Set<string>();
  for (const s of spaces) { if (ids.has(s.id)) throw new Error(`plaza.config: el id de espacio "${s.id}" está repetido.`); ids.add(s.id); }

  const locales: PlazaLocale[] = (Array.isArray(raw.locales) ? raw.locales : []).map((l: any) => ({ id: String(l.id), type: ['LOCAL', 'OFICINA', 'DEPORTIVO'].includes(l.type) ? l.type : 'LOCAL', areaM2: l.areaM2 }));
  const colors = raw.colors || {};
  const name = raw.name.trim();
  const config: PlazaConfig = {
    name,
    shortName: raw.shortName || name,
    tagline: raw.tagline || '',
    description: raw.description || '',
    logo: raw.logo || 'logo.png',
    colors: { primary: isHex(colors.primary) ? colors.primary : '#2563eb', accent: isHex(colors.accent) ? colors.accent : '#f59e0b', dark: isHex(colors.dark) ? colors.dark : '#0f172a' },
    locale: raw.locale || 'es-MX',
    currency: raw.currency || 'MXN',
    timezone: raw.timezone || 'America/Mexico_City',
    contact: { address: '', reference: '', hours: '', whatsapp: '', whatsappLabel: '', email: '', instagram: '', facebook: '', tiktok: '', mapsUrl: 'https://maps.google.com/', ...(raw.contact || {}) },
    landing: { heroTitle: `${name}.`, heroSubtitle: '', heroBadge: '', about: [], yearsLabel: '', yearsText: '', ...(raw.landing || {}) },
    tax: { country: 'MX', vatRate: 0.16, pricesIncludeTax: true, taxIdLabel: 'RFC', genericTaxId: 'XAXX010101000', satAccounting: true, ...(raw.tax || {}) },
    parking: { ...DEFAULT_PARKING, ...(raw.parking || {}), partnerConvention: { ...DEFAULT_PARKING.partnerConvention, ...(raw.parking?.partnerConvention || {}) } },
    calendar: { holidays: [], includeHolyWeek: false, ...(raw.calendar || {}) },
    spaces,
    locales,
    layout: raw.layout as PlazaLayout,
    pos: { adapter: 'disabled', terminalId: 'CAJA-1', branchId: '1', ...(raw.pos || {}) },
  };
  if (!['mock', 'http', 'disabled'].includes(config.pos.adapter)) throw new Error('plaza.config: pos.adapter debe ser "mock", "http" o "disabled".');
  config.layout = resolveLayout(config, raw.layout);
  return config;
}

/**
 * Returns the configured layout, or generates one procedurally from the locales
 * and spaces when the config has none: one row of buildings per locale type, a
 * row of event spaces, and parking rows in front. Any plaza gets a usable 3D
 * model before anyone draws a plan.
 */
export function resolveLayout(config: Pick<PlazaConfig, 'locales' | 'spaces'>, layout?: Partial<PlazaLayout>): PlazaLayout {
  if (layout && Array.isArray(layout.buildings) && layout.buildings.length && layout.lot) {
    return { lot: layout.lot, buildings: layout.buildings, parking: layout.parking || [], greens: layout.greens || [] };
  }
  const margin = 6, gap = 4, unitWidth = 9, rowDepth = 12;
  const buildings: LayoutBuilding[] = [];
  const groups: [LocaleType, BuildingKind, string, number][] = [['LOCAL', 'retail', 'Locales', 4.5], ['OFICINA', 'office', 'Oficinas', 9], ['DEPORTIVO', 'sports', 'Área deportiva', 8]];
  let x = margin;
  for (const [type, kind, label, height] of groups) {
    const ids = config.locales.filter(l => l.type === type).map(l => l.id);
    if (!ids.length) continue;
    const width = Math.max(12, ids.length * unitWidth);
    buildings.push({ id: `auto-${type.toLowerCase()}`, name: label, kind, x, y: margin, width, depth: rowDepth, height, locales: ids });
    x += width + gap;
  }
  let sx = margin;
  for (const s of config.spaces) {
    const outdoor = s.kind === 'outdoor';
    const width = Math.max(14, Math.round(Math.sqrt(Math.max(40, (s.capacity || 80) * 1.5)) * 1.6));
    buildings.push({ id: s.id, name: s.name, kind: outdoor ? 'outdoor' : s.kind === 'coworking' ? 'office' : 'events', x: sx, y: margin + rowDepth + gap, width, depth: 14, height: outdoor ? 0.15 : 5.5, space: s.id, description: s.description });
    sx += width + gap;
  }
  const width = Math.max(x, sx, 60) + margin - gap;
  const parkingY = margin + rowDepth + gap + 14 + 8;
  const parking: LayoutParking[] = [
    { x: margin, y: parkingY, width: width - margin * 2, depth: 10, spaces: Math.floor((width - margin * 2) / 3) },
    { x: margin, y: parkingY + 16, width: width - margin * 2, depth: 10, spaces: Math.floor((width - margin * 2) / 3) },
  ];
  return { lot: { width, depth: parkingY + 16 + 10 + margin }, buildings, parking, greens: [] };
}

/** Formats an amount in the plaza currency and locale (e.g. "$1,500.00"). */
export const formatMoneyFor = (cfg: Pick<PlazaConfig, 'locale' | 'currency'>, amount: number, fractionDigits = 2) =>
  new Intl.NumberFormat(cfg.locale, { style: 'currency', currency: cfg.currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(Number(amount) || 0);

/** Finds the configured space a reservation/transaction refers to, by id or (legacy) by name. */
export function findSpace(ref: string | undefined | null, spaces: PlazaSpace[]): PlazaSpace | undefined {
  if (!ref) return undefined;
  const needle = ref.trim().toLowerCase();
  return spaces.find(s => s.id.toLowerCase() === needle) || spaces.find(s => s.name.toLowerCase() === needle) || spaces.find(s => needle.includes(s.name.toLowerCase()));
}

/** True when `dateStr` (YYYY-MM-DD) is a configured holiday (or Holy Thursday/Friday when enabled). */
export function isHoliday(dateStr: string, calendar: PlazaConfig['calendar']): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T12:00:00');
  const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (calendar.holidays.includes(key)) return true;
  if (!calendar.includeHolyWeek) return false;
  const year = d.getFullYear();
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const dv = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dv - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, day));
  const offset = (n: number) => new Date(easter.getTime() - n * 86400000).toISOString().slice(0, 10);
  return dateStr === offset(3) || dateStr === offset(2);
}

/** Price of a space on a date, applying holiday and weekend (Fri–Sun) pricing when configured. */
export function spacePrice(space: PlazaSpace | undefined, dateStr: string | undefined, calendar: PlazaConfig['calendar']): { amount: number; label: 'base' | 'weekend' | 'holiday' } {
  if (!space) return { amount: 0, label: 'base' };
  const { base, weekend, holiday } = space.pricing;
  if (dateStr && holiday !== undefined && isHoliday(dateStr, calendar)) return { amount: holiday, label: 'holiday' };
  if (dateStr && weekend !== undefined) {
    const day = new Date(dateStr + 'T12:00:00').getDay();
    if (day === 0 || day === 5 || day === 6) return { amount: weekend, label: 'weekend' };
  }
  return { amount: base, label: 'base' };
}

const SHADE_MIX: [number, 'w' | 'b', number][] = [
  [50, 'w', 0.92], [100, 'w', 0.84], [200, 'w', 0.68], [300, 'w', 0.5], [400, 'w', 0.3], [500, 'w', 0.14],
  [600, 'w', 0], [700, 'b', 0.18], [800, 'b', 0.34], [900, 'b', 0.48], [950, 'b', 0.62],
];

/**
 * Derives a Tailwind-style 50–950 palette from one brand color. Values are
 * "r g b" triplets so Tailwind's opacity modifiers (`bg-blue-600/20`) keep working
 * when the palette is exposed as `rgb(var(--brand-600) / <alpha-value>)`.
 */
export function brandShades(hex: string): Record<number, string> {
  const n = parseInt(hex.replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out: Record<number, string> = {};
  for (const [shade, toward, t] of SHADE_MIX) {
    const target = toward === 'w' ? 255 : 0;
    out[shade] = rgb.map(c => Math.round(c + (target - c) * t)).join(' ');
  }
  return out;
}
