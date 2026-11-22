import { describe, expect, it } from 'vitest';
import { copyEntries, dailyTotals, entryFromFood, entryFromRecipe, frequentItems, quickEntry, rescaleEntry, totalsByMeal } from './diary';
import { estimateEnergy, energyAllowance, mifflinStJeor, targetOn, type NutritionTarget } from './targets';
import { addToTotals, emptyTotals, unknownNutrients } from './nutrients';
import type { Food } from './foods';

const now = '2026-01-01T00:00:00.000Z';
const oats: Food = { id: 'oats', name: 'Oats', kind: 'generic', basis: 'g', per100: { energyKcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, satFatG: 1.1, fibreG: 10.1, sugarsG: 1, sodiumMg: 6 }, servings: [{ id: 's', label: '1/2 cup', amount: 40 }], source: { kind: 'seed', name: 'x' }, quality: 'reference', favourite: false, archived: false, createdAt: now, updatedAt: now };
const partial: Food = { ...oats, id: 'p', name: 'Label food', per100: { ...unknownNutrients(), energyKcal: 100, proteinG: 5 } };
const recipeSnap = { recipeId: 'r1', recipeVersionId: 'r1_v1', versionNumber: 1, name: 'Chicken curry', perServing: { energyKcal: 500, proteinG: 32, carbsG: 40, fatG: 15, satFatG: 3, fibreG: 5, sugarsG: 6, sodiumMg: 600 }, incomplete: false };

describe('food diary', () => {
  it('adds a food entry with a snapshot of nutrition', () => {
    const e = entryFromFood({ food: oats, date: '2026-01-02', meal: 'breakfast', amount: 40, serving: oats.servings[0], servingCount: 1 });
    expect(e.nutrients.energyKcal).toBeCloseTo(151.6);
    expect(e.description).toBe('1 × 1/2 cup (40 g)');
    expect(e.quality).toBe('reference');
  });

  it('logs recipe servings scaled from per-serving values (1 and 1.5 servings)', () => {
    const one = entryFromRecipe({ recipe: recipeSnap, date: '2026-01-02', meal: 'dinner', servings: 1 });
    expect(one.nutrients.energyKcal).toBe(500);
    expect(one.nutrients.proteinG).toBe(32);
    const oneHalf = entryFromRecipe({ recipe: recipeSnap, date: '2026-01-02', meal: 'dinner', servings: 1.5 });
    expect(oneHalf.nutrients.energyKcal).toBe(750);
    expect(oneHalf.nutrients.proteinG).toBe(48);
    expect(oneHalf.origin).toMatchObject({ type: 'recipe', recipeVersionId: 'r1_v1', versionNumber: 1 });
  });

  it('edits portion from the stored snapshot (not the current food data)', () => {
    const e = entryFromFood({ food: oats, date: '2026-01-02', meal: 'breakfast', amount: 40 });
    oats.per100.energyKcal = 9999; // simulate the food being edited later
    const r = rescaleEntry(e, 80);
    expect(r.nutrients.energyKcal).toBeCloseTo(303.2);
    oats.per100.energyKcal = 379;
  });

  it('preserves historical nutrition when the recipe changes later', () => {
    const e = entryFromRecipe({ recipe: recipeSnap, date: '2026-01-02', meal: 'dinner', servings: 1 });
    const changedRecipe = { ...recipeSnap, recipeVersionId: 'r1_v2', versionNumber: 2, perServing: { ...recipeSnap.perServing, energyKcal: 650 } };
    const later = entryFromRecipe({ recipe: changedRecipe, date: '2026-01-03', meal: 'dinner', servings: 1 });
    expect(e.nutrients.energyKcal).toBe(500);
    expect(later.nutrients.energyKcal).toBe(650);
    expect(rescaleEntry(e, 2).nutrients.energyKcal).toBe(1000);
  });

  it('calculates daily totals and per-meal totals', () => {
    const a = entryFromFood({ food: oats, date: 'd', meal: 'breakfast', amount: 100 });
    const b = entryFromRecipe({ recipe: recipeSnap, date: 'd', meal: 'dinner', servings: 1 });
    const t = dailyTotals([a, b]);
    expect(t.values.energyKcal).toBeCloseTo(879);
    expect(t.values.proteinG).toBeCloseTo(45.2);
    expect(totalsByMeal([a, b]).dinner!.values.energyKcal).toBe(500);
  });

  it('handles missing nutrient values without treating them as zero silently', () => {
    const e = entryFromFood({ food: partial, date: 'd', meal: 'snack', amount: 100 });
    expect(e.incomplete).toBe(true);
    expect(e.nutrients.fatG).toBeNull();
    const t = dailyTotals([e, entryFromFood({ food: oats, date: 'd', meal: 'snack', amount: 100 })]);
    expect(t.missing.fatG).toBe(1);
    expect(t.missing.energyKcal).toBe(0);
  });

  it('repeats/copies meals with new ids and same snapshots', () => {
    const a = entryFromFood({ food: oats, date: '2026-01-01', meal: 'breakfast', amount: 40 });
    const [copy] = copyEntries([a], '2026-01-02');
    expect(copy!.id).not.toBe(a.id);
    expect(copy!.date).toBe('2026-01-02');
    expect(copy!.nutrients).toEqual(a.nutrients);
  });

  it('quick add records user-entered values', () => {
    const q = quickEntry({ date: 'd', meal: 'snack', name: 'Coffee', nutrients: { ...unknownNutrients(), energyKcal: 80 } });
    expect(q.quality).toBe('user');
    expect(q.incomplete).toBe(false);
  });

  it('ranks frequent items', () => {
    const a = entryFromFood({ food: oats, date: 'd', meal: 'breakfast', amount: 40 });
    const b = { ...a, id: 'x', createdAt: '2026-02-01' };
    const c = entryFromRecipe({ recipe: recipeSnap, date: 'd', meal: 'dinner', servings: 1 });
    expect(frequentItems([a, b, c])[0]!.key).toBe('food:oats');
  });

  it('tracks unknown counts in totals', () => {
    const t = addToTotals(emptyTotals(), unknownNutrients());
    expect(t.missing.energyKcal).toBe(1);
  });
});

describe('energy estimation', () => {
  it('implements Mifflin–St Jeor', () => {
    expect(mifflinStJeor({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
    expect(mifflinStJeor({ sex: 'female', ageYears: 30, heightCm: 165, weightKg: 65 })).toBeCloseTo(1370.25);
  });
  it('caps deficits and never suggests below BMR', () => {
    const e = estimateEnergy({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80, activity: 'sedentary' }, 0.5);
    expect(e.warnings.join(' ')).toMatch(/limited/);
    expect(e.suggested).toBeGreaterThanOrEqual(e.bmr);
    expect(e.deficitKcal).toBeLessThanOrEqual(e.maintenance * 0.25 + 10);
  });
  it('only adds exercise energy when opted in and the target is manual', () => {
    const t: NutritionTarget = { id: 't', effectiveFrom: '2026-01-01', energyKcal: 2000, energyMinKcal: null, energyMaxKcal: null, proteinG: 150, carbsG: null, fatG: null, fibreG: null, satFatMaxG: null, sodiumMaxMg: null, basis: 'manual', notes: '', createdAt: now };
    expect(energyAllowance(t, 300, false).allowance).toBe(2000);
    expect(energyAllowance(t, 300, true).allowance).toBe(2300);
    expect(energyAllowance({ ...t, basis: 'estimator' }, 300, true).allowance).toBe(2000);
  });
  it('selects the target effective on a date', () => {
    const mk = (id: string, from: string): NutritionTarget => ({ id, effectiveFrom: from, energyKcal: 1, energyMinKcal: null, energyMaxKcal: null, proteinG: null, carbsG: null, fatG: null, fibreG: null, satFatMaxG: null, sodiumMaxMg: null, basis: 'manual', notes: '', createdAt: now });
    const ts = [mk('a', '2026-01-01'), mk('b', '2026-02-01')];
    expect(targetOn(ts, '2026-01-15')!.id).toBe('a');
    expect(targetOn(ts, '2026-02-15')!.id).toBe('b');
    expect(targetOn(ts, '2025-12-01')).toBeNull();
  });
});
