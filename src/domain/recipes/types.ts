import { z } from 'zod';
import { DataQualitySchema, DataSourceSchema } from '../shared/provenance';
import { NutrientsSchema } from '../nutrition/nutrients';
import { ALL_UNITS, COUNT_UNITS, type QuantityUnit } from '../../lib/units';

export const APPLIANCES = ['stovetop', 'oven', 'rice-cooker', 'slow-cooker', 'pressure-cooker', 'air-fryer', 'microwave', 'bread-maker'] as const;
export const ApplianceIdSchema = z.enum(APPLIANCES);
export type ApplianceId = z.infer<typeof ApplianceIdSchema>;
export const APPLIANCE_LABEL: Record<ApplianceId, string> = {
  stovetop: 'Stovetop',
  oven: 'Oven',
  'rice-cooker': 'Rice cooker',
  'slow-cooker': 'Slow cooker',
  'pressure-cooker': 'Pressure cooker (Instant Pot)',
  'air-fryer': 'Air fryer',
  microwave: 'Microwave',
  'bread-maker': 'Bread maker'
};

export const GROCERY_CATEGORIES = ['Produce', 'Meat', 'Dairy & eggs', 'Bakery', 'Pantry', 'Tins & jars', 'Spices', 'Frozen', 'Other'] as const;
export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

const QuantityUnitSchema = z.enum(ALL_UNITS as [QuantityUnit, ...QuantityUnit[]]);
const CountUnitSchema = z.enum(COUNT_UNITS);

/** Ingredient = cooking/shopping entity. Nutrition comes from a linked Food. */
export const IngredientSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  foodId: z.string().nullable(),
  category: z.enum(GROCERY_CATEGORIES),
  densityGPerMl: z.number().positive().nullable().default(null),
  unitWeightsG: z.record(CountUnitSchema, z.number().positive()).default({}),
  /** exclusion / attribute tags, e.g. seafood, green-lentil, dairy, lactose-free, meat, poultry */
  tags: z.array(z.string()).default([]),
  /** typical purchase size for package rounding */
  packageSize: z.object({ quantity: z.number().positive(), unit: QuantityUnitSchema, label: z.string().optional() }).nullable().default(null),
  /** user-entered price per package in NZD; null = unknown */
  packagePriceNZD: z.number().nonnegative().nullable().default(null),
  priceUpdatedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const INGREDIENT_ROLES = ['protein', 'base', 'vegetable', 'aromatic', 'spice', 'sauce', 'liquid', 'fat', 'garnish', 'other'] as const;
export type IngredientRole = (typeof INGREDIENT_ROLES)[number];

export const RecipeIngredientSchema = z.object({
  id: z.string(),
  ingredientId: z.string(),
  quantity: z.number().nonnegative(),
  unit: QuantityUnitSchema,
  preparation: z.string().default(''),
  optional: z.boolean().default(false),
  role: z.enum(INGREDIENT_ROLES).default('other')
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeStepSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  appliance: ApplianceIdSchema.nullable().default(null),
  timerMinutes: z.number().positive().nullable().default(null),
  safetyNote: z.string().nullable().default(null)
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

/**
 * Validation status — never upgraded automatically.
 * kitchen-tested: the user cooked it and confirmed; source-checked: matches a cited source;
 * experimental: untested; blocked: known unsafe/unsupported.
 */
export const ValidationStatusSchema = z.enum(['kitchen-tested', 'source-checked', 'experimental', 'blocked']);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;
export const VALIDATION_LABEL: Record<ValidationStatus, string> = {
  'kitchen-tested': 'Kitchen-tested',
  'source-checked': 'Source-checked',
  experimental: 'Experimental / untested',
  blocked: 'Blocked'
};

/**
 * Nutrition stated by an outside source (e.g. the recipe book's own estimate), kept separate from
 * FormLab's ingredient-based calculation and always shown with its source and quality.
 */
export const DeclaredNutritionSchema = z.object({
  /** what one portion is, e.g. "serving" or "slice" */
  perLabel: z.string(),
  nutrients: NutrientsSchema,
  source: z.string(),
  quality: DataQualitySchema
});
export type DeclaredNutrition = z.infer<typeof DeclaredNutritionSchema>;

/** An immutable snapshot of a recipe's cookable content. Edits create a new version. */
export const RecipeVersionSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  versionNumber: z.number().int().positive(),
  parentVersionId: z.string().nullable(),
  /** "main" for the canonical line; other names are Recipe Lab experiment branches */
  branch: z.string().default('main'),
  servings: z.number().positive(),
  prepMinutes: z.number().nonnegative(),
  cookMinutes: z.number().nonnegative(),
  ingredients: z.array(RecipeIngredientSchema),
  appliances: z.array(ApplianceIdSchema),
  equipment: z.array(z.string()).default([]),
  steps: z.array(RecipeStepSchema),
  validation: ValidationStatusSchema,
  /** optional outside estimate (older records don't have this field) */
  declaredNutrition: DeclaredNutritionSchema.nullable().optional(),
  changeSummary: z.string().default(''),
  changeReason: z.string().default(''),
  createdAt: z.string()
});
export type RecipeVersion = z.infer<typeof RecipeVersionSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  cuisine: z.string().default(''),
  category: z.string().default('Main'),
  tags: z.array(z.string()).default([]),
  dietary: z.array(z.string()).default([]),
  source: DataSourceSchema,
  currentVersionId: z.string(),
  favourite: z.boolean().default(false),
  archived: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const CookingSessionSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  recipeVersionId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  servingsMade: z.number().positive(),
  actualMinutes: z.number().nonnegative().nullable(),
  appliancesUsed: z.array(ApplianceIdSchema).default([]),
  notes: z.string().default('')
});
export type CookingSession = z.infer<typeof CookingSessionSchema>;

export const FEEDBACK_ISSUES = ['too-spicy', 'too-mild', 'too-salty', 'bland', 'too-watery', 'too-thick', 'overcooked', 'undercooked', 'too-sweet', 'too-sour', 'dry'] as const;
export type FeedbackIssue = (typeof FEEDBACK_ISSUES)[number];

export const RecipeFeedbackSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  recipeVersionId: z.string(),
  cookingSessionId: z.string().nullable(),
  rating: z.number().int().min(1).max(5),
  issues: z.array(z.enum(FEEDBACK_ISSUES)).default([]),
  taste: z.string().default(''),
  texture: z.string().default(''),
  notes: z.string().default(''),
  repeat: z.enum(['yes', 'no', 'with-changes']),
  createdAt: z.string()
});
export type RecipeFeedback = z.infer<typeof RecipeFeedbackSchema>;

export const ApplianceProfileSchema = z.object({
  id: ApplianceIdSchema,
  name: z.string(),
  capacityLitres: z.number().positive().nullable(),
  /** maximum fill fraction of capacity, e.g. 2/3 for pressure cookers */
  maxFillFraction: z.number().positive().max(1).nullable(),
  minLiquidMl: z.number().nonnegative().nullable(),
  notes: z.string(),
  sourceReference: z.string(),
  validation: ValidationStatusSchema
});
export type ApplianceProfile = z.infer<typeof ApplianceProfileSchema>;
