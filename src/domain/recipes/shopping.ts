import { z } from 'zod';
import { toBase, toGrams, type QuantityUnit } from '../../lib/units';
import { GROCERY_CATEGORIES, type GroceryCategory, type Ingredient, type RecipeVersion } from './types';
import { newId } from '../../lib/id';

export const PantryItemSchema = z.object({
  id: z.string(),
  ingredientId: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  /** staple = assumed always stocked only because the user marked it so */
  staple: z.boolean().default(false),
  updatedAt: z.string()
});
export type PantryItem = z.infer<typeof PantryItemSchema>;

export const GroceryItemSchema = z.object({
  id: z.string(),
  ingredientId: z.string().nullable(),
  name: z.string(),
  quantity: z.number().nonnegative().nullable(),
  unit: z.string().nullable(),
  category: z.enum(GROCERY_CATEGORIES),
  packages: z.number().int().nonnegative().nullable(),
  packageLabel: z.string().nullable(),
  estimatedCostNZD: z.number().nonnegative().nullable(),
  checked: z.boolean(),
  manual: z.boolean(),
  note: z.string().default(''),
  /** recipes that need this item */
  sources: z.array(z.string()).default([])
});
export type GroceryItem = z.infer<typeof GroceryItemSchema>;

export const GroceryListSchema = z.object({
  id: z.string(),
  name: z.string(),
  mealPlanId: z.string().nullable(),
  items: z.array(GroceryItemSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type GroceryList = z.infer<typeof GroceryListSchema>;

export interface PlannedCook {
  recipeName: string;
  version: Pick<RecipeVersion, 'ingredients' | 'servings'>;
  servings: number;
}

interface Need {
  ingredientId: string;
  quantity: number;
  unit: 'g' | 'ml' | string;
  sources: Set<string>;
}

/**
 * Aggregates ingredient requirements across planned recipes. Quantities are combined only within
 * the same dimension; mass and volume are merged when a density is known, otherwise kept as
 * separate lines rather than guessed.
 */
export function aggregateNeeds(cooks: PlannedCook[], ingredients: Map<string, Ingredient>, includeOptional = false): Need[] {
  const needs = new Map<string, Need>();
  for (const cook of cooks) {
    const factor = cook.servings / cook.version.servings;
    for (const ri of cook.version.ingredients) {
      if (ri.optional && !includeOptional) continue;
      const ing = ingredients.get(ri.ingredientId);
      let { quantity, unit } = toBase(ri.quantity * factor, ri.unit);
      // Normalise volume → mass when density known, so 200 ml + 100 g of the same item merge.
      if (unit === 'ml' && ing?.densityGPerMl) {
        quantity = quantity * ing.densityGPerMl;
        unit = 'g';
      }
      const key = `${ri.ingredientId}|${unit}`;
      const cur = needs.get(key) ?? { ingredientId: ri.ingredientId, quantity: 0, unit, sources: new Set<string>() };
      cur.quantity += quantity;
      cur.sources.add(cook.recipeName);
      needs.set(key, cur);
    }
  }
  return [...needs.values()];
}

/** Subtracts pantry stock from needs (same dimension only). Items fully covered are returned separately. */
export function subtractPantry(needs: Need[], pantry: PantryItem[], ingredients: Map<string, Ingredient>): { remaining: Need[]; covered: Need[] } {
  const remaining: Need[] = [];
  const covered: Need[] = [];
  const stock = new Map<string, { quantity: number; unit: string; staple: boolean }[]>();
  for (const p of pantry) {
    const ing = ingredients.get(p.ingredientId);
    let { quantity, unit } = toBase(p.quantity, p.unit as QuantityUnit);
    if (unit === 'ml' && ing?.densityGPerMl) {
      quantity *= ing.densityGPerMl;
      unit = 'g';
    }
    (stock.get(p.ingredientId) ?? stock.set(p.ingredientId, []).get(p.ingredientId)!).push({ quantity, unit, staple: p.staple });
  }
  for (const n of needs) {
    const items = stock.get(n.ingredientId) ?? [];
    if (items.some((s) => s.staple)) {
      covered.push(n);
      continue;
    }
    let left = n.quantity;
    for (const s of items) {
      if (s.unit !== n.unit || s.quantity <= 0) continue;
      const take = Math.min(left, s.quantity);
      s.quantity -= take;
      left -= take;
    }
    if (left <= 1e-9) covered.push(n);
    else remaining.push({ ...n, quantity: left });
  }
  return { remaining, covered };
}

/** Converts a quantity of an ingredient to grams using its density / unit weights, if possible. */
function gramsOf(quantity: number, unit: string, ing: Ingredient): number | null {
  const r = toGrams(quantity, unit as QuantityUnit, { densityGPerMl: ing.densityGPerMl, unitWeightsG: ing.unitWeightsG });
  return r.ok ? r.grams : null;
}

/** Expresses `quantity unit` as a fraction of the ingredient's package size, or null if not comparable. */
export function packageFraction(quantity: number, unit: string, ing: Ingredient | undefined): number | null {
  if (!ing?.packageSize) return null;
  const need = toBase(quantity, unit as QuantityUnit);
  const pkg = toBase(ing.packageSize.quantity, ing.packageSize.unit);
  if (need.unit === pkg.unit) return need.quantity / pkg.quantity;
  const ng = gramsOf(quantity, unit, ing);
  const pg = gramsOf(ing.packageSize.quantity, ing.packageSize.unit, ing);
  if (ng == null || pg == null || pg === 0) return null;
  return ng / pg;
}

/** Number of packages needed, if a comparable package size is known. */
export function packagesNeeded(quantity: number, unit: string, ing: Ingredient | undefined): number | null {
  const f = packageFraction(quantity, unit, ing);
  return f == null ? null : Math.max(1, Math.ceil(f - 1e-9));
}

export function buildGroceryItems(cooks: PlannedCook[], ingredients: Map<string, Ingredient>, pantry: PantryItem[]): { items: GroceryItem[]; coveredByPantry: GroceryItem[] } {
  const needs = aggregateNeeds(cooks, ingredients);
  const { remaining, covered } = subtractPantry(needs, pantry, ingredients);
  const toItem = (n: Need): GroceryItem => {
    const ing = ingredients.get(n.ingredientId);
    const packages = packagesNeeded(n.quantity, n.unit, ing);
    const cost = packages != null && ing?.packagePriceNZD != null ? packages * ing.packagePriceNZD : null;
    return {
      id: newId('gi'),
      ingredientId: n.ingredientId,
      name: ing?.name ?? 'Unknown ingredient',
      quantity: Math.round(n.quantity * 10) / 10,
      unit: n.unit,
      category: (ing?.category ?? 'Other') as GroceryCategory,
      packages,
      packageLabel: ing?.packageSize ? ing.packageSize.label ?? `${ing.packageSize.quantity} ${ing.packageSize.unit}` : null,
      estimatedCostNZD: cost,
      checked: false,
      manual: false,
      note: '',
      sources: [...n.sources]
    };
  };
  const sortFn = (a: GroceryItem, b: GroceryItem) => GROCERY_CATEGORIES.indexOf(a.category) - GROCERY_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name);
  return { items: remaining.map(toItem).sort(sortFn), coveredByPantry: covered.map(toItem).sort(sortFn) };
}

export function estimateListCost(items: GroceryItem[]): { total: number; pricedCount: number; unpricedCount: number } {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const i of items) {
    if (i.estimatedCostNZD != null) {
      total += i.estimatedCostNZD;
      priced++;
    } else unpriced++;
  }
  return { total, pricedCount: priced, unpricedCount: unpriced };
}

export function groceryListToText(list: GroceryList): string {
  const lines: string[] = [list.name, ''];
  for (const cat of GROCERY_CATEGORIES) {
    const items = list.items.filter((i) => i.category === cat);
    if (!items.length) continue;
    lines.push(`${cat}:`);
    for (const i of items) {
      const qty = i.quantity != null ? ` — ${i.quantity} ${i.unit ?? ''}`.trimEnd() : '';
      const pk = i.packages ? ` (${i.packages} × ${i.packageLabel})` : '';
      lines.push(`${i.checked ? '[x]' : '[ ]'} ${i.name}${qty}${pk}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Estimated cost per serving of a recipe, using package price pro-rated by quantity; unpriced items are listed. */
export function estimateRecipeCost(version: Pick<RecipeVersion, 'ingredients' | 'servings'>, ingredients: Map<string, Ingredient>): { total: number; perServing: number; unpriced: string[] } {
  let total = 0;
  const unpriced: string[] = [];
  for (const ri of version.ingredients) {
    if (ri.optional) continue;
    const ing = ingredients.get(ri.ingredientId);
    if (ing?.tags.includes('no-shop')) continue;
    const f = packageFraction(ri.quantity, ri.unit, ing);
    if (!ing || ing.packagePriceNZD == null || f == null) {
      unpriced.push(ing?.name ?? ri.ingredientId);
      continue;
    }
    total += f * ing.packagePriceNZD;
  }
  return { total, perServing: total / version.servings, unpriced };
}
