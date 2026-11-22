import { db } from './db';
import { copyEntries, entryFromFood, entryFromRecipe, quickEntry, rescaleEntry, FoodLogEntrySchema, type FoodLogEntry, type SavedMeal } from '../domain/nutrition/diary';
import { FoodSchema, type Food, type FoodServing } from '../domain/nutrition/foods';
import type { Nutrients } from '../domain/nutrition/nutrients';
import { recipeServingSnapshot } from './recipeService';
import { addDays, type DateKey } from '../lib/dates';
import { newId } from '../lib/id';
import { nowIso } from '../lib/utils';

async function addEntries(entries: FoodLogEntry[]): Promise<void> {
  for (const e of entries) FoodLogEntrySchema.parse(e);
  await db.foodLog.bulkAdd(entries);
}

export async function logFood(params: { foodId: string; date: DateKey; meal: string; amount: number; serving?: FoodServing; servingCount?: number }): Promise<FoodLogEntry> {
  const food = await db.foods.get(params.foodId);
  if (!food) throw new Error('Food not found');
  const entry = entryFromFood({ ...params, food });
  await addEntries([entry]);
  return entry;
}

export async function logRecipe(params: { recipeId: string; versionId?: string; date: DateKey; meal: string; servings: number }): Promise<FoodLogEntry> {
  const snap = await recipeServingSnapshot(params.recipeId, params.versionId);
  const entry = entryFromRecipe({ recipe: snap, date: params.date, meal: params.meal, servings: params.servings });
  await addEntries([entry]);
  return entry;
}

export async function logQuick(params: { date: DateKey; meal: string; name: string; nutrients: Nutrients }): Promise<FoodLogEntry> {
  const entry = quickEntry(params);
  await addEntries([entry]);
  return entry;
}

export async function updatePortion(entryId: string, quantity: number): Promise<void> {
  const e = await db.foodLog.get(entryId);
  if (!e) throw new Error('Entry not found');
  await db.foodLog.put(rescaleEntry(e, quantity));
}

export async function moveEntry(entryId: string, patch: { meal?: string; date?: DateKey }): Promise<void> {
  await db.foodLog.update(entryId, { ...patch, updatedAt: nowIso() });
}

export async function deleteEntry(entryId: string): Promise<FoodLogEntry | undefined> {
  const e = await db.foodLog.get(entryId);
  await db.foodLog.delete(entryId);
  return e;
}

export async function restoreEntry(entry: FoodLogEntry): Promise<void> {
  await db.foodLog.put(entry);
}

export async function entriesForDate(date: DateKey): Promise<FoodLogEntry[]> {
  return (await db.foodLog.where('date').equals(date).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Copies one meal (or all meals) from the previous day. Returns how many entries were copied. */
export async function copyFromYesterday(date: DateKey, meal?: string): Promise<number> {
  const yesterday = (await entriesForDate(addDays(date, -1))).filter((e) => !meal || e.meal === meal);
  if (!yesterday.length) return 0;
  await addEntries(copyEntries(yesterday, date));
  return yesterday.length;
}

/** Re-logs a previous entry for a date/meal, keeping its snapshot. */
export async function repeatEntry(entry: FoodLogEntry, date: DateKey, meal: string): Promise<void> {
  await addEntries(copyEntries([entry], date, meal));
}

export async function saveMealFromEntries(name: string, entries: FoodLogEntry[]): Promise<SavedMeal> {
  const now = nowIso();
  const meal: SavedMeal = { id: newId('meal'), name, favourite: true, items: entries.map(({ name: n, description, origin, nutrients, unitNutrients, incomplete, quality }) => ({ name: n, description, origin, nutrients, unitNutrients, incomplete, quality })), createdAt: now, updatedAt: now };
  await db.savedMeals.add(meal);
  return meal;
}

export async function logSavedMeal(mealId: string, date: DateKey, meal: string): Promise<number> {
  const saved = await db.savedMeals.get(mealId);
  if (!saved) throw new Error('Saved meal not found');
  const now = nowIso();
  const groupId = newId('grp');
  const entries: FoodLogEntry[] = saved.items.map((i) => ({ ...i, id: newId('log'), date, meal, groupId, createdAt: now, updatedAt: now }));
  await addEntries(entries);
  return entries.length;
}

export async function saveFood(food: Omit<Food, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Food> {
  const now = nowIso();
  const existing = food.id ? await db.foods.get(food.id) : undefined;
  const next = FoodSchema.parse({ ...existing, ...food, id: food.id ?? newId('food'), createdAt: existing?.createdAt ?? now, updatedAt: now });
  await db.foods.put(next);
  return next;
}

export async function setDayComplete(date: DateKey, complete: boolean): Promise<void> {
  await db.dayStatus.put({ date, complete, updatedAt: nowIso() });
}

/** Parses a simple CSV of foods (name,brand,kcal,protein,carbs,fat,satfat,fibre,sugars,sodium per 100 g). Empty cells stay unknown. */
export function parseFoodCsv(text: string): { foods: Omit<Food, 'id' | 'createdAt' | 'updatedAt'>[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  const foods: Omit<Food, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const header = lines[0]?.toLowerCase() ?? '';
  const start = header.includes('name') ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cells = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const [name, brand, ...nums] = cells;
    if (!name) {
      errors.push(`Line ${i + 1}: missing name`);
      continue;
    }
    const n = (s: string | undefined) => (s == null || s === '' ? null : Number(s));
    const vals = nums.map(n);
    if (vals.some((v) => v != null && (!Number.isFinite(v) || v < 0))) {
      errors.push(`Line ${i + 1}: invalid number`);
      continue;
    }
    foods.push({
      name,
      brand: brand || undefined,
      kind: brand ? 'branded' : 'generic',
      basis: 'g',
      per100: { energyKcal: vals[0] ?? null, proteinG: vals[1] ?? null, carbsG: vals[2] ?? null, fatG: vals[3] ?? null, satFatG: vals[4] ?? null, fibreG: vals[5] ?? null, sugarsG: vals[6] ?? null, sodiumMg: vals[7] ?? null },
      servings: [],
      source: { kind: 'import', name: 'CSV import' },
      quality: 'user',
      favourite: false,
      archived: false
    });
  }
  return { foods, errors };
}
