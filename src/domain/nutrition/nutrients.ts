import { z } from 'zod';

/** Tracked nutrients. `null` means "unknown" — never treated as zero without being flagged. */
export const NUTRIENT_KEYS = ['energyKcal', 'proteinG', 'carbsG', 'fatG', 'satFatG', 'fibreG', 'sugarsG', 'sodiumMg'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const NUTRIENT_META: Record<NutrientKey, { label: string; short: string; unit: string; dp: number }> = {
  energyKcal: { label: 'Energy', short: 'kcal', unit: 'kcal', dp: 0 },
  proteinG: { label: 'Protein', short: 'Protein', unit: 'g', dp: 1 },
  carbsG: { label: 'Carbohydrate', short: 'Carbs', unit: 'g', dp: 1 },
  fatG: { label: 'Total fat', short: 'Fat', unit: 'g', dp: 1 },
  satFatG: { label: 'Saturated fat', short: 'Sat fat', unit: 'g', dp: 1 },
  fibreG: { label: 'Fibre', short: 'Fibre', unit: 'g', dp: 1 },
  sugarsG: { label: 'Sugars', short: 'Sugars', unit: 'g', dp: 1 },
  sodiumMg: { label: 'Sodium', short: 'Sodium', unit: 'mg', dp: 0 }
};

const nv = z.number().nonnegative().nullable();
export const NutrientsSchema = z.object({
  energyKcal: nv,
  proteinG: nv,
  carbsG: nv,
  fatG: nv,
  satFatG: nv,
  fibreG: nv,
  sugarsG: nv,
  sodiumMg: nv
});
export type Nutrients = z.infer<typeof NutrientsSchema>;

/**
 * Aggregated nutrient totals. `values` sums the known contributions; `missing` counts how many
 * contributing items had an unknown value for each nutrient. A total with missing > 0 is an
 * incomplete (lower-bound) estimate and must be shown as such.
 */
export interface NutrientTotals {
  values: Record<NutrientKey, number>;
  missing: Record<NutrientKey, number>;
  itemCount: number;
}

export const KJ_PER_KCAL = 4.184;

export function unknownNutrients(): Nutrients {
  return { energyKcal: null, proteinG: null, carbsG: null, fatG: null, satFatG: null, fibreG: null, sugarsG: null, sodiumMg: null };
}

export function emptyTotals(): NutrientTotals {
  const values = {} as Record<NutrientKey, number>;
  const missing = {} as Record<NutrientKey, number>;
  for (const k of NUTRIENT_KEYS) {
    values[k] = 0;
    missing[k] = 0;
  }
  return { values, missing, itemCount: 0 };
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = unknownNutrients();
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    out[k] = v == null ? null : v * factor;
  }
  return out;
}

/** Adds one item's nutrients (optionally scaled) into a running total, tracking unknowns. */
export function addToTotals(totals: NutrientTotals, n: Nutrients, factor = 1): NutrientTotals {
  const next: NutrientTotals = { values: { ...totals.values }, missing: { ...totals.missing }, itemCount: totals.itemCount + 1 };
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    if (v == null) next.missing[k] += 1;
    else next.values[k] += v * factor;
  }
  return next;
}

export function sumNutrients(items: { nutrients: Nutrients; factor?: number }[]): NutrientTotals {
  return items.reduce((t, i) => addToTotals(t, i.nutrients, i.factor ?? 1), emptyTotals());
}

/** Merges totals produced elsewhere (e.g. several days or meals). */
export function mergeTotals(...all: NutrientTotals[]): NutrientTotals {
  const out = emptyTotals();
  for (const t of all) {
    out.itemCount += t.itemCount;
    for (const k of NUTRIENT_KEYS) {
      out.values[k] += t.values[k];
      out.missing[k] += t.missing[k];
    }
  }
  return out;
}

/** Converts totals to a snapshot `Nutrients`: nutrients with any unknown contribution keep their known partial sum. */
export function totalsToNutrients(t: NutrientTotals, divideBy = 1): Nutrients {
  const out = unknownNutrients();
  for (const k of NUTRIENT_KEYS) {
    // If every item was unknown, the nutrient is unknown. Otherwise keep the partial sum.
    out[k] = t.itemCount > 0 && t.missing[k] === t.itemCount ? null : t.values[k] / divideBy;
  }
  return out;
}

export function isComplete(t: NutrientTotals, keys: readonly NutrientKey[] = NUTRIENT_KEYS): boolean {
  return keys.every((k) => t.missing[k] === 0);
}

export function formatNutrient(key: NutrientKey, value: number | null | undefined): string {
  if (value == null) return '?';
  const meta = NUTRIENT_META[key];
  const rounded = meta.dp === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return key === 'energyKcal' ? `${rounded}` : `${rounded} ${meta.unit}`;
}

/** Energy from macros (Atwater 4/4/9), used only to sanity-check user entries. */
export function atwaterKcal(n: Pick<Nutrients, 'proteinG' | 'carbsG' | 'fatG'>): number | null {
  if (n.proteinG == null || n.carbsG == null || n.fatG == null) return null;
  return n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
}
