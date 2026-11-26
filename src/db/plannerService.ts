import { db } from './db';
import { MealPlanSchema, cookingEntries, servingsToCook, type MealPlan, type MealPlanEntry } from '../domain/planner/mealPlan';
import { buildGroceryItems, GroceryListSchema, estimateRecipeCost, type GroceryItem, type GroceryList } from '../domain/recipes/shopping';
import { calculateRecipeNutrition, servingNutrition } from '../domain/recipes/nutrition';
import { averageRating } from '../domain/recipes/lab';
import type { RecipeCandidate } from '../domain/planner/recommend';
import { loadNutritionLookup } from './recipeService';
import { daysBetween, isoToDateKey, toDateKey } from '../lib/dates';
import { newId } from '../lib/id';
import { nowIso } from '../lib/utils';

export async function createPlan(params: { name: string; kind: MealPlan['kind']; weekStart: string | null }): Promise<MealPlan> {
  const now = nowIso();
  const plan = MealPlanSchema.parse({ id: newId('plan'), name: params.name, kind: params.kind, weekStart: params.weekStart, entries: [], createdAt: now, updatedAt: now });
  await db.mealPlans.add(plan);
  return plan;
}

export async function addPlanEntry(planId: string, entry: Omit<MealPlanEntry, 'id' | 'cooked' | 'note' | 'leftoverOfEntryId'> & Partial<Pick<MealPlanEntry, 'leftoverOfEntryId' | 'note'>>): Promise<MealPlanEntry> {
  const plan = await db.mealPlans.get(planId);
  if (!plan) throw new Error('Plan not found');
  const e: MealPlanEntry = { id: newId('pe'), cooked: false, note: '', leftoverOfEntryId: null, ...entry };
  await db.mealPlans.put({ ...plan, entries: [...plan.entries, e], updatedAt: nowIso() });
  return e;
}

export async function updatePlanEntry(planId: string, entryId: string, patch: Partial<MealPlanEntry>): Promise<void> {
  const plan = await db.mealPlans.get(planId);
  if (!plan) return;
  await db.mealPlans.put({ ...plan, entries: plan.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)), updatedAt: nowIso() });
}

export async function removePlanEntry(planId: string, entryId: string): Promise<void> {
  const plan = await db.mealPlans.get(planId);
  if (!plan) return;
  await db.mealPlans.put({ ...plan, entries: plan.entries.filter((e) => e.id !== entryId && e.leftoverOfEntryId !== entryId), updatedAt: nowIso() });
}

export async function generateGroceryList(planId: string): Promise<{ list: GroceryList; coveredByPantry: GroceryItem[] }> {
  const plan = await db.mealPlans.get(planId);
  if (!plan) throw new Error('Plan not found');
  const lookup = await loadNutritionLookup();
  const cooks = [];
  for (const e of cookingEntries(plan)) {
    if (e.cooked) continue;
    const [v, r] = await Promise.all([db.recipeVersions.get(e.recipeVersionId), db.recipes.get(e.recipeId)]);
    if (v && r) cooks.push({ recipeName: r.name, version: v, servings: servingsToCook(plan, e) });
  }
  const pantry = await db.pantry.toArray();
  const { items, coveredByPantry } = buildGroceryItems(cooks, lookup.ingredients, pantry);
  const shoppable = items.filter((i) => !(i.ingredientId && lookup.ingredients.get(i.ingredientId)?.tags.includes('no-shop')));
  const now = nowIso();
  const list = GroceryListSchema.parse({ id: newId('gl'), name: `Groceries — ${plan.name}`, mealPlanId: plan.id, items: shoppable, createdAt: now, updatedAt: now });
  await db.groceryLists.add(list);
  return { list, coveredByPantry };
}

export async function updateGroceryList(list: GroceryList): Promise<void> {
  await db.groceryLists.put({ ...list, updatedAt: nowIso() });
}

/** Builds recommendation candidates for all active recipes (current main version). */
/** Categories that make sense as a planned meal (imported baking, bread, desserts etc. are excluded). */
export const MEAL_CATEGORIES = ['main', 'breakfast'];
export const SNACK_CATEGORIES = ['side', 'snack', 'shake'];

export async function recipeCandidates(opts: { categories?: string[] } = {}): Promise<RecipeCandidate[]> {
  const [recipes, lookup, feedback, cooking, plans] = await Promise.all([db.recipes.toArray(), loadNutritionLookup(), db.recipeFeedback.toArray(), db.cookingSessions.toArray(), db.mealPlans.toArray()]);
  const today = toDateKey();
  const out: RecipeCandidate[] = [];
  const allowed = opts.categories?.map((c) => c.toLowerCase());
  for (const recipe of recipes.filter((r) => !r.archived && (!allowed || allowed.includes((r.category || 'main').toLowerCase())))) {
    const version = await db.recipeVersions.get(recipe.currentVersionId);
    if (!version) continue;
    const n = calculateRecipeNutrition(version, lookup);
    const cost = estimateRecipeCost(version, lookup.ingredients);
    const rating = averageRating(feedback.filter((f) => f.recipeId === recipe.id));
    const dates = [
      ...cooking.filter((c) => c.recipeId === recipe.id).map((c) => isoToDateKey(c.startedAt)),
      ...plans.flatMap((p) => p.entries.filter((e) => e.recipeId === recipe.id && e.date && e.date <= today).map((e) => e.date!))
    ].sort();
    const last = dates[dates.length - 1];
    const sn = servingNutrition(n, version.declaredNutrition);
    out.push({ recipe, version, perServing: sn.perServing, nutritionComplete: !sn.incomplete, costPerServing: cost.total > 0 ? cost.perServing : null, costUnpriced: cost.unpriced, rating: rating?.mean ?? null, daysSinceLast: last ? daysBetween(last, today) : null });
  }
  return out;
}
