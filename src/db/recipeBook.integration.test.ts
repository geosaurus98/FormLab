import { beforeEach, describe, expect, it } from 'vitest';
import sample from '../test/fixtures/recipe-book-sample.json';
import { db } from './db';
import { ensureSeeded } from './seed';
import { importRecipeBook, importedRecipeIds, setImportedValidation } from './recipeBookService';
import { logRecipe } from './foodService';
import { recipeCandidates } from './plannerService';
import { updateRecipe } from './recipeService';
import { bookRecipeId } from '../domain/recipes/recipeBook';
import { contentOf } from '../domain/recipes/versions';

const CHILLI = bookRecipeId('SlowCooker-Chilli_Con_Carne_Red_Lentils');
const clone = () => JSON.parse(JSON.stringify(sample)) as typeof sample;
function withMince(grams: number) {
  const data = clone();
  const chilli = data.find((r) => r.id === 'SlowCooker-Chilli_Con_Carne_Red_Lentils')!;
  const item = chilli.shop.find((s) => s.key === 'beef-mince')!;
  item.qty = grams;
  item.g = grams;
  return data;
}

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await ensureSeeded();
});

describe('recipe book import', () => {
  it('previews without writing, then imports recipes, ingredients and an import record', async () => {
    const preview = await importRecipeBook(sample, { dryRun: true });
    expect(preview.counts.create).toBe(5);
    expect(preview.applied).toBe(false);
    expect(await db.recipes.count()).toBe(6);

    const report = await importRecipeBook(sample, { dryRun: false, source: 'test' });
    expect(report.counts.create).toBe(5);
    expect(report.newIngredients).toBeGreaterThan(5);
    expect(await db.recipes.count()).toBe(11);
    expect(await db.ingredients.get('book_beef-stock')).toBeDefined();
    expect((await db.importRecords.toArray())[0]!.kind).toBe('recipe-book');
    const chilli = (await db.recipes.get(CHILLI))!;
    expect(chilli.source).toMatchObject({ kind: 'import', reference: 'SlowCooker-Chilli_Con_Carne_Red_Lentils' });
    expect((await db.recipeVersions.get(chilli.currentVersionId))!.validation).toBe('experimental');
    expect((await importedRecipeIds()).sort()).toHaveLength(5);
  });

  it('re-importing unchanged recipes creates no new versions', async () => {
    await importRecipeBook(sample, { dryRun: false });
    const versions = await db.recipeVersions.count();
    const again = await importRecipeBook(clone(), { dryRun: false });
    expect(again.counts.unchanged).toBe(5);
    expect(await db.recipeVersions.count()).toBe(versions);
  });

  it('a changed book recipe becomes a new main version; diary history is untouched', async () => {
    await importRecipeBook(sample, { dryRun: false });
    const entry = await logRecipe({ recipeId: CHILLI, date: '2026-11-26', meal: 'dinner', servings: 1 });
    const before = entry.nutrients.energyKcal;
    const report = await importRecipeBook(withMince(600), { dryRun: false });
    const item = report.items.find((i) => i.recipeId === CHILLI)!;
    expect(item.action).toBe('update');
    expect(item.changes.join(' ')).toMatch(/Lean beef mince: 500 g → 600 g/);
    const chilli = (await db.recipes.get(CHILLI))!;
    expect((await db.recipeVersions.get(chilli.currentVersionId))!.versionNumber).toBe(2);
    expect((await db.foodLog.get(entry.id))!.nutrients.energyKcal).toBe(before);
  });

  it("doesn't overwrite local edits: book changes go to a recipe-book branch", async () => {
    await importRecipeBook(sample, { dryRun: false });
    const chilli = (await db.recipes.get(CHILLI))!;
    const v1 = (await db.recipeVersions.get(chilli.currentVersionId))!;
    await updateRecipe(CHILLI, { meta: chilli, content: { ...contentOf(v1), servings: 6, changeSummary: 'My tweak' } });
    const mine = (await db.recipes.get(CHILLI))!.currentVersionId;
    const report = await importRecipeBook(withMince(600), { dryRun: false });
    expect(report.items.find((i) => i.recipeId === CHILLI)!.action).toBe('update-branch');
    expect((await db.recipes.get(CHILLI))!.currentVersionId).toBe(mine);
    const branch = (await db.recipeVersions.where('recipeId').equals(CHILLI).toArray()).find((v) => v.branch === 'recipe-book');
    expect(branch).toBeDefined();
  });

  it('respects recipes the user deleted', async () => {
    await importRecipeBook(sample, { dryRun: false });
    await db.recipeVersions.where('recipeId').equals(CHILLI).delete();
    await db.recipes.delete(CHILLI);
    const report = await importRecipeBook(sample, { dryRun: false });
    expect(report.items.find((i) => i.recipeId === CHILLI)!.action).toBe('skipped-deleted');
    expect(await db.recipes.get(CHILLI)).toBeUndefined();
  });

  it('logs a serving using the labelled book estimate when FormLab data is incomplete', async () => {
    await importRecipeBook(sample, { dryRun: false });
    const entry = await logRecipe({ recipeId: CHILLI, date: '2026-11-26', meal: 'dinner', servings: 1.5 });
    const book = sample.find((r) => r.id === 'SlowCooker-Chilli_Con_Carne_Red_Lentils')!.nutrition;
    expect(entry.quality).toBe('estimate');
    expect(entry.description).toMatch(/recipe book estimate/);
    expect(entry.nutrients.energyKcal).toBeCloseTo(book.kcal * 1.5);
    expect(entry.nutrients.proteinG).toBeCloseTo(book.protein * 1.5);
    expect(entry.nutrients.satFatG).toBeNull();
  });

  it('chapter filter and meal suggestions', async () => {
    const r = await importRecipeBook(sample, { dryRun: false, chapters: ['slow', 'pressure'] });
    expect(r.counts.create).toBe(2);
    await importRecipeBook(sample, { dryRun: false });
    const mains = await recipeCandidates({ categories: ['main'] });
    expect(mains.some((c) => c.recipe.id === bookRecipeId('Baking-Banana_Bread'))).toBe(false);
    expect(mains.some((c) => c.recipe.id === CHILLI)).toBe(true);
  });

  it('bulk-marks imported recipes only while they are still experimental', async () => {
    await importRecipeBook(sample, { dryRun: false });
    const ids = await importedRecipeIds();
    expect(await setImportedValidation(ids, 'kitchen-tested')).toBe(5);
    expect(await setImportedValidation(ids, 'kitchen-tested')).toBe(0);
  });
});
