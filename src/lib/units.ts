/**
 * Unit handling. Internally: mass in grams, volume in millilitres, body weight in kg.
 * Volume→mass conversion requires an explicit density; it is never assumed silently.
 */
export const MASS_UNITS = { mg: 0.001, g: 1, kg: 1000 } as const;
export const VOLUME_UNITS = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 250 } as const;
export const COUNT_UNITS = ['each', 'can', 'pack', 'clove', 'slice', 'bunch', 'jar', 'head', 'stalk', 'rasher', 'scoop', 'sheet', 'box', 'block', 'bulb', 'handful'] as const;

export type MassUnit = keyof typeof MASS_UNITS;
export type VolumeUnit = keyof typeof VOLUME_UNITS;
export type CountUnit = (typeof COUNT_UNITS)[number];
export type QuantityUnit = MassUnit | VolumeUnit | CountUnit;

export const ALL_UNITS: QuantityUnit[] = [
  ...(Object.keys(MASS_UNITS) as MassUnit[]),
  ...(Object.keys(VOLUME_UNITS) as VolumeUnit[]),
  ...COUNT_UNITS
];

export function isMassUnit(u: string): u is MassUnit {
  return u in MASS_UNITS;
}
export function isVolumeUnit(u: string): u is VolumeUnit {
  return u in VOLUME_UNITS;
}
export function isCountUnit(u: string): u is CountUnit {
  return (COUNT_UNITS as readonly string[]).includes(u);
}

/** Information needed to convert a quantity of a specific ingredient into grams. */
export interface ConversionProfile {
  /** grams per millilitre; required for volume → mass */
  densityGPerMl?: number | null;
  /** grams per countable unit, keyed by unit (e.g. { each: 120, can: 400 }) */
  unitWeightsG?: Partial<Record<CountUnit, number>> | null;
}

export type ConversionResult = { ok: true; grams: number } | { ok: false; reason: string };

export function toGrams(quantity: number, unit: QuantityUnit, profile: ConversionProfile = {}): ConversionResult {
  if (!Number.isFinite(quantity) || quantity < 0) return { ok: false, reason: 'Invalid quantity' };
  if (isMassUnit(unit)) return { ok: true, grams: quantity * MASS_UNITS[unit] };
  if (isVolumeUnit(unit)) {
    const density = profile.densityGPerMl;
    if (!density) return { ok: false, reason: `No density recorded to convert ${unit} to grams` };
    return { ok: true, grams: quantity * VOLUME_UNITS[unit] * density };
  }
  const w = profile.unitWeightsG?.[unit];
  if (!w) return { ok: false, reason: `No weight recorded for one "${unit}"` };
  return { ok: true, grams: quantity * w };
}

/** Base dimension a unit belongs to, used for aggregation without guessing densities. */
export type Dimension = 'mass' | 'volume' | 'count';
export function dimensionOf(unit: QuantityUnit): Dimension {
  if (isMassUnit(unit)) return 'mass';
  if (isVolumeUnit(unit)) return 'volume';
  return 'count';
}

/** Converts to the base unit of the same dimension (g, ml, or the count unit itself). */
export function toBase(quantity: number, unit: QuantityUnit): { quantity: number; unit: 'g' | 'ml' | CountUnit } {
  if (isMassUnit(unit)) return { quantity: quantity * MASS_UNITS[unit], unit: 'g' };
  if (isVolumeUnit(unit)) return { quantity: quantity * VOLUME_UNITS[unit], unit: 'ml' };
  return { quantity, unit };
}

export const KG_PER_LB = 0.45359237;
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export type MassDisplayUnit = 'kg' | 'lb';
export function displayMass(kg: number, unit: MassDisplayUnit, dp = 1): string {
  const v = unit === 'kg' ? kg : kgToLb(kg);
  return `${v.toFixed(dp).replace(/\.0+$/, '')} ${unit}`;
}

/** Rounds a quantity to a sensible kitchen precision. */
export function niceQuantity(q: number, unit: QuantityUnit): number {
  if (isCountUnit(unit)) return Math.round(q * 4) / 4;
  if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup') return Math.round(q * 4) / 4;
  if (q >= 100) return Math.round(q / 5) * 5;
  if (q >= 10) return Math.round(q);
  return Math.round(q * 10) / 10;
}

export function formatQuantity(q: number, unit: string): string {
  const v = Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${v} ${unit}`;
}
