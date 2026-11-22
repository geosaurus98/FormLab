import type { Ingredient, GroceryCategory } from '../domain/recipes/types';
import type { QuantityUnit, CountUnit } from '../lib/units';

/**
 * Starter ingredients. Package sizes are common NZ supermarket formats.
 * Prices are *indicative placeholders* (priceUpdatedAt = null marks them as unverified seed
 * estimates); update them to what you actually pay for cost estimates to be meaningful.
 */
interface Def {
  id: string;
  name: string;
  foodId: string | null;
  category: GroceryCategory;
  density?: number;
  units?: Partial<Record<CountUnit, number>>;
  tags?: string[];
  pkg?: [number, QuantityUnit, string?];
  price?: number;
}

const DEFS: Def[] = [
  { id: 'ing_chicken_thigh', name: 'Chicken thigh (skinless, boneless)', foodId: 'food_chicken_thigh', category: 'Meat', tags: ['meat', 'poultry'], pkg: [500, 'g', '500 g tray'], price: 8.5 },
  { id: 'ing_chicken_breast', name: 'Chicken breast', foodId: 'food_chicken_breast', category: 'Meat', units: { each: 200 }, tags: ['meat', 'poultry'], pkg: [500, 'g', '500 g tray'], price: 8 },
  { id: 'ing_beef_mince', name: 'Lean beef mince', foodId: 'food_beef_mince_lean', category: 'Meat', tags: ['meat', 'red-meat', 'mince'], pkg: [500, 'g', '500 g pack'], price: 10 },
  { id: 'ing_egg', name: 'Eggs', foodId: 'food_egg', category: 'Dairy & eggs', units: { each: 50 }, tags: ['egg'], pkg: [12, 'each', 'dozen'], price: 9 },
  { id: 'ing_onion', name: 'Brown onion', foodId: 'food_onion', category: 'Produce', units: { each: 150 }, tags: ['aromatic'], pkg: [1.5, 'kg', '1.5 kg bag'], price: 4 },
  { id: 'ing_garlic', name: 'Garlic', foodId: 'food_garlic', category: 'Produce', units: { clove: 3, each: 40 }, tags: ['aromatic'], pkg: [1, 'each', '1 bulb (~10 cloves)'], price: 1.5 },
  { id: 'ing_ginger', name: 'Fresh ginger', foodId: 'food_ginger', category: 'Produce', tags: ['aromatic'], pkg: [100, 'g', '~100 g piece'], price: 2.5 },
  { id: 'ing_carrot', name: 'Carrot', foodId: 'food_carrot', category: 'Produce', units: { each: 70 }, pkg: [1, 'kg', '1 kg bag'], price: 3 },
  { id: 'ing_celery', name: 'Celery', foodId: 'food_celery', category: 'Produce', units: { each: 40, bunch: 500 }, pkg: [1, 'bunch', '1 bunch'], price: 3.5 },
  { id: 'ing_capsicum', name: 'Red capsicum', foodId: 'food_capsicum_red', category: 'Produce', units: { each: 150 }, pkg: [1, 'each', '1 capsicum'], price: 2 },
  { id: 'ing_broccoli', name: 'Broccoli', foodId: 'food_broccoli', category: 'Produce', units: { each: 350 }, pkg: [1, 'each', '1 head (~350 g)'], price: 3 },
  { id: 'ing_spinach', name: 'Baby spinach', foodId: 'food_spinach', category: 'Produce', pkg: [120, 'g', '120 g bag'], price: 4 },
  { id: 'ing_spring_onion', name: 'Spring onion', foodId: 'food_spring_onion', category: 'Produce', units: { each: 15, bunch: 100 }, pkg: [1, 'bunch', '1 bunch'], price: 2.5 },
  { id: 'ing_coriander', name: 'Fresh coriander', foodId: 'food_coriander', category: 'Produce', units: { bunch: 30 }, pkg: [1, 'bunch', '1 bunch'], price: 3 },
  { id: 'ing_peas_frozen', name: 'Frozen peas', foodId: 'food_peas_frozen', category: 'Frozen', pkg: [1, 'kg', '1 kg bag'], price: 4 },
  { id: 'ing_edamame', name: 'Frozen edamame (shelled)', foodId: 'food_edamame', category: 'Frozen', tags: ['legume', 'soy'], pkg: [500, 'g', '500 g bag'], price: 6 },
  { id: 'ing_tomato_canned', name: 'Canned diced tomatoes', foodId: 'food_tomato_canned', category: 'Tins & jars', units: { can: 400 }, pkg: [1, 'can', '400 g can'], price: 1.5 },
  { id: 'ing_tomato_paste', name: 'Tomato paste', foodId: 'food_tomato_paste', category: 'Tins & jars', density: 1.1, pkg: [130, 'g', '130 g pot'], price: 1.5 },
  { id: 'ing_passata', name: 'Tomato passata', foodId: 'food_passata', category: 'Tins & jars', density: 1.03, tags: ['liquid'], pkg: [700, 'g', '700 g jar'], price: 3 },
  { id: 'ing_kidney_beans', name: 'Canned red kidney beans', foodId: 'food_kidney_beans_canned', category: 'Tins & jars', units: { can: 400 }, tags: ['legume', 'kidney-bean'], pkg: [1, 'can', '400 g can'], price: 1.5 },
  { id: 'ing_red_lentils', name: 'Red lentils', foodId: 'food_red_lentils', category: 'Pantry', density: 0.8, tags: ['legume', 'red-lentil'], pkg: [500, 'g', '500 g bag'], price: 3 },
  { id: 'ing_split_peas', name: 'Yellow split peas', foodId: 'food_split_peas', category: 'Pantry', density: 0.8, tags: ['legume'], pkg: [500, 'g', '500 g bag'], price: 2.5 },
  { id: 'ing_barley', name: 'Pearl barley', foodId: 'food_barley', category: 'Pantry', density: 0.8, tags: ['grain', 'gluten'], pkg: [500, 'g', '500 g bag'], price: 3 },
  { id: 'ing_rice', name: 'White rice (long-grain / basmati)', foodId: 'food_rice_white', category: 'Pantry', density: 0.78, tags: ['grain'], pkg: [1, 'kg', '1 kg bag'], price: 3.5 },
  { id: 'ing_spaghetti', name: 'Spaghetti (dry)', foodId: 'food_pasta_dry', category: 'Pantry', tags: ['grain', 'gluten'], pkg: [500, 'g', '500 g pack'], price: 2 },
  { id: 'ing_macaroni', name: 'Macaroni (dry)', foodId: 'food_pasta_dry', category: 'Pantry', tags: ['grain', 'gluten'], pkg: [500, 'g', '500 g pack'], price: 2 },
  { id: 'ing_flour', name: 'Plain flour', foodId: 'food_flour', category: 'Pantry', density: 0.53, tags: ['gluten'], pkg: [1.5, 'kg', '1.5 kg bag'], price: 3 },
  { id: 'ing_cornflour', name: 'Cornflour', foodId: 'food_cornflour', category: 'Pantry', density: 0.53, pkg: [400, 'g', '400 g box'], price: 2.5 },
  { id: 'ing_milk_lf', name: 'Lactose-free milk', foodId: 'food_milk_lf', category: 'Dairy & eggs', density: 1.03, tags: ['dairy', 'lactose-free', 'liquid'], pkg: [1, 'l', '1 L bottle'], price: 3.5 },
  { id: 'ing_cheddar', name: 'Aged cheddar cheese', foodId: 'food_cheddar', category: 'Dairy & eggs', tags: ['dairy', 'low-lactose'], pkg: [500, 'g', '500 g block'], price: 9 },
  { id: 'ing_butter', name: 'Butter', foodId: 'food_butter', category: 'Dairy & eggs', density: 0.95, tags: ['dairy', 'low-lactose'], pkg: [500, 'g', '500 g block'], price: 7 },
  { id: 'ing_olive_oil', name: 'Olive oil', foodId: 'food_olive_oil', category: 'Pantry', density: 0.92, tags: ['fat'], pkg: [500, 'ml', '500 ml bottle'], price: 10 },
  { id: 'ing_canola_oil', name: 'Canola oil', foodId: 'food_canola_oil', category: 'Pantry', density: 0.92, tags: ['fat'], pkg: [1, 'l', '1 L bottle'], price: 6 },
  { id: 'ing_soy_sauce', name: 'Soy sauce', foodId: 'food_soy_sauce', category: 'Tins & jars', density: 1.15, tags: ['soy', 'gluten'], pkg: [250, 'ml', '250 ml bottle'], price: 3 },
  { id: 'ing_honey', name: 'Honey', foodId: 'food_honey', category: 'Pantry', density: 1.42, pkg: [500, 'g', '500 g jar'], price: 8 },
  { id: 'ing_mustard', name: 'Dijon / prepared mustard', foodId: 'food_mustard', category: 'Tins & jars', density: 1.0, pkg: [200, 'g', '200 g jar'], price: 3.5 },
  { id: 'ing_chicken_stock', name: 'Chicken stock (salt-reduced)', foodId: 'food_chicken_stock', category: 'Tins & jars', density: 1.0, tags: ['liquid'], pkg: [1, 'l', '1 L carton'], price: 3.5 },
  { id: 'ing_water', name: 'Water', foodId: 'food_water', category: 'Other', density: 1.0, tags: ['liquid', 'no-shop'] },
  { id: 'ing_lemon_juice', name: 'Lemon juice', foodId: 'food_lemon_juice', category: 'Produce', density: 1.03, pkg: [1, 'each', '1 lemon (~45 ml juice)'], price: 1 },
  { id: 'ing_curry_powder', name: 'Curry powder', foodId: 'food_curry_powder', category: 'Spices', density: 0.42, tags: ['spice'], pkg: [50, 'g', '50 g packet'], price: 3 },
  { id: 'ing_cumin', name: 'Ground cumin', foodId: 'food_cumin', category: 'Spices', density: 0.42, tags: ['spice'], pkg: [30, 'g', '30 g packet'], price: 3 },
  { id: 'ing_turmeric', name: 'Ground turmeric', foodId: 'food_turmeric', category: 'Spices', density: 0.6, tags: ['spice'], pkg: [30, 'g', '30 g packet'], price: 3 },
  { id: 'ing_chilli_powder', name: 'Chilli powder', foodId: 'food_chilli_powder', category: 'Spices', density: 0.54, tags: ['spice', 'chilli'], pkg: [30, 'g', '30 g packet'], price: 3 },
  { id: 'ing_paprika', name: 'Paprika', foodId: 'food_paprika', category: 'Spices', density: 0.46, tags: ['spice'], pkg: [40, 'g', '40 g packet'], price: 3 },
  { id: 'ing_oregano', name: 'Dried oregano', foodId: 'food_oregano', category: 'Spices', density: 0.2, tags: ['spice'], pkg: [10, 'g', '10 g packet'], price: 2.5 },
  { id: 'ing_pepper', name: 'Ground black pepper', foodId: 'food_black_pepper', category: 'Spices', density: 0.46, tags: ['spice'], pkg: [50, 'g', '50 g grinder'], price: 4 },
  { id: 'ing_salt', name: 'Salt', foodId: 'food_salt', category: 'Spices', density: 1.2, pkg: [500, 'g', '500 g'], price: 1.5 },
  { id: 'ing_potato', name: 'Potatoes', foodId: 'food_potato', category: 'Produce', units: { each: 200 }, pkg: [2, 'kg', '2 kg bag'], price: 5 },
  { id: 'ing_kumara', name: 'Kūmara', foodId: 'food_kumara', category: 'Produce', units: { each: 250 }, pkg: [1, 'kg', 'per kg'], price: 5 },
  { id: 'ing_mushroom', name: 'Mushrooms', foodId: 'food_mushroom', category: 'Produce', pkg: [200, 'g', '200 g punnet'], price: 4 }
];

export function seedIngredients(now: string): Ingredient[] {
  return DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    foodId: d.foodId,
    category: d.category,
    densityGPerMl: d.density ?? null,
    unitWeightsG: d.units ?? {},
    tags: d.tags ?? [],
    packageSize: d.pkg ? { quantity: d.pkg[0], unit: d.pkg[1], label: d.pkg[2] } : null,
    packagePriceNZD: d.price ?? null,
    priceUpdatedAt: null,
    createdAt: now,
    updatedAt: now
  }));
}
