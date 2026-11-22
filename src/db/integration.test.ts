import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { ensureSeeded, addExampleProgrammes } from './seed';
import { createRecipe, updateRecipe, startCooking, finishCooking, createBranch, promoteVersion, deleteRecipe, duplicateRecipe, versionNutrition } from './recipeService';
import { copyFromYesterday, entriesForDate, logFood, logRecipe, updatePortion, deleteEntry, saveMealFromEntries, logSavedMeal, parseFoodCsv } from './foodService';
import { addPlanEntry, createPlan, generateGroceryList, recipeCandidates } from './plannerService';
import { finishWorkout, getActiveWorkout, saveWorkout, startWorkout, saveEditedWorkout, logCardio } from './workoutService';
import { exportBackup, restoreBackup, validateBackup } from './backup';
import { toggleSetComplete, updateSet } from '../domain/workouts/session';
import { computeRecords, exerciseProgress } from '../domain/workouts/records';
import { contentOf } from '../domain/recipes/versions';
import { dailyTotals } from '../domain/nutrition/diary';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await ensureSeeded();
});

describe('seed data', () => {
  it('seeds reference data but no personal history', async () => {
    expect(await db.recipes.count()).toBe(6);
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(40);
    expect(await db.exercises.count()).toBeLessThanOrEqual(60);
    expect(await db.workouts.count()).toBe(0);
    expect(await db.foodLog.count()).toBe(0);
    expect(await db.body.count()).toBe(0);
    expect(await db.templates.count()).toBe(0);
    expect((await db.recipeVersions.toArray()).every((v) => v.validation !== 'kitchen-tested')).toBe(true);
    await ensureSeeded(); // idempotent
    expect(await db.recipes.count()).toBe(6);
    await addExampleProgrammes();
    expect(await db.programmes.count()).toBe(3);
  });
});

describe('end-to-end data flow (service layer)', () => {
  it('recipe → plan → groceries → cook → diary → workout → export/restore', async () => {
    // 1. Create a recipe
    const recipe = await createRecipe({
      meta: { name: 'Test chicken rice', description: '', cuisine: 'Test', category: 'Main', tags: [], dietary: [] },
      content: {
        servings: 4, prepMinutes: 10, cookMinutes: 20, appliances: ['stovetop'], equipment: [], validation: 'experimental', changeSummary: 'Initial', changeReason: '',
        ingredients: [
          { id: 'a', ingredientId: 'ing_chicken_breast', quantity: 500, unit: 'g', preparation: '', optional: false, role: 'protein' },
          { id: 'b', ingredientId: 'ing_rice', quantity: 300, unit: 'g', preparation: '', optional: false, role: 'base' }
        ],
        steps: [{ id: 's', text: 'Cook it', appliance: 'stovetop', timerMinutes: null, safetyNote: null }]
      }
    });
    const n1 = (await versionNutrition(recipe.currentVersionId))!.nutrition;
    // 500 g breast @120 + 300 g rice @365 = 600 + 1095 = 1695 kcal → 423.75/serving
    expect(n1.perServing.energyKcal).toBeCloseTo(423.75);

    // 2. Plan it
    const plan = await createPlan({ name: 'This week', kind: 'dated', weekStart: '2026-11-23' });
    await addPlanEntry(plan.id, { date: '2026-11-23', slot: 'dinner', recipeId: recipe.id, recipeVersionId: recipe.currentVersionId, servings: 4 });

    // 3. Shopping list
    const { list } = await generateGroceryList(plan.id);
    expect(list.items.find((i) => i.ingredientId === 'ing_chicken_breast')).toMatchObject({ quantity: 500, packages: 1 });

    // 4. Cook
    const cook = await startCooking(recipe.id, recipe.currentVersionId, 4);
    const finished = await finishCooking(cook.id, { actualMinutes: 35 });
    expect(finished.actualMinutes).toBe(35);

    // 5–6. Log one serving and check values
    const entry = await logRecipe({ recipeId: recipe.id, date: '2026-11-23', meal: 'dinner', servings: 1 });
    expect(entry.nutrients.energyKcal).toBeCloseTo(423.75);
    expect(entry.nutrients.proteinG).toBeCloseTo((500 * 0.225 + 300 * 0.071) / 4);

    // Editing the recipe creates a new version and leaves the diary untouched
    const v1 = (await db.recipeVersions.get(recipe.currentVersionId))!;
    const { newVersion } = await updateRecipe(recipe.id, { meta: recipe, content: { ...contentOf(v1), ingredients: v1.ingredients.map((i) => (i.ingredientId === 'ing_rice' ? { ...i, quantity: 400 } : i)), changeSummary: 'More rice' } });
    expect(newVersion!.versionNumber).toBe(2);
    expect((await db.foodLog.get(entry.id))!.nutrients.energyKcal).toBeCloseTo(423.75);
    const entry2 = await logRecipe({ recipeId: recipe.id, date: '2026-11-24', meal: 'dinner', servings: 1.5 });
    expect(entry2.nutrients.energyKcal).toBeCloseTo(((600 + 1460) / 4) * 1.5);
    expect(entry2.origin).toMatchObject({ type: 'recipe', versionNumber: 2 });

    // 7–9. Workout
    const session = await startWorkout({ templateId: null });
    const { buildBlock } = await import('./workoutService');
    let s = { ...session, exercises: [await buildBlock('ex_leg_press', session.gymId)] };
    const es = s.exercises[0]!;
    for (const set of es.sets) {
      s = updateSet(s, es.id, set.id, { weightKg: 100, reps: 10 });
      s = toggleSetComplete(s, es.id, set.id);
    }
    await saveWorkout(s);
    // interrupted: reopen → still active
    expect((await getActiveWorkout())!.exercises[0]!.sets.filter((x) => x.completed)).toHaveLength(3);
    const done = await finishWorkout((await getActiveWorkout())!);
    expect(done.status).toBe('completed');
    expect(await getActiveWorkout()).toBeUndefined();

    // 10. History + progress
    const history = await db.workouts.where('status').equals('completed').toArray();
    expect(exerciseProgress(history, `ex_leg_press@${session.gymId}`)).toHaveLength(1);
    expect(computeRecords(history).byKey.size).toBe(1);

    // Edit completed workout
    const edited = await saveEditedWorkout(done, updateSet(done, done.exercises[0]!.id, done.exercises[0]!.sets[0]!.id, { reps: 12 }));
    expect(edited.revision).toBe(1);

    // 13–14. Export, wipe, restore
    const backup = await exportBackup();
    expect(validateBackup(JSON.parse(JSON.stringify(backup))).report.ok).toBe(true);
    await db.foodLog.clear();
    await db.workouts.clear();
    await restoreBackup(JSON.parse(JSON.stringify(backup)));
    expect(await db.foodLog.count()).toBe(2);
    expect((await db.workouts.get(done.id))!.revision).toBe(1);
    expect(await db.importRecords.count()).toBe(1);
  });

  it('food diary operations: add, edit portion, delete, copy yesterday, saved meals', async () => {
    const e = await logFood({ foodId: 'food_oats', date: '2026-11-21', meal: 'breakfast', amount: 40 });
    await logFood({ foodId: 'food_banana', date: '2026-11-21', meal: 'breakfast', amount: 118 });
    await updatePortion(e.id, 80);
    expect((await db.foodLog.get(e.id))!.nutrients.energyKcal).toBeCloseTo(303.2);
    expect(await copyFromYesterday('2026-11-22', 'breakfast')).toBe(2);
    const today = await entriesForDate('2026-11-22');
    expect(dailyTotals(today).values.energyKcal).toBeCloseTo(303.2 + 105.02);
    const saved = await saveMealFromEntries('Oats & banana', today);
    expect(await logSavedMeal(saved.id, '2026-11-23', 'breakfast')).toBe(2);
    await deleteEntry(today[0]!.id);
    expect(await entriesForDate('2026-11-22')).toHaveLength(1);
  });

  it('recipe lab: branch, promote; delete protects history; duplicate', async () => {
    const base = (await db.recipeVersions.get('rec_ip_chicken_curry_v1'))!;
    const c = contentOf(base);
    const branch = await createBranch('rec_ip_chicken_curry', base.id, 'extra-ginger', { ...c, ingredients: c.ingredients.map((i) => (i.ingredientId === 'ing_ginger' ? { ...i, quantity: 40 } : i)), changeSummary: 'Double ginger', changeReason: 'Too bland' });
    expect(branch.branch).toBe('extra-ginger');
    expect((await db.recipes.get('rec_ip_chicken_curry'))!.currentVersionId).toBe(base.id);
    const promoted = await promoteVersion('rec_ip_chicken_curry', branch.id);
    expect((await db.recipes.get('rec_ip_chicken_curry'))!.currentVersionId).toBe(promoted.id);
    expect(await db.recipeVersions.get(base.id)).toBeDefined();
    await logRecipe({ recipeId: 'rec_spag_bol', date: '2026-11-22', meal: 'dinner', servings: 1 });
    expect((await deleteRecipe('rec_spag_bol')).deleted).toBe(false);
    const dup = await duplicateRecipe('rec_beef_chilli');
    expect(dup.name).toMatch(/copy/);
    expect((await deleteRecipe(dup.id)).deleted).toBe(true);
  });

  it('recommendation candidates exclude nothing by default and carry costs', async () => {
    const c = await recipeCandidates();
    expect(c).toHaveLength(6);
    expect(c.find((x) => x.recipe.id === 'rec_spag_bol')!.costPerServing).toBeGreaterThan(0);
  });

  it('cardio logging flags likely duplicates', async () => {
    const base = { type: 'walk' as const, date: '2026-11-22', startedAt: '2026-11-22T07:00:00.000Z', durationMin: 30, distanceKm: 2.5, elevationGainM: null, avgHeartRate: null, notes: '', estimateEnergy: true };
    const first = await logCardio(base);
    expect(first.activity.energyEstimate).toBeNull(); // no body weight recorded yet
    const second = await logCardio({ ...base, startedAt: '2026-11-22T07:03:00.000Z' });
    expect(second.duplicateOf?.id).toBe(first.activity.id);
  });

  it('rejects invalid backups and CSV parses foods with unknowns preserved', async () => {
    expect(validateBackup({ hello: 1 }).report.ok).toBe(false);
    const bad = await exportBackup();
    (bad.tables.foodLog as unknown[]).push({ id: 'x' });
    expect(validateBackup(JSON.parse(JSON.stringify(bad))).report.ok).toBe(false);
    const { foods, errors } = parseFoodCsv('name,brand,kcal,protein,carbs,fat,satfat,fibre,sugars,sodium\nYoghurt,Brand,60,10,4,,,,,40\n,bad');
    expect(foods[0]!.per100.fatG).toBeNull();
    expect(foods[0]!.per100.energyKcal).toBe(60);
    expect(errors).toHaveLength(1);
  });
});
