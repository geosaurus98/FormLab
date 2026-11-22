import type { Nutrients } from '../nutrition/nutrients';
import type { ApplianceId, Ingredient, Recipe, RecipeVersion } from '../recipes/types';

export interface RecipeCandidate {
  recipe: Recipe;
  version: RecipeVersion;
  perServing: Nutrients;
  nutritionComplete: boolean;
  costPerServing: number | null;
  /** ingredients without a usable price — cost is a partial estimate when non-empty */
  costUnpriced: string[];
  rating: number | null;
  /** days since last cooked or planned (null = never) */
  daysSinceLast: number | null;
}

export interface PlanConstraints {
  availableAppliances: ApplianceId[];
  excludedTags: string[];
  excludedIngredientIds: string[];
  maxTotalMinutes: number | null;
  maxCostPerServing: number | null;
  minProteinPerServing: number | null;
  maxSatFatPerServing: number | null;
}

export interface ScoredRecipe {
  candidate: RecipeCandidate;
  score: number;
  reasons: string[];
  excludedBecause: string[];
}

const money = (n: number) => `NZ$${n.toFixed(2)}`;

/**
 * Transparent, rule-based scoring. Hard constraints exclude; soft preferences add or subtract
 * points with a human-readable reason for each.
 */
export function scoreRecipe(c: RecipeCandidate, k: PlanConstraints, ingredients: Map<string, Ingredient>, selectedIngredientIds: Set<string>, selectedCuisines: string[]): ScoredRecipe {
  const reasons: string[] = [];
  const excludedBecause: string[] = [];
  const v = c.version;
  const missingAppliance = v.appliances.filter((a) => !k.availableAppliances.includes(a));
  if (missingAppliance.length) excludedBecause.push(`Needs ${missingAppliance.join(', ')}`);
  for (const ri of v.ingredients) {
    if (ri.optional) continue;
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) continue;
    const bad = ing.tags.filter((t) => k.excludedTags.includes(t));
    if (bad.length) excludedBecause.push(`${ing.name} (${bad.join(', ')})`);
    if (k.excludedIngredientIds.includes(ing.id)) excludedBecause.push(`${ing.name} excluded`);
  }
  const minutes = v.prepMinutes + v.cookMinutes;
  if (k.maxTotalMinutes != null && minutes > k.maxTotalMinutes) excludedBecause.push(`${minutes} min exceeds ${k.maxTotalMinutes} min limit`);
  if (k.maxCostPerServing != null && c.costPerServing != null && c.costPerServing > k.maxCostPerServing) excludedBecause.push(`About ${money(c.costPerServing)}/serving is over budget`);
  if (v.validation === 'blocked') excludedBecause.push('Recipe is blocked');

  let score = 50;
  const p = c.perServing.proteinG;
  if (p != null) {
    if (k.minProteinPerServing != null && p >= k.minProteinPerServing) {
      score += 15;
      reasons.push(`${Math.round(p)} g protein/serving meets target`);
    } else if (k.minProteinPerServing != null) {
      score -= 10;
      reasons.push(`Only ${Math.round(p)} g protein/serving`);
    }
  } else reasons.push('Protein unknown');
  const sf = c.perServing.satFatG;
  if (sf != null && k.maxSatFatPerServing != null) {
    if (sf <= k.maxSatFatPerServing) score += 5;
    else {
      score -= 10;
      reasons.push(`${sf.toFixed(1)} g saturated fat/serving is above preference`);
    }
  }
  if (!c.nutritionComplete) {
    score -= 5;
    reasons.push('Nutrition incomplete');
  }
  if (c.costPerServing != null) {
    score += Math.max(-10, Math.min(10, (5 - c.costPerServing) * 3));
    reasons.push(`About ${money(c.costPerServing)}/serving`);
  }
  if (c.rating != null) {
    score += (c.rating - 3) * 5;
    reasons.push(`Rated ${c.rating.toFixed(1)}/5`);
  }
  if (c.daysSinceLast != null && c.daysSinceLast < 7) {
    score -= 20;
    reasons.push(`Had ${c.daysSinceLast} day(s) ago`);
  } else if (c.daysSinceLast == null) reasons.push('Not cooked yet');
  const overlap = v.ingredients.filter((ri) => selectedIngredientIds.has(ri.ingredientId) && ingredients.get(ri.ingredientId)?.category === 'Produce').length;
  if (overlap > 0) {
    score += Math.min(10, overlap * 3);
    reasons.push(`Shares ${overlap} fresh ingredient(s) with other picks`);
  }
  if (c.recipe.cuisine && selectedCuisines.includes(c.recipe.cuisine)) {
    score -= 8;
    reasons.push(`Another ${c.recipe.cuisine} meal already chosen`);
  }
  if (c.recipe.favourite) {
    score += 5;
    reasons.push('Favourite');
  }
  return { candidate: c, score: Math.round(score), reasons, excludedBecause };
}

/** Greedy plan: pick the best-scoring eligible recipe, update overlap/variety context, repeat. */
export function recommendMeals(candidates: RecipeCandidate[], k: PlanConstraints, ingredients: Map<string, Ingredient>, count: number): { picks: ScoredRecipe[]; excluded: ScoredRecipe[] } {
  const picks: ScoredRecipe[] = [];
  const selectedIngredients = new Set<string>();
  const cuisines: string[] = [];
  const excluded: ScoredRecipe[] = [];
  for (const c of candidates) {
    const s = scoreRecipe(c, k, ingredients, selectedIngredients, cuisines);
    if (s.excludedBecause.length) excluded.push(s);
  }
  const excludedIds = new Set(excluded.map((e) => e.candidate.recipe.id));
  const eligible = candidates.filter((c) => !excludedIds.has(c.recipe.id));
  while (picks.length < count && eligible.length) {
    const scored = eligible
      .map((c) => scoreRecipe(c, k, ingredients, selectedIngredients, cuisines))
      .sort((a, b) => b.score - a.score || a.candidate.recipe.name.localeCompare(b.candidate.recipe.name));
    const best = scored[0]!;
    picks.push(best);
    best.candidate.version.ingredients.forEach((ri) => selectedIngredients.add(ri.ingredientId));
    if (best.candidate.recipe.cuisine) cuisines.push(best.candidate.recipe.cuisine);
    eligible.splice(
      eligible.findIndex((c) => c.recipe.id === best.candidate.recipe.id),
      1
    );
  }
  return { picks, excluded };
}

/** Recommends recipes for the rest of today given remaining energy and protein. */
export function suggestForRemaining(candidates: RecipeCandidate[], remainingKcal: number | null, remainingProtein: number | null): { candidate: RecipeCandidate; reason: string }[] {
  return candidates
    .filter((c) => c.perServing.energyKcal != null && c.perServing.proteinG != null && c.version.validation !== 'blocked')
    .map((c) => {
      const kcal = c.perServing.energyKcal!;
      const prot = c.perServing.proteinG!;
      const fits = remainingKcal == null || kcal <= remainingKcal + 50;
      return { c, fits, density: prot / Math.max(1, kcal / 100), kcal, prot };
    })
    .filter((x) => x.fits)
    .sort((a, b) => b.density - a.density)
    .slice(0, 3)
    .map((x) => ({
      candidate: x.c,
      reason: `${Math.round(x.prot)} g protein for ${Math.round(x.kcal)} kcal per serving${remainingProtein != null ? ` (${Math.max(0, Math.round(remainingProtein))} g protein still to reach target)` : ''}`
    }));
}
