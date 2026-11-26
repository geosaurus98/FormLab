import { db } from './db';
import { calculateRecipeNutrition, type NutritionLookup, type RecipeNutrition } from '../domain/recipes/nutrition';
import { contentEquals, contentOf, createVersion, type VersionContent } from '../domain/recipes/versions';
import { RecipeSchema, RecipeVersionSchema, type CookingSession, type DeclaredNutrition, type Recipe, type RecipeFeedback, type RecipeVersion } from '../domain/recipes/types';
import { newId } from '../lib/id';
import { nowIso } from '../lib/utils';
import type { RecipeServingSnapshot } from '../domain/nutrition/diary';

export async function loadNutritionLookup(): Promise<NutritionLookup> {
  const [ingredients, foods] = await Promise.all([db.ingredients.toArray(), db.foods.toArray()]);
  return { ingredients: new Map(ingredients.map((i) => [i.id, i])), foods: new Map(foods.map((f) => [f.id, f])) };
}

export async function versionNutrition(versionId: string, lookup?: NutritionLookup): Promise<{ version: RecipeVersion; nutrition: RecipeNutrition } | null> {
  const version = await db.recipeVersions.get(versionId);
  if (!version) return null;
  return { version, nutrition: calculateRecipeNutrition(version, lookup ?? (await loadNutritionLookup())) };
}

/** Snapshot used by the food diary when logging servings of a recipe version. */
export async function recipeServingSnapshot(recipeId: string, versionId?: string): Promise<RecipeServingSnapshot> {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe) throw new Error('Recipe not found');
  const res = await versionNutrition(versionId ?? recipe.currentVersionId);
  if (!res) throw new Error('Recipe version not found');
  const name = res.version.branch === 'main' ? recipe.name : `${recipe.name} (${res.version.branch})`;
  const base = { recipeId, recipeVersionId: res.version.id, versionNumber: res.version.versionNumber, name };
  return chooseServingNutrition(res.nutrition, res.version.declaredNutrition ?? null, base);
}

/**
 * Picks what to log for one serving. FormLab's ingredient calculation wins when it is complete for
 * energy and protein; otherwise a declared outside estimate (e.g. the recipe book's) is used and
 * labelled as such. With neither, the incomplete calculation is logged and flagged.
 */
export function chooseServingNutrition(nutrition: RecipeNutrition, declared: DeclaredNutrition | null, base: Pick<RecipeServingSnapshot, 'recipeId' | 'recipeVersionId' | 'versionNumber' | 'name'>): RecipeServingSnapshot {
  const calcOk = nutrition.total.missing.energyKcal === 0 && nutrition.total.missing.proteinG === 0 && nutrition.total.itemCount > 0;
  if (!calcOk && declared && declared.nutrients.energyKcal != null) {
    const n = declared.nutrients;
    return { ...base, perServing: n, incomplete: n.proteinG == null || n.carbsG == null || n.fatG == null, quality: declared.quality, basisNote: 'recipe book estimate' };
  }
  return { ...base, perServing: nutrition.perServing, incomplete: !nutrition.complete, quality: 'calculated' };
}

export interface RecipeDraft {
  meta: Pick<Recipe, 'name' | 'description' | 'cuisine' | 'category' | 'tags' | 'dietary'>;
  content: VersionContent;
}

export async function createRecipe(draft: RecipeDraft): Promise<Recipe> {
  const now = nowIso();
  const id = newId('rec');
  const version = RecipeVersionSchema.parse(createVersion({ recipeId: id, parent: null, content: draft.content, existing: [] }));
  const recipe = RecipeSchema.parse({ ...draft.meta, id, source: { kind: 'user', name: 'Created in FormLab' }, currentVersionId: version.id, favourite: false, archived: false, createdAt: now, updatedAt: now });
  await db.transaction('rw', db.recipes, db.recipeVersions, async () => {
    await db.recipeVersions.add(version);
    await db.recipes.add(recipe);
  });
  return recipe;
}

/**
 * Saves edits. Metadata updates in place; cookable content changes always create a new immutable
 * version so historical diary entries and cooking sessions keep pointing at what was actually used.
 */
export async function updateRecipe(recipeId: string, draft: RecipeDraft, parentVersionId?: string): Promise<{ recipe: Recipe; newVersion: RecipeVersion | null }> {
  return db.transaction('rw', db.recipes, db.recipeVersions, async () => {
    const recipe = await db.recipes.get(recipeId);
    if (!recipe) throw new Error('Recipe not found');
    const parent = (await db.recipeVersions.get(parentVersionId ?? recipe.currentVersionId)) ?? null;
    const existing = await db.recipeVersions.where('recipeId').equals(recipeId).toArray();
    let newVersion: RecipeVersion | null = null;
    if (!parent || !contentEquals(contentOf(parent), draft.content)) {
      newVersion = RecipeVersionSchema.parse(createVersion({ recipeId, parent, content: draft.content, existing }));
      await db.recipeVersions.add(newVersion);
    }
    const isMain = (newVersion ?? parent)?.branch === 'main';
    const updated: Recipe = { ...recipe, ...draft.meta, currentVersionId: newVersion && isMain ? newVersion.id : recipe.currentVersionId, updatedAt: nowIso() };
    await db.recipes.put(RecipeSchema.parse(updated));
    return { recipe: updated, newVersion };
  });
}

export async function duplicateRecipe(recipeId: string): Promise<Recipe> {
  const recipe = await db.recipes.get(recipeId);
  const version = recipe && (await db.recipeVersions.get(recipe.currentVersionId));
  if (!recipe || !version) throw new Error('Recipe not found');
  const created = await createRecipe({ meta: { name: `${recipe.name} (copy)`, description: recipe.description, cuisine: recipe.cuisine, category: recipe.category, tags: recipe.tags, dietary: recipe.dietary }, content: { ...contentOf(version), validation: version.validation === 'kitchen-tested' ? 'experimental' : version.validation, changeSummary: `Duplicated from ${recipe.name} v${version.versionNumber}`, changeReason: '' } });
  return created;
}

export async function setRecipeFlags(recipeId: string, flags: Partial<Pick<Recipe, 'favourite' | 'archived'>>): Promise<void> {
  await db.recipes.update(recipeId, { ...flags, updatedAt: nowIso() });
}

/** Permanently deletes a recipe only when nothing references it; otherwise the caller should archive. */
export async function deleteRecipe(recipeId: string): Promise<{ deleted: boolean; reason?: string }> {
  const logged = await db.foodLog.filter((e) => e.origin.type === 'recipe' && e.origin.recipeId === recipeId).count();
  const planned = await db.mealPlans.filter((p) => p.entries.some((e) => e.recipeId === recipeId)).count();
  if (logged || planned) return { deleted: false, reason: `Used by ${logged} diary entr${logged === 1 ? 'y' : 'ies'} and ${planned} meal plan(s). Archive it instead to keep history intact.` };
  await db.transaction('rw', [db.recipes, db.recipeVersions, db.cookingSessions, db.recipeFeedback], async () => {
    await db.recipeVersions.where('recipeId').equals(recipeId).delete();
    await db.cookingSessions.where('recipeId').equals(recipeId).delete();
    await db.recipeFeedback.where('recipeId').equals(recipeId).delete();
    await db.recipes.delete(recipeId);
  });
  return { deleted: true };
}

/* ---------- Recipe Lab ---------- */

export async function createBranch(recipeId: string, fromVersionId: string, branch: string, content: VersionContent): Promise<RecipeVersion> {
  const name = branch.trim();
  if (!name || name === 'main') throw new Error('Choose a branch name other than "main"');
  return db.transaction('rw', db.recipeVersions, async () => {
    const existing = await db.recipeVersions.where('recipeId').equals(recipeId).toArray();
    if (existing.some((v) => v.branch === name)) throw new Error('A branch with that name already exists');
    const parent = existing.find((v) => v.id === fromVersionId) ?? null;
    const v = RecipeVersionSchema.parse(createVersion({ recipeId, parent, content: { ...content, validation: content.validation === 'blocked' ? 'blocked' : 'experimental' }, existing, branch: name }));
    await db.recipeVersions.add(v);
    return v;
  });
}

/** Adopts an experiment as the new main version (copy, so the branch history stays intact). */
export async function promoteVersion(recipeId: string, versionId: string): Promise<RecipeVersion> {
  return db.transaction('rw', db.recipes, db.recipeVersions, async () => {
    const recipe = await db.recipes.get(recipeId);
    const source = await db.recipeVersions.get(versionId);
    if (!recipe || !source) throw new Error('Not found');
    const existing = await db.recipeVersions.where('recipeId').equals(recipeId).toArray();
    const mainHead = existing.find((v) => v.id === recipe.currentVersionId) ?? null;
    const v = createVersion({ recipeId, parent: mainHead, content: { ...contentOf(source), changeSummary: `Adopted from branch "${source.branch}" v${source.versionNumber}`, changeReason: source.changeReason }, existing, branch: 'main' });
    await db.recipeVersions.add(v);
    await db.recipes.update(recipeId, { currentVersionId: v.id, updatedAt: nowIso() });
    return v;
  });
}

export async function setVersionValidation(versionId: string, validation: RecipeVersion['validation']): Promise<void> {
  // Validation status is metadata about the version (not cookable content), so it's updated in place.
  await db.recipeVersions.update(versionId, { validation });
}

export async function startCooking(recipeId: string, versionId: string, servings: number): Promise<CookingSession> {
  const s: CookingSession = { id: newId('cook'), recipeId, recipeVersionId: versionId, startedAt: nowIso(), finishedAt: null, servingsMade: servings, actualMinutes: null, appliancesUsed: [], notes: '' };
  await db.cookingSessions.add(s);
  return s;
}

export async function finishCooking(sessionId: string, patch: Partial<Pick<CookingSession, 'actualMinutes' | 'notes' | 'appliancesUsed'>>): Promise<CookingSession> {
  const s = await db.cookingSessions.get(sessionId);
  if (!s) throw new Error('Cooking session not found');
  const finishedAt = nowIso();
  const actual = patch.actualMinutes ?? Math.round((new Date(finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);
  const next = { ...s, ...patch, finishedAt, actualMinutes: actual };
  await db.cookingSessions.put(next);
  return next;
}

export async function addFeedback(f: Omit<RecipeFeedback, 'id' | 'createdAt'>): Promise<RecipeFeedback> {
  const fb: RecipeFeedback = { ...f, id: newId('fb'), createdAt: nowIso() };
  await db.recipeFeedback.add(fb);
  return fb;
}
