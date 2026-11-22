import { niceQuantity } from '../../lib/units';
import type { RecipeIngredient, RecipeVersion } from './types';

export function scaleIngredients(ingredients: RecipeIngredient[], factor: number, nice = true): RecipeIngredient[] {
  if (!(factor > 0)) throw new Error('Scale factor must be positive');
  return ingredients.map((ri) => {
    const q = ri.quantity * factor;
    return { ...ri, quantity: nice ? niceQuantity(q, ri.unit) : q };
  });
}

/** Returns a scaled copy of the version content (not persisted; does not create a new version). */
export function scaleVersion<T extends Pick<RecipeVersion, 'ingredients' | 'servings'>>(version: T, targetServings: number, nice = true): T {
  const factor = targetServings / version.servings;
  return { ...version, servings: targetServings, ingredients: scaleIngredients(version.ingredients, factor, nice) };
}

/**
 * Meat-per-serving guidance helper. Default: ~500 g meat per four servings (125 g/serving).
 * Returns the suggested total grams of meat for a serving count.
 */
export function suggestedMeatGrams(servings: number, gramsPerFourServings = 500): number {
  return Math.round(((gramsPerFourServings / 4) * servings) / 10) * 10;
}
