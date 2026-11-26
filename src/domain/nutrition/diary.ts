import { z } from 'zod';
import { NutrientsSchema, sumNutrients, scaleNutrients, type Nutrients, type NutrientTotals } from './nutrients';
import { DataQualitySchema, type DataQuality } from '../shared/provenance';
import { nutrientsForAmount, type Food, type FoodServing } from './foods';
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';
import type { DateKey } from '../../lib/dates';

export const DEFAULT_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MEAL_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
export function mealLabel(meal: string): string {
  return MEAL_LABEL[meal] ?? meal;
}

/** What the entry was logged from. Kept so the user can see (and re-log) the origin. */
export const LogOriginSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('food'), foodId: z.string(), amount: z.number().positive(), unit: z.enum(['g', 'ml']), servingLabel: z.string().optional(), servingCount: z.number().positive().optional() }),
  z.object({ type: z.literal('recipe'), recipeId: z.string(), recipeVersionId: z.string(), versionNumber: z.number().int(), servings: z.number().positive() }),
  z.object({ type: z.literal('quick') })
]);
export type LogOrigin = z.infer<typeof LogOriginSchema>;

/**
 * A food diary entry. `nutrients` is an immutable snapshot taken at logging time, so later
 * changes to the food or recipe never alter history. `incomplete` flags snapshots built from
 * data with unknown values.
 */
export const FoodLogEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  meal: z.string(),
  name: z.string(),
  description: z.string(),
  origin: LogOriginSchema,
  nutrients: NutrientsSchema,
  /** nutrients for one unit of `origin` (per gram/ml for food, per serving for recipe) to rescale portions without re-reading the source */
  unitNutrients: NutrientsSchema,
  incomplete: z.boolean(),
  quality: DataQualitySchema,
  groupId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type FoodLogEntry = z.infer<typeof FoodLogEntrySchema>;

export const SavedMealSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  items: z.array(FoodLogEntrySchema.pick({ name: true, description: true, origin: true, nutrients: true, unitNutrients: true, incomplete: true, quality: true })),
  favourite: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SavedMeal = z.infer<typeof SavedMealSchema>;

function hasUnknown(n: Nutrients, keys: (keyof Nutrients)[] = ['energyKcal', 'proteinG', 'carbsG', 'fatG']): boolean {
  return keys.some((k) => n[k] == null);
}

export function describeAmount(amount: number, unit: 'g' | 'ml', serving?: FoodServing, servingCount?: number): string {
  if (serving && servingCount) return `${servingCount} × ${serving.label} (${Math.round(amount)} ${unit})`;
  return `${Math.round(amount)} ${unit}`;
}

export function entryFromFood(params: { food: Food; date: DateKey; meal: string; amount: number; serving?: FoodServing; servingCount?: number }): FoodLogEntry {
  const { food, date, meal, amount, serving, servingCount } = params;
  const nutrients = nutrientsForAmount(food, amount);
  const now = nowIso();
  return {
    id: newId('log'),
    date,
    meal,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    description: describeAmount(amount, food.basis, serving, servingCount),
    origin: { type: 'food', foodId: food.id, amount, unit: food.basis, servingLabel: serving?.label, servingCount },
    nutrients,
    unitNutrients: scaleNutrients(food.per100, 1 / 100),
    incomplete: hasUnknown(food.per100),
    quality: food.quality,
    createdAt: now,
    updatedAt: now
  };
}

/** Snapshot of a recipe version's per-serving nutrition as needed by the diary. */
export interface RecipeServingSnapshot {
  recipeId: string;
  recipeVersionId: string;
  versionNumber: number;
  name: string;
  perServing: Nutrients;
  incomplete: boolean;
  /** 'calculated' from ingredient data (default) or 'estimate' when an outside estimate was used */
  quality?: DataQuality;
  /** short note shown in the diary, e.g. "recipe book estimate" */
  basisNote?: string;
}

export function entryFromRecipe(params: { recipe: RecipeServingSnapshot; date: DateKey; meal: string; servings: number }): FoodLogEntry {
  const { recipe, date, meal, servings } = params;
  const now = nowIso();
  return {
    id: newId('log'),
    date,
    meal,
    name: recipe.name,
    description: `${servings} serving${servings === 1 ? '' : 's'} · recipe v${recipe.versionNumber}${recipe.basisNote ? ` · ${recipe.basisNote}` : ''}`,
    origin: { type: 'recipe', recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, versionNumber: recipe.versionNumber, servings },
    nutrients: scaleNutrients(recipe.perServing, servings),
    unitNutrients: recipe.perServing,
    incomplete: recipe.incomplete,
    quality: recipe.quality ?? 'calculated',
    createdAt: now,
    updatedAt: now
  };
}

export function quickEntry(params: { date: DateKey; meal: string; name: string; nutrients: Nutrients }): FoodLogEntry {
  const now = nowIso();
  return {
    id: newId('log'),
    date: params.date,
    meal: params.meal,
    name: params.name || 'Quick add',
    description: 'Quick add',
    origin: { type: 'quick' },
    nutrients: params.nutrients,
    unitNutrients: params.nutrients,
    incomplete: hasUnknown(params.nutrients, ['energyKcal']),
    quality: 'user',
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Changes the portion of an entry using its own stored per-unit snapshot,
 * so editing a portion never pulls in later edits to the source food/recipe.
 */
export function rescaleEntry(entry: FoodLogEntry, newQuantity: number): FoodLogEntry {
  if (newQuantity <= 0) throw new Error('Portion must be greater than zero');
  const o = entry.origin;
  if (o.type === 'food') {
    const ratio = newQuantity / o.amount;
    const servingCount = o.servingCount ? Math.round(o.servingCount * ratio * 100) / 100 : undefined;
    return {
      ...entry,
      origin: { ...o, amount: newQuantity, servingCount },
      nutrients: scaleNutrients(entry.unitNutrients, newQuantity),
      description: servingCount && o.servingLabel ? `${servingCount} × ${o.servingLabel} (${Math.round(newQuantity)} ${o.unit})` : `${Math.round(newQuantity)} ${o.unit}`,
      updatedAt: nowIso()
    };
  }
  if (o.type === 'recipe') {
    return {
      ...entry,
      origin: { ...o, servings: newQuantity },
      nutrients: scaleNutrients(entry.unitNutrients, newQuantity),
      description: `${newQuantity} serving${newQuantity === 1 ? '' : 's'} · recipe v${o.versionNumber}${entry.quality === 'estimate' ? ' · recipe book estimate' : ''}`,
      updatedAt: nowIso()
    };
  }
  // quick entries: treat quantity as a multiplier of the original
  return { ...entry, nutrients: scaleNutrients(entry.unitNutrients, newQuantity), description: newQuantity === 1 ? 'Quick add' : `Quick add × ${newQuantity}`, updatedAt: nowIso() };
}

export function entryQuantity(entry: FoodLogEntry): number {
  const o = entry.origin;
  if (o.type === 'food') return o.amount;
  if (o.type === 'recipe') return o.servings;
  return entry.nutrients.energyKcal != null && entry.unitNutrients.energyKcal ? entry.nutrients.energyKcal / entry.unitNutrients.energyKcal : 1;
}

/** Copies entries to another date/meal. Snapshots are copied verbatim (what you ate is what you ate). */
export function copyEntries(entries: FoodLogEntry[], date: DateKey, meal?: string): FoodLogEntry[] {
  const now = nowIso();
  const groupId = newId('grp');
  return entries.map((e) => ({ ...e, id: newId('log'), date, meal: meal ?? e.meal, groupId: entries.length > 1 ? groupId : undefined, createdAt: now, updatedAt: now }));
}

export function dailyTotals(entries: FoodLogEntry[]): NutrientTotals {
  return sumNutrients(entries.map((e) => ({ nutrients: e.nutrients })));
}

export function totalsByMeal(entries: FoodLogEntry[]): Record<string, NutrientTotals> {
  const out: Record<string, NutrientTotals> = {};
  const byMeal: Record<string, FoodLogEntry[]> = {};
  for (const e of entries) (byMeal[e.meal] ??= []).push(e);
  for (const [meal, list] of Object.entries(byMeal)) out[meal] = dailyTotals(list);
  return out;
}

export interface FrequentItem {
  key: string;
  name: string;
  count: number;
  lastEntry: FoodLogEntry;
}

/** Ranks previously logged foods/recipes by frequency then recency. */
export function frequentItems(entries: FoodLogEntry[], limit = 12): FrequentItem[] {
  const map = new Map<string, FrequentItem>();
  for (const e of entries) {
    const key = e.origin.type === 'food' ? `food:${e.origin.foodId}` : e.origin.type === 'recipe' ? `recipe:${e.origin.recipeId}` : `quick:${e.name.toLowerCase()}`;
    const cur = map.get(key);
    if (!cur) map.set(key, { key, name: e.name, count: 1, lastEntry: e });
    else {
      cur.count += 1;
      if (e.createdAt > cur.lastEntry.createdAt) cur.lastEntry = e;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.lastEntry.createdAt.localeCompare(a.lastEntry.createdAt)).slice(0, limit);
}

export function recentItems(entries: FoodLogEntry[], limit = 12): FrequentItem[] {
  return frequentItems(entries, 1000)
    .sort((a, b) => b.lastEntry.createdAt.localeCompare(a.lastEntry.createdAt))
    .slice(0, limit);
}

/** Days the user explicitly marked as fully logged — used for data-completeness indicators. */
export const DayStatusSchema = z.object({ date: z.string(), complete: z.boolean(), updatedAt: z.string() });
export type DayStatus = z.infer<typeof DayStatusSchema>;
