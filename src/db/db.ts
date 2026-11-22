import Dexie, { type Table } from 'dexie';
import type { Food } from '../domain/nutrition/foods';
import type { DayStatus, FoodLogEntry, SavedMeal } from '../domain/nutrition/diary';
import type { NutritionTarget } from '../domain/nutrition/targets';
import type { ApplianceProfile, CookingSession, Ingredient, Recipe, RecipeFeedback, RecipeVersion } from '../domain/recipes/types';
import type { GroceryList, PantryItem } from '../domain/recipes/shopping';
import type { MethodTransformation, SubstitutionRule } from '../domain/recipes/safety';
import type { MealPlan } from '../domain/planner/mealPlan';
import type { CardioActivity, Equipment, Exercise, Gym, WorkoutProgramme, WorkoutSession, WorkoutTemplate } from '../domain/workouts/types';
import type { BodyMeasurement } from '../domain/body/body';
import type { Preferences } from '../domain/shared/preferences';

export interface ImportRecord {
  id: string;
  kind: 'backup-restore' | 'food-csv' | 'activity-import';
  at: string;
  fileName: string;
  counts: Record<string, number>;
  notes: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Current schema version. Bump and add a `.version(n)` block with an upgrade for every schema change. */
export const SCHEMA_VERSION = 1;

export class FormLabDB extends Dexie {
  foods!: Table<Food, string>;
  ingredients!: Table<Ingredient, string>;
  recipes!: Table<Recipe, string>;
  recipeVersions!: Table<RecipeVersion, string>;
  mealPlans!: Table<MealPlan, string>;
  foodLog!: Table<FoodLogEntry, string>;
  savedMeals!: Table<SavedMeal, string>;
  dayStatus!: Table<DayStatus, string>;
  groceryLists!: Table<GroceryList, string>;
  pantry!: Table<PantryItem, string>;
  cookingSessions!: Table<CookingSession, string>;
  recipeFeedback!: Table<RecipeFeedback, string>;
  applianceProfiles!: Table<ApplianceProfile, string>;
  substitutionRules!: Table<SubstitutionRule, string>;
  methodTransformations!: Table<MethodTransformation, string>;
  exercises!: Table<Exercise, string>;
  equipment!: Table<Equipment, string>;
  gyms!: Table<Gym, string>;
  programmes!: Table<WorkoutProgramme, string>;
  templates!: Table<WorkoutTemplate, string>;
  workouts!: Table<WorkoutSession, string>;
  cardio!: Table<CardioActivity, string>;
  body!: Table<BodyMeasurement, string>;
  targets!: Table<NutritionTarget, string>;
  preferences!: Table<Preferences, string>;
  importRecords!: Table<ImportRecord, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'formlab') {
    super(name);
    this.version(1).stores({
      foods: 'id, name, kind, updatedAt',
      ingredients: 'id, name, foodId',
      recipes: 'id, name, updatedAt',
      recipeVersions: 'id, recipeId, [recipeId+versionNumber]',
      mealPlans: 'id, weekStart, kind, updatedAt',
      foodLog: 'id, date, createdAt, [date+meal]',
      savedMeals: 'id, name',
      dayStatus: 'date',
      groceryLists: 'id, createdAt, mealPlanId',
      pantry: 'id, ingredientId',
      cookingSessions: 'id, recipeId, startedAt',
      recipeFeedback: 'id, recipeId, recipeVersionId, createdAt',
      applianceProfiles: 'id',
      substitutionRules: 'id, fromIngredientId',
      methodTransformations: 'id',
      exercises: 'id, name',
      equipment: 'id',
      gyms: 'id',
      programmes: 'id',
      templates: 'id, name',
      workouts: 'id, status, startedAt, templateId',
      cardio: 'id, date',
      body: 'id, date',
      targets: 'id, effectiveFrom',
      preferences: 'id',
      importRecords: 'id, at',
      meta: 'key'
    });
    // Example of how future migrations are added:
    // this.version(2).stores({ foods: 'id, name, kind, updatedAt, barcode' }).upgrade(tx => tx.table('foods').toCollection().modify(f => { f.barcode ??= undefined; }));
  }
}

export const TABLE_NAMES = [
  'foods', 'ingredients', 'recipes', 'recipeVersions', 'mealPlans', 'foodLog', 'savedMeals', 'dayStatus', 'groceryLists', 'pantry', 'cookingSessions', 'recipeFeedback', 'applianceProfiles', 'substitutionRules', 'methodTransformations', 'exercises', 'equipment', 'gyms', 'programmes', 'templates', 'workouts', 'cardio', 'body', 'targets', 'preferences', 'importRecords', 'meta'
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export let db = new FormLabDB();

/** Test helper: swap the database instance (e.g. a fresh fake-indexeddb database per test). */
export function setDatabase(next: FormLabDB): void {
  db = next;
}
