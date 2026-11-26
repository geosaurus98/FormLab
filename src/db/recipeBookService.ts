import { db } from './db';
import { contentFingerprint, convertBookRecipe, parseRecipeBook, RECIPE_BOOK_SOURCE_NAME, type ConvertedRecipe, type IngredientDraft } from '../domain/recipes/recipeBook';
import { createVersion, diffVersions } from '../domain/recipes/versions';
import { RecipeSchema, RecipeVersionSchema, type Recipe, type RecipeVersion, type ValidationStatus } from '../domain/recipes/types';
import { newId } from '../lib/id';
import { nowIso } from '../lib/utils';

export type ImportAction = 'create' | 'update' | 'update-branch' | 'unchanged' | 'skipped-deleted' | 'meta-only';

export interface ImportItem {
  recipeId: string;
  bookId: string;
  name: string;
  category: string;
  action: ImportAction;
  changes: string[];
  skippedItems: string[];
}

export interface ImportReport {
  items: ImportItem[];
  errors: string[];
  newIngredients: number;
  ingredientConversionsAdded: number;
  counts: Record<ImportAction, number>;
  applied: boolean;
}

interface ImportState {
  /** fingerprint of the book content last imported */
  fingerprint: string;
  /** FormLab version created by the last import */
  versionId: string;
}

const stateKey = (recipeId: string) => `recipeBook:${recipeId}`;
export const RECIPE_BOOK_URL_KEY = 'recipeBookUrl';

export async function fetchRecipeBook(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't download the recipe book (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error('The recipe book file is not valid JSON.');
  }
}

/**
 * Plans (dryRun) or performs an import of recipe-book recipes.
 * - New recipes are created as v1 (experimental).
 * - Changed recipes get a new version. If the user edited the recipe in FormLab since the last
 *   import, the book's update goes to a "recipe-book" branch instead of replacing their version.
 * - Recipes the user deleted are not re-created.
 * - Existing ingredients are never overwritten; only missing unit conversions are filled in.
 */
export async function importRecipeBook(raw: unknown, opts: { dryRun: boolean; chapters?: string[]; source?: string }): Promise<ImportReport> {
  const { recipes: book, errors } = parseRecipeBook(raw);
  const selected = opts.chapters ? book.filter((r) => opts.chapters!.includes(r.chapter)) : book;
  const now = nowIso();
  const existingIngredients = new Map((await db.ingredients.toArray()).map((i) => [i.id, i]));
  const drafts = new Map<string, IngredientDraft>();
  const converted: ConvertedRecipe[] = selected.map((r) => convertBookRecipe(r, drafts, existingIngredients, now));
  const counts: Record<ImportAction, number> = { create: 0, update: 0, 'update-branch': 0, unchanged: 0, 'skipped-deleted': 0, 'meta-only': 0 };
  const items: ImportItem[] = [];
  const ingName = (id: string) => drafts.get(id)?.ingredient.name ?? existingIngredients.get(id)?.name ?? id;

  const run = async () => {
    for (const c of converted) {
      const [recipe, state, versions] = await Promise.all([db.recipes.get(c.recipeId), db.meta.get(stateKey(c.recipeId)), db.recipeVersions.where('recipeId').equals(c.recipeId).toArray()]);
      const prior = state?.value as ImportState | undefined;
      const fingerprint = contentFingerprint(c.content, c.meta);
      let action: ImportAction;
      let changes: string[] = [];

      if (!recipe && prior) action = 'skipped-deleted';
      else if (!recipe) action = 'create';
      else if (prior && prior.fingerprint === fingerprint) action = 'unchanged';
      else {
        const lastImported = versions.find((v) => v.id === prior?.versionId) ?? versions.find((v) => v.id === recipe.currentVersionId)!;
        changes = diffVersions(lastImported, c.content, ingName);
        const userEdited = recipe.currentVersionId !== prior?.versionId;
        action = changes.length === 0 ? 'meta-only' : userEdited ? 'update-branch' : 'update';
      }
      counts[action]++;
      items.push({ recipeId: c.recipeId, bookId: c.bookId, name: c.meta.name, category: c.meta.category, action, changes, skippedItems: c.skippedItems });
      if (opts.dryRun) continue;

      if (action === 'create') {
        const version = RecipeVersionSchema.parse({ ...c.content, id: newId('rv'), recipeId: c.recipeId, versionNumber: 1, parentVersionId: null, branch: 'main', createdAt: now });
        const rec: Recipe = RecipeSchema.parse({ id: c.recipeId, ...c.meta, source: { kind: 'import', name: RECIPE_BOOK_SOURCE_NAME, reference: c.bookId, ...(c.file ? { note: c.file } : {}) }, currentVersionId: version.id, favourite: false, archived: false, createdAt: now, updatedAt: now });
        await db.recipeVersions.add(version);
        await db.recipes.add(rec);
        await db.meta.put({ key: stateKey(c.recipeId), value: { fingerprint, versionId: version.id } satisfies ImportState });
      } else if (action === 'update' || action === 'update-branch') {
        const branchName = action === 'update' ? 'main' : 'recipe-book';
        const parent = action === 'update' ? versions.find((v) => v.id === recipe!.currentVersionId) ?? null : versions.find((v) => v.id === prior?.versionId) ?? null;
        const v = RecipeVersionSchema.parse(createVersion({ recipeId: c.recipeId, parent, content: { ...c.content, changeSummary: `Updated from recipe book: ${changes.join('; ')}` }, existing: versions, branch: branchName }));
        await db.recipeVersions.add(v);
        await db.recipes.put({ ...recipe!, ...c.meta, currentVersionId: action === 'update' ? v.id : recipe!.currentVersionId, updatedAt: now });
        await db.meta.put({ key: stateKey(c.recipeId), value: { fingerprint, versionId: action === 'update' ? v.id : prior?.versionId ?? v.id } satisfies ImportState });
      } else if (action === 'meta-only') {
        await db.recipes.put({ ...recipe!, ...c.meta, updatedAt: now });
        await db.meta.put({ key: stateKey(c.recipeId), value: { fingerprint, versionId: prior?.versionId ?? recipe!.currentVersionId } satisfies ImportState });
      }
    }
    if (!opts.dryRun) {
      for (const d of drafts.values()) {
        if (d.isNew) await db.ingredients.put(d.ingredient);
        else if (Object.keys(d.addedUnitWeights).length || d.addedDensity != null) {
          const cur = await db.ingredients.get(d.ingredient.id);
          if (cur) await db.ingredients.put({ ...cur, unitWeightsG: { ...d.addedUnitWeights, ...cur.unitWeightsG }, densityGPerMl: cur.densityGPerMl ?? d.addedDensity, updatedAt: now });
        }
      }
      await db.importRecords.add({ id: newId('imp'), kind: 'recipe-book', at: now, fileName: opts.source ?? 'recipes.json', counts: { ...counts, newIngredients: [...drafts.values()].filter((d) => d.isNew).length }, notes: errors.join('; ') });
    }
  };

  if (opts.dryRun) await run();
  else await db.transaction('rw', [db.recipes, db.recipeVersions, db.ingredients, db.meta, db.importRecords], run);

  // Only count conversions for ingredients that will actually be used by the selected recipes.
  const newIngredients = [...drafts.values()].filter((d) => d.isNew).length;
  const ingredientConversionsAdded = [...drafts.values()].filter((d) => !d.isNew && (Object.keys(d.addedUnitWeights).length || d.addedDensity != null)).length;
  return { items, errors, newIngredients, ingredientConversionsAdded, counts, applied: !opts.dryRun };
}

/** Marks the current version of every imported recipe that is still "experimental" with a new status. */
export async function setImportedValidation(recipeIds: string[], status: ValidationStatus): Promise<number> {
  let n = 0;
  await db.transaction('rw', db.recipes, db.recipeVersions, async () => {
    for (const id of recipeIds) {
      const r = await db.recipes.get(id);
      const v: RecipeVersion | undefined = r ? await db.recipeVersions.get(r.currentVersionId) : undefined;
      if (v && v.validation === 'experimental') {
        await db.recipeVersions.update(v.id, { validation: status });
        n++;
      }
    }
  });
  return n;
}

export async function importedRecipeIds(): Promise<string[]> {
  return (await db.recipes.toArray()).filter((r) => r.source.kind === 'import' && r.source.name === RECIPE_BOOK_SOURCE_NAME).map((r) => r.id);
}
