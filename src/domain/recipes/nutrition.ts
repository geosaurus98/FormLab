import { addToTotals, emptyTotals, totalsToNutrients, type Nutrients, type NutrientTotals } from '../nutrition/nutrients';
import { nutrientsForAmount, type Food } from '../nutrition/foods';
import { toGrams } from '../../lib/units';
import type { Ingredient, RecipeVersion } from './types';

export interface IngredientNutritionIssue {
  recipeIngredientId: string;
  ingredientName: string;
  reason: string;
}

export interface RecipeNutrition {
  total: NutrientTotals;
  perServing: Nutrients;
  totalNutrients: Nutrients;
  issues: IngredientNutritionIssue[];
  /** true when every included ingredient contributed known values for energy and macros */
  complete: boolean;
  totalGrams: number;
}

export interface NutritionLookup {
  ingredients: Map<string, Ingredient>;
  foods: Map<string, Food>;
}

/**
 * Calculates recipe nutrition from structured ingredient data. Optional ingredients are excluded
 * unless `includeOptional`. Ingredients that cannot be resolved are reported as issues and counted
 * as "missing" so the totals are displayed as incomplete estimates.
 */
export function calculateRecipeNutrition(version: Pick<RecipeVersion, 'ingredients' | 'servings'>, lookup: NutritionLookup, includeOptional = false): RecipeNutrition {
  let total = emptyTotals();
  const issues: IngredientNutritionIssue[] = [];
  let totalGrams = 0;
  const unknown: Nutrients = { energyKcal: null, proteinG: null, carbsG: null, fatG: null, satFatG: null, fibreG: null, sugarsG: null, sodiumMg: null };

  for (const ri of version.ingredients) {
    if (ri.optional && !includeOptional) continue;
    const ing = lookup.ingredients.get(ri.ingredientId);
    if (!ing) {
      issues.push({ recipeIngredientId: ri.id, ingredientName: 'Unknown ingredient', reason: 'Ingredient record not found' });
      total = addToTotals(total, unknown);
      continue;
    }
    const food = ing.foodId ? lookup.foods.get(ing.foodId) : undefined;
    if (!food) {
      issues.push({ recipeIngredientId: ri.id, ingredientName: ing.name, reason: 'No nutrition data linked' });
      total = addToTotals(total, unknown);
      continue;
    }
    // Foods are stored per 100 g or per 100 ml. Convert the recipe quantity into the food's basis.
    let amount: number | null = null;
    if (food.basis === 'g') {
      const r = toGrams(ri.quantity, ri.unit, { densityGPerMl: ing.densityGPerMl, unitWeightsG: ing.unitWeightsG });
      if (r.ok) amount = r.grams;
      else issues.push({ recipeIngredientId: ri.id, ingredientName: ing.name, reason: r.reason });
    } else {
      // ml basis: volume units convert directly; mass needs density
      const vol = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 250 } as Record<string, number>;
      if (ri.unit in vol) amount = ri.quantity * (vol[ri.unit] ?? 1);
      else {
        const r = toGrams(ri.quantity, ri.unit, { unitWeightsG: ing.unitWeightsG, densityGPerMl: ing.densityGPerMl });
        if (r.ok && ing.densityGPerMl) amount = r.grams / ing.densityGPerMl;
        else issues.push({ recipeIngredientId: ri.id, ingredientName: ing.name, reason: r.ok ? 'No density to convert grams to ml' : r.reason });
      }
    }
    if (amount == null) {
      total = addToTotals(total, unknown);
      continue;
    }
    totalGrams += food.basis === 'g' ? amount : amount * (ing.densityGPerMl ?? 1);
    const n = nutrientsForAmount(food, amount);
    for (const k of ['energyKcal', 'proteinG', 'carbsG', 'fatG'] as const) {
      if (n[k] == null) issues.push({ recipeIngredientId: ri.id, ingredientName: ing.name, reason: `Unknown ${k}` });
    }
    total = addToTotals(total, n);
  }
  const complete = (['energyKcal', 'proteinG', 'carbsG', 'fatG'] as const).every((k) => total.missing[k] === 0);
  return {
    total,
    totalNutrients: totalsToNutrients(total),
    perServing: totalsToNutrients(total, version.servings),
    issues,
    complete,
    totalGrams
  };
}
