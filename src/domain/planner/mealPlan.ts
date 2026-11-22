import { z } from 'zod';

export const MealPlanEntrySchema = z.object({
  id: z.string(),
  /** null for unordered "collection" plans */
  date: z.string().nullable(),
  slot: z.string().default('dinner'),
  recipeId: z.string(),
  recipeVersionId: z.string(),
  servings: z.number().positive(),
  /** if set, this entry eats leftovers from another entry instead of cooking */
  leftoverOfEntryId: z.string().nullable().default(null),
  cooked: z.boolean().default(false),
  note: z.string().default('')
});
export type MealPlanEntry = z.infer<typeof MealPlanEntrySchema>;

export const MealPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['dated', 'collection']),
  weekStart: z.string().nullable(),
  entries: z.array(MealPlanEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

/** Entries that require cooking (leftover entries do not add groceries). */
export function cookingEntries(plan: MealPlan): MealPlanEntry[] {
  return plan.entries.filter((e) => !e.leftoverOfEntryId);
}

/** Servings to cook for an entry = its own servings + any leftover entries pointing at it. */
export function servingsToCook(plan: MealPlan, entry: MealPlanEntry): number {
  return entry.servings + plan.entries.filter((e) => e.leftoverOfEntryId === entry.id).reduce((s, e) => s + e.servings, 0);
}
