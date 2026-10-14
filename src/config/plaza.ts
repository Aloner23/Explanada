/**
 * Plaza configuration: everything that changes from one plaza to another.
 *
 * The JSON lives in `config/plaza.config.json` (or the file named by the
 * `PLAZA_CONFIG` environment variable at build time, see vite.config.ts) and is
 * imported through the `@plaza-config` alias. `normalizePlazaConfig` validates it
 * and fills defaults, so a minimal config (just `name` and `spaces`) still works.
 */
import rawConfig from '@plaza-config';
import { normalizePlazaConfig, formatMoneyFor, findSpace, isHoliday, spacePrice, brandShades, PlazaConfig, PlazaSpace } from './plazaLogic';

export * from './plazaLogic';

export const plaza: PlazaConfig = normalizePlazaConfig(rawConfig);

export const formatMoney = (amount: number, fractionDigits = 2) => formatMoneyFor(plaza, amount, fractionDigits);
export const findPlazaSpace = (ref: string | undefined | null) => findSpace(ref, plaza.spaces);
export const isPlazaHoliday = (dateStr: string) => isHoliday(dateStr, plaza.calendar);
export const plazaSpacePrice = (space: PlazaSpace | undefined, dateStr?: string) => spacePrice(space, dateStr, plaza.calendar);

/** Applies the configured brand colors as CSS variables (index.html maps Tailwind's `blue` palette to them). */
export function applyPlazaTheme(doc: Document = document) {
  const root = doc.documentElement;
  for (const [shade, rgb] of Object.entries(brandShades(plaza.colors.primary))) root.style.setProperty(`--brand-${shade}`, rgb);
  root.style.setProperty('--plaza-primary', plaza.colors.primary);
  root.style.setProperty('--plaza-accent', plaza.colors.accent);
  root.style.setProperty('--plaza-dark', plaza.colors.dark);
  doc.title = `${plaza.name} | Administración`;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', plaza.colors.primary);
}
