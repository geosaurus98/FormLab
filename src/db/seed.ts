import { db } from './db';
import { seedFoods } from '../data/foods';
import { seedIngredients } from '../data/ingredients';
import { seedRecipes, SEED_APPLIANCE_PROFILES, SEED_METHOD_TRANSFORMATIONS, SEED_SUBSTITUTIONS } from '../data/recipes';
import { exampleProgrammes, SEED_EQUIPMENT, SEED_GYM, seedExercises } from '../data/exercises';
import { defaultPreferences } from '../domain/shared/preferences';
import { nowIso } from '../lib/utils';

export const SEED_VERSION = 1;

/**
 * Inserts reference data on first run only. Never creates personal history
 * (no workouts, weights, food diary entries or body measurements).
 */
export async function ensureSeeded(): Promise<void> {
  const meta = await db.meta.get('seedVersion');
  if (meta && (meta.value as number) >= SEED_VERSION) return;
  const now = nowIso();
  const { recipes, versions } = seedRecipes(now);
  await db.transaction('rw', [db.foods, db.ingredients, db.recipes, db.recipeVersions, db.applianceProfiles, db.substitutionRules, db.methodTransformations, db.exercises, db.equipment, db.gyms, db.preferences, db.meta], async () => {
    await db.foods.bulkPut(seedFoods(now));
    await db.ingredients.bulkPut(seedIngredients(now));
    await db.recipes.bulkPut(recipes);
    await db.recipeVersions.bulkPut(versions);
    await db.applianceProfiles.bulkPut(SEED_APPLIANCE_PROFILES);
    await db.substitutionRules.bulkPut(SEED_SUBSTITUTIONS);
    await db.methodTransformations.bulkPut(SEED_METHOD_TRANSFORMATIONS);
    await db.exercises.bulkPut(seedExercises());
    await db.equipment.bulkPut(SEED_EQUIPMENT);
    if (!(await db.gyms.count())) await db.gyms.put(SEED_GYM);
    if (!(await db.preferences.get('prefs'))) await db.preferences.put({ ...defaultPreferences(now), defaultGymId: SEED_GYM.id });
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION });
  });
}

/** Adds the optional example workout templates and programmes (idempotent). */
export async function addExampleProgrammes(): Promise<number> {
  const { templates, programmes } = exampleProgrammes(nowIso());
  await db.transaction('rw', db.templates, db.programmes, async () => {
    for (const t of templates) if (!(await db.templates.get(t.id))) await db.templates.put(t);
    for (const p of programmes) if (!(await db.programmes.get(p.id))) await db.programmes.put(p);
  });
  return programmes.length;
}
