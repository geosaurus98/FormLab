import { z } from 'zod';
import { NutrientsSchema, scaleNutrients, type Nutrients } from './nutrients';
import { DataQualitySchema, DataSourceSchema } from '../shared/provenance';

export const FoodServingSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  /** amount in the food's basis unit (g for per100g, ml for per100ml) */
  amount: z.number().positive()
});
export type FoodServing = z.infer<typeof FoodServingSchema>;

export const FoodSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  brand: z.string().optional(),
  kind: z.enum(['generic', 'branded', 'user']),
  basis: z.enum(['g', 'ml']),
  /** nutrients per 100 g or per 100 ml (depending on basis) */
  per100: NutrientsSchema,
  servings: z.array(FoodServingSchema),
  defaultServingId: z.string().optional(),
  source: DataSourceSchema,
  quality: DataQualitySchema,
  barcode: z.string().optional(),
  favourite: z.boolean().default(false),
  archived: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Food = z.infer<typeof FoodSchema>;

/** Nutrients for an amount (in the food's basis unit). */
export function nutrientsForAmount(food: Pick<Food, 'per100'>, amount: number): Nutrients {
  return scaleNutrients(food.per100, amount / 100);
}

/**
 * Future integration point for external food databases (e.g. NZ FOODfiles imports, Open Food Facts).
 * Implementations must return provenance and must not fill unknown nutrients with zeros.
 */
export interface FoodDataProvider {
  readonly id: string;
  readonly name: string;
  readonly requiresNetwork: boolean;
  search(query: string): Promise<Omit<Food, 'id' | 'createdAt' | 'updatedAt'>[]>;
  lookupBarcode?(barcode: string): Promise<Omit<Food, 'id' | 'createdAt' | 'updatedAt'> | null>;
}
