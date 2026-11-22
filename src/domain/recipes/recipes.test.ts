import { describe, expect, it } from 'vitest';
import { calculateRecipeNutrition } from './nutrition';
import { scaleVersion, suggestedMeatGrams } from './scaling';
import { aggregateNeeds, buildGroceryItems, estimateListCost, packagesNeeded, subtractPantry, estimateRecipeCost } from './shopping';
import { createVersion, contentOf, diffVersions, versionLineage, branchesOf } from './versions';
import { checkMethodTransformation, checkRecipeSafety, validateSubstitution } from './safety';
import { suggestModification, applyRoleFactor } from './lab';
import { seedFoods } from '../../data/foods';
import { seedIngredients } from '../../data/ingredients';
import { seedRecipes, SEED_APPLIANCE_PROFILES, SEED_METHOD_TRANSFORMATIONS, SEED_SUBSTITUTIONS } from '../../data/recipes';
import { toGrams } from '../../lib/units';
import type { Ingredient, RecipeFeedback, RecipeVersion } from './types';
import type { Food } from '../nutrition/foods';

const now = '2026-01-01T00:00:00.000Z';
const foods = new Map(seedFoods(now).map((f) => [f.id, f]));
const ingredients = new Map(seedIngredients(now).map((i) => [i.id, i]));
const lookup = { foods, ingredients };
const { versions } = seedRecipes(now);
const v = (id: string) => versions.find((x) => x.recipeId === id)!;

/** Illustrative "curry" with round numbers matching the specification example. */
function exampleFood(id: string, kcal: number, protein: number): Food {
  return { id, name: id, kind: 'user', basis: 'g', per100: { energyKcal: kcal, proteinG: protein, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0, sugarsG: 0, sodiumMg: 0 }, servings: [], source: { kind: 'user', name: 'test' }, quality: 'user', favourite: false, archived: false, createdAt: now, updatedAt: now };
}
function exampleIng(id: string, foodId: string | null, extra: Partial<Ingredient> = {}): Ingredient {
  return { id, name: id, foodId, category: 'Other', densityGPerMl: null, unitWeightsG: {}, tags: [], packageSize: null, packagePriceNZD: null, priceUpdatedAt: null, createdAt: now, updatedAt: now, ...extra };
}
const curryLookup = {
  foods: new Map([['f1', exampleFood('f1', 200, 12.8)]]),
  ingredients: new Map([['i1', exampleIng('i1', 'f1')], ['i2', exampleIng('i2', null)]])
};
const curry: Pick<RecipeVersion, 'ingredients' | 'servings'> = { servings: 4, ingredients: [{ id: 'r1', ingredientId: 'i1', quantity: 1000, unit: 'g', preparation: '', optional: false, role: 'protein' }] };

describe('unit conversion', () => {
  it('converts mass, volume with density and counts with unit weights', () => {
    expect(toGrams(1.5, 'kg')).toEqual({ ok: true, grams: 1500 });
    expect(toGrams(2, 'tbsp', { densityGPerMl: 0.92 })).toEqual({ ok: true, grams: 27.6 });
    expect(toGrams(1, 'cup')).toMatchObject({ ok: false });
    expect(toGrams(2, 'each', { unitWeightsG: { each: 150 } })).toEqual({ ok: true, grams: 300 });
    expect(toGrams(1, 'can')).toMatchObject({ ok: false });
  });
});

describe('recipe nutrition', () => {
  it('calculates totals and per-serving values from ingredients', () => {
    const n = calculateRecipeNutrition(curry, curryLookup);
    expect(n.totalNutrients.energyKcal).toBe(2000);
    expect(n.totalNutrients.proteinG).toBeCloseTo(128);
    expect(n.perServing.energyKcal).toBe(500);
    expect(n.perServing.proteinG).toBeCloseTo(32);
    expect(n.complete).toBe(true);
  });

  it('flags missing nutrition data as incomplete rather than zero', () => {
    const withMissing = { ...curry, ingredients: [...curry.ingredients, { id: 'r2', ingredientId: 'i2', quantity: 100, unit: 'g' as const, preparation: '', optional: false, role: 'other' as const }] };
    const n = calculateRecipeNutrition(withMissing, curryLookup);
    expect(n.complete).toBe(false);
    expect(n.issues[0]?.reason).toMatch(/No nutrition/);
    expect(n.perServing.energyKcal).toBe(500); // known part retained, flagged incomplete
    expect(n.total.missing.energyKcal).toBe(1);
  });

  it('excludes optional ingredients by default', () => {
    const opt = { ...curry, ingredients: [{ ...curry.ingredients[0]!, optional: true }] };
    expect(calculateRecipeNutrition(opt, curryLookup).total.itemCount).toBe(0);
    expect(calculateRecipeNutrition(opt, curryLookup, true).totalNutrients.energyKcal).toBe(2000);
  });

  it('recalculates when ingredients change', () => {
    const changed = { ...curry, ingredients: [{ ...curry.ingredients[0]!, quantity: 500 }] };
    expect(calculateRecipeNutrition(changed, curryLookup).perServing.energyKcal).toBe(250);
  });

  it('seed recipes produce plausible nutrition; stock-based bake is flagged incomplete', () => {
    for (const ver of versions) {
      const n = calculateRecipeNutrition(ver, lookup);
      expect(n.perServing.energyKcal ?? 0).toBeGreaterThan(200);
      expect(n.perServing.energyKcal ?? 0).toBeLessThan(1200);
    }
    expect(calculateRecipeNutrition(v('rec_chicken_rice_bake'), lookup).complete).toBe(false);
    expect(calculateRecipeNutrition(v('rec_spag_bol'), lookup).complete).toBe(true);
  });
});

describe('scaling', () => {
  it('scales ingredient quantities by serving ratio', () => {
    const scaled = scaleVersion(v('rec_spag_bol'), 6);
    const mince = scaled.ingredients.find((i) => i.ingredientId === 'ing_beef_mince')!;
    expect(mince.quantity).toBe(750);
    expect(scaled.servings).toBe(6);
  });
  it('rounds count units to quarters', () => {
    const scaled = scaleVersion(v('rec_spag_bol'), 3);
    expect(scaled.ingredients.find((i) => i.ingredientId === 'ing_onion')!.quantity).toBe(0.75);
  });
  it('suggests meat by the 500 g per four servings default', () => {
    expect(suggestedMeatGrams(4)).toBe(500);
    expect(suggestedMeatGrams(6)).toBe(750);
  });
});

describe('shopping list', () => {
  const cooks = [
    { recipeName: 'Curry', version: v('rec_ip_chicken_curry'), servings: 4 },
    { recipeName: 'Bake', version: v('rec_chicken_rice_bake'), servings: 8 }
  ];
  it('aggregates the same ingredient across recipes', () => {
    const needs = aggregateNeeds(cooks, ingredients);
    const thigh = needs.find((n) => n.ingredientId === 'ing_chicken_thigh')!;
    expect(thigh.quantity).toBe(1500);
    expect(thigh.sources.size).toBe(2);
    const rice = needs.find((n) => n.ingredientId === 'ing_rice')!;
    expect(rice.quantity).toBe(900);
  });
  it('does not merge units without a known conversion', () => {
    const needs = aggregateNeeds([{ recipeName: 'x', version: { servings: 1, ingredients: [{ id: 'a', ingredientId: 'ing_garlic', quantity: 2, unit: 'clove', preparation: '', optional: false, role: 'aromatic' }, { id: 'b', ingredientId: 'ing_garlic', quantity: 10, unit: 'g', preparation: '', optional: false, role: 'aromatic' }] }, servings: 1 }], ingredients);
    expect(needs.filter((n) => n.ingredientId === 'ing_garlic')).toHaveLength(2);
  });
  it('subtracts pantry stock and treats staples as covered', () => {
    const needs = aggregateNeeds(cooks, ingredients);
    const { remaining, covered } = subtractPantry(needs, [
      { id: 'p1', ingredientId: 'ing_rice', quantity: 0.5, unit: 'kg', staple: false, updatedAt: now },
      { id: 'p2', ingredientId: 'ing_salt', quantity: 0, unit: 'g', staple: true, updatedAt: now }
    ], ingredients);
    expect(remaining.find((n) => n.ingredientId === 'ing_rice')!.quantity).toBe(400);
    expect(covered.some((n) => n.ingredientId === 'ing_salt')).toBe(true);
  });
  it('rounds up to package sizes and estimates cost', () => {
    expect(packagesNeeded(1500, 'g', ingredients.get('ing_chicken_thigh'))).toBe(3);
    expect(packagesNeeded(500, 'g', ingredients.get('ing_chicken_thigh'))).toBe(1);
    const { items } = buildGroceryItems(cooks, ingredients, []);
    const cost = estimateListCost(items);
    expect(cost.total).toBeGreaterThan(0);
    expect(items.find((i) => i.name.startsWith('Chicken thigh'))!.packages).toBe(3);
  });
  it('estimates recipe cost per serving from package prices', () => {
    const c = estimateRecipeCost(v('rec_spag_bol'), ingredients);
    expect(c.perServing).toBeGreaterThan(1);
    expect(c.perServing).toBeLessThan(10);
  });
});

describe('versioning', () => {
  it('creates immutable child versions with incrementing numbers and diffs', () => {
    const base = v('rec_ip_chicken_curry');
    const content = contentOf(base);
    const child = createVersion({ recipeId: base.recipeId, parent: base, content: { ...content, ingredients: content.ingredients.map((i) => (i.ingredientId === 'ing_ginger' ? { ...i, quantity: 40 } : i)) }, existing: [base], branch: 'extra-ginger' });
    expect(child.versionNumber).toBe(2);
    expect(child.parentVersionId).toBe(base.id);
    expect(base.ingredients.find((i) => i.ingredientId === 'ing_ginger')!.quantity).toBe(20);
    const diff = diffVersions(base, child, (id) => ingredients.get(id)!.name);
    expect(diff).toEqual(['Fresh ginger: 20 g → 40 g']);
    expect(versionLineage([base, child], child.id).map((x) => x.id)).toEqual([base.id, child.id]);
    expect(branchesOf([base, child]).map((b) => b.branch)).toEqual(['main', 'extra-ginger']);
  });
});

describe('safety and substitutions', () => {
  const profiles = new Map(SEED_APPLIANCE_PROFILES.map((p) => [p.id, p]));
  it('passes the seeded pressure-cooker curry on minimum liquid', () => {
    const f = checkRecipeSafety(v('rec_ip_chicken_curry'), ingredients, profiles);
    expect(f.some((x) => x.code === 'pressure-min-liquid')).toBe(false);
    expect(f.some((x) => x.code === 'temp-poultry')).toBe(true);
  });
  it('warns when pressure-cooker liquid is below the profile minimum', () => {
    const base = v('rec_ip_chicken_curry');
    const dry = { ...base, ingredients: base.ingredients.filter((i) => i.ingredientId !== 'ing_water') };
    expect(checkRecipeSafety(dry, ingredients, profiles).some((x) => x.code === 'pressure-min-liquid')).toBe(true);
  });
  it('blocks dried kidney beans in a slow cooker', () => {
    const ings = new Map(ingredients);
    ings.set('ing_dried_kb', exampleIng('ing_dried_kb', null, { tags: ['dried-kidney-bean'] }));
    const ver = { ...v('rec_beef_chilli'), ingredients: [{ id: 'x', ingredientId: 'ing_dried_kb', quantity: 200, unit: 'g' as const, preparation: '', optional: false, role: 'protein' as const }] };
    expect(checkRecipeSafety(ver, ings, profiles).find((x) => x.level === 'block')?.code).toBe('kidney-bean-slow-cooker');
  });
  it('validates substitutions with rules, exclusions and experimental defaults', () => {
    expect(validateSubstitution('ing_chicken_thigh', 'ing_chicken_breast', SEED_SUBSTITUTIONS, ingredients, []).status).toBe('experimental');
    const ings = new Map(ingredients);
    ings.set('ing_prawn', exampleIng('ing_prawn', null, { tags: ['seafood'] }));
    expect(validateSubstitution('ing_chicken_thigh', 'ing_prawn', SEED_SUBSTITUTIONS, ings, ['seafood'])).toMatchObject({ allowed: false, status: 'blocked' });
    const unruled = validateSubstitution('ing_chicken_thigh', 'ing_beef_mince', SEED_SUBSTITUTIONS, ingredients, []);
    expect(unruled.status).toBe('experimental');
    expect(unruled.reasons.join(' ')).toMatch(/protein type/);
  });
  it('rejects unsupported method transformations and never invents times', () => {
    expect(checkMethodTransformation('oven', 'air-fryer', SEED_METHOD_TRANSFORMATIONS)).toMatchObject({ allowed: false, status: 'blocked' });
    const ok = checkMethodTransformation('stovetop', 'slow-cooker', SEED_METHOD_TRANSFORMATIONS);
    expect(ok.allowed).toBe(true);
    expect(ok.status).toBe('experimental');
    expect(ok.guidance).not.toMatch(/\d+\s*(min|hour)/);
  });
});

describe('recipe lab suggestion', () => {
  const fb = (issues: RecipeFeedback['issues'], d: string): RecipeFeedback => ({ id: d, recipeId: 'r', recipeVersionId: 'v', cookingSessionId: null, rating: 3, issues, taste: '', texture: '', notes: '', repeat: 'with-changes', createdAt: d });
  it('suggests one modification from the most common recent issue', () => {
    const s = suggestModification([fb(['too-mild'], '2026-01-01'), fb(['too-mild', 'too-watery'], '2026-01-02')], v('rec_ip_chicken_curry'));
    expect(s?.issue).toBe('too-mild');
    expect(s?.occurrences).toBe(2);
    const applied = applyRoleFactor(v('rec_ip_chicken_curry'), 'spice', s!.factor!);
    expect(applied.ingredients.find((i) => i.ingredientId === 'ing_cumin')!.quantity).toBe(1.25);
  });
  it('returns null without feedback', () => {
    expect(suggestModification([], v('rec_ip_chicken_curry'))).toBeNull();
  });
});
