import type { Food } from '../domain/nutrition/foods';

/**
 * Starter generic food list.
 *
 * Values are per 100 g and are approximate figures based on USDA FoodData Central (SR Legacy)
 * entries for comparable generic foods, rounded. They are labelled `reference` quality and should
 * be checked against the nutrition information panel of the product you actually buy (NZ products
 * vary, especially sodium). Foods whose composition varies too much to give a generic value
 * (e.g. stock) are deliberately left as unknown so that recipes using them show as incomplete.
 *
 * Columns: id, name, kcal, protein, carbs, fat, satFat, fibre, sugars, sodiumMg, servings
 */
type Row = [string, string, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, [string, number][]?];

const ROWS: Row[] = [
  ['food_chicken_thigh', 'Chicken thigh, skinless boneless, raw', 121, 19.7, 0, 4.1, 1.0, 0, 0, 95, [['100 g', 100]]],
  ['food_chicken_breast', 'Chicken breast, skinless, raw', 120, 22.5, 0, 2.6, 0.6, 0, 0, 45, [['1 breast (200 g)', 200]]],
  ['food_beef_mince_lean', 'Beef mince, lean (~10% fat), raw', 176, 20.0, 0, 10.0, 3.9, 0, 0, 66, [['100 g', 100]]],
  ['food_egg', 'Egg, whole, raw', 143, 12.6, 0.7, 9.5, 3.1, 0, 0.4, 142, [['1 large egg (50 g)', 50]]],
  ['food_onion', 'Onion, raw', 40, 1.1, 9.3, 0.1, 0.04, 1.7, 4.2, 4, [['1 medium (150 g)', 150]]],
  ['food_garlic', 'Garlic, raw', 149, 6.4, 33.1, 0.5, 0.09, 2.1, 1.0, 17, [['1 clove (3 g)', 3]]],
  ['food_ginger', 'Ginger root, raw', 80, 1.8, 17.8, 0.8, 0.2, 2.0, 1.7, 13],
  ['food_carrot', 'Carrot, raw', 41, 0.9, 9.6, 0.2, 0.04, 2.8, 4.7, 69, [['1 medium (70 g)', 70]]],
  ['food_celery', 'Celery, raw', 16, 0.7, 3.0, 0.2, 0.04, 1.6, 1.3, 80],
  ['food_capsicum_red', 'Capsicum, red, raw', 31, 1.0, 6.0, 0.3, 0.03, 2.1, 4.2, 4, [['1 medium (150 g)', 150]]],
  ['food_broccoli', 'Broccoli, raw', 34, 2.8, 6.6, 0.4, 0.04, 2.6, 1.7, 33],
  ['food_spinach', 'Spinach, raw', 23, 2.9, 3.6, 0.4, 0.06, 2.2, 0.4, 79],
  ['food_mushroom', 'Mushrooms, white, raw', 22, 3.1, 3.3, 0.3, 0.05, 1.0, 2.0, 5],
  ['food_spring_onion', 'Spring onion, raw', 32, 1.8, 7.3, 0.2, 0.03, 2.6, 2.3, 16],
  ['food_coriander', 'Coriander leaves, fresh', 23, 2.1, 3.7, 0.5, 0.01, 2.8, 0.9, 46],
  ['food_potato', 'Potato, flesh and skin, raw', 77, 2.1, 17.5, 0.1, 0.03, 2.1, 0.8, 6, [['1 medium (200 g)', 200]]],
  ['food_kumara', 'Kūmara (sweet potato), raw', 86, 1.6, 20.1, 0.1, 0.02, 3.0, 4.2, 55],
  ['food_peas_frozen', 'Peas, frozen', 77, 5.2, 13.6, 0.4, 0.07, 4.5, 5.0, 108],
  ['food_edamame', 'Edamame, frozen, prepared', 121, 11.9, 8.9, 5.2, 0.6, 5.2, 2.2, 6, [['1 cup shelled (155 g)', 155]]],
  ['food_tomato_canned', 'Tomatoes, canned (in juice)', 18, 0.8, 4.0, 0.1, 0.02, 1.0, 2.6, 115],
  ['food_tomato_paste', 'Tomato paste', 82, 4.3, 18.9, 0.5, 0.1, 4.1, 12.2, 59],
  ['food_passata', 'Tomato purée / passata', 38, 1.7, 9.0, 0.2, 0.03, 1.9, 4.8, 28],
  ['food_kidney_beans_canned', 'Red kidney beans, canned (solids and liquid)', 84, 5.2, 15.5, 0.4, 0.06, 4.9, 1.9, 258],
  ['food_red_lentils', 'Red lentils, dry', 358, 23.9, 63.1, 2.2, 0.4, 10.8, 1.6, 7],
  ['food_split_peas', 'Yellow split peas, dry', 341, 24.6, 60.4, 1.2, 0.16, 25.5, 8.0, 15],
  ['food_barley', 'Pearl barley, dry', 352, 9.9, 77.7, 1.2, 0.24, 15.6, 0.8, 9],
  ['food_rice_white', 'Rice, white long-grain, dry', 365, 7.1, 80.0, 0.7, 0.18, 1.3, 0.1, 5, [['1/2 cup dry (90 g)', 90]]],
  ['food_pasta_dry', 'Pasta (spaghetti / macaroni), dry', 371, 13.0, 74.7, 1.5, 0.28, 3.2, 2.7, 6, [['75 g dry portion', 75]]],
  ['food_oats', 'Rolled oats, dry', 379, 13.2, 67.7, 6.5, 1.1, 10.1, 1.0, 6, [['1/2 cup (40 g)', 40]]],
  ['food_bread_wholemeal', 'Bread, wholemeal', 247, 13.0, 41.3, 3.4, 0.7, 6.8, 5.6, 450, [['1 slice (35 g)', 35]]],
  ['food_flour', 'Flour, plain white', 364, 10.3, 76.3, 1.0, 0.16, 2.7, 0.3, 2],
  ['food_cornflour', 'Cornflour (corn starch)', 381, 0.3, 91.3, 0.1, 0.01, 0.9, 0, 9],
  ['food_milk_lf', 'Milk, lactose-free, reduced fat (~2%)', 50, 3.3, 4.8, 2.0, 1.3, 0, 5.1, 47, [['1 glass (250 ml ≈ 258 g)', 258]]],
  ['food_cheddar', 'Cheese, cheddar (aged)', 403, 24.9, 1.3, 33.1, 21.1, 0, 0.5, 621, [['1 slice (20 g)', 20]]],
  ['food_butter', 'Butter, salted', 717, 0.9, 0.1, 81.1, 51.4, 0, 0.1, 643, [['1 tsp (5 g)', 5]]],
  ['food_greek_yoghurt', 'Greek-style yoghurt, plain, non-fat', 59, 10.2, 3.6, 0.4, 0.12, 0, 3.2, 36, [['1/2 cup (120 g)', 120]]],
  ['food_olive_oil', 'Olive oil', 884, 0, 0, 100, 13.8, 0, 0, 2, [['1 tbsp (14 g)', 14]]],
  ['food_canola_oil', 'Canola oil', 884, 0, 0, 100, 7.4, 0, 0, 0, [['1 tbsp (14 g)', 14]]],
  ['food_soy_sauce', 'Soy sauce', 53, 8.1, 4.9, 0.6, 0.07, 0.8, 0.4, 5493],
  ['food_honey', 'Honey', 304, 0.3, 82.4, 0, 0, 0.2, 82.1, 4],
  ['food_mustard', 'Mustard, prepared', 60, 3.7, 5.8, 3.3, 0.2, 4.0, 0.9, 1104],
  ['food_curry_powder', 'Curry powder', 325, 14.3, 55.8, 14.0, 2.2, 53.2, 2.8, 52],
  ['food_cumin', 'Cumin, ground', 375, 17.8, 44.2, 22.3, 1.5, 10.5, 2.3, 168],
  ['food_turmeric', 'Turmeric, ground', 312, 9.7, 67.1, 3.3, 1.8, 22.7, 3.2, 27],
  ['food_chilli_powder', 'Chilli powder (blend)', 282, 13.5, 49.7, 14.3, 2.5, 34.8, 7.2, 2867],
  ['food_paprika', 'Paprika', 282, 14.1, 54.0, 12.9, 2.1, 34.9, 10.3, 68],
  ['food_oregano', 'Oregano, dried', 265, 9.0, 68.9, 4.3, 1.6, 42.5, 4.1, 25],
  ['food_black_pepper', 'Black pepper, ground', 251, 10.4, 64.0, 3.3, 1.4, 25.3, 0.6, 20],
  ['food_salt', 'Salt, table', 0, 0, 0, 0, 0, 0, 0, 38758],
  ['food_water', 'Water', 0, 0, 0, 0, 0, 0, 0, 0],
  ['food_lemon_juice', 'Lemon juice', 22, 0.4, 6.9, 0.2, 0.04, 0.3, 2.5, 1],
  ['food_banana', 'Banana', 89, 1.1, 22.8, 0.3, 0.11, 2.6, 12.2, 1, [['1 medium (118 g)', 118]]],
  ['food_apple', 'Apple, with skin', 52, 0.3, 13.8, 0.2, 0.03, 2.4, 10.4, 1, [['1 medium (180 g)', 180]]],
  ['food_peanut_butter', 'Peanut butter, smooth', 588, 25.1, 19.6, 50.4, 10.1, 6.0, 9.2, 459, [['1 tbsp (16 g)', 16]]],
  ['food_chicken_stock', 'Chicken stock, liquid (varies — enter from label)', null, null, null, null, null, null, null, null]
];

const REF_SOURCE = {
  kind: 'seed' as const,
  name: 'Approximate generic values based on USDA FoodData Central (SR Legacy)',
  reference: 'https://fdc.nal.usda.gov/',
  note: 'Rounded starter values. Check against the nutrition panel of the product you buy.'
};

export function seedFoods(now: string): Food[] {
  return ROWS.map(([id, name, kcal, p, c, f, sf, fi, su, na, servings]) => {
    const unknown = kcal == null;
    const sv = (servings ?? []).map(([label, amount], i) => ({ id: `${id}_s${i}`, label, amount }));
    return {
      id,
      name,
      kind: 'generic',
      basis: 'g',
      per100: { energyKcal: kcal, proteinG: p, carbsG: c, fatG: f, satFatG: sf, fibreG: fi, sugarsG: su, sodiumMg: na },
      servings: sv,
      defaultServingId: sv[0]?.id,
      source: unknown ? { kind: 'seed', name: 'No generic value — composition varies by brand', note: 'Enter values from your product label.' } : REF_SOURCE,
      quality: unknown ? 'unknown' : 'reference',
      favourite: false,
      archived: false,
      createdAt: now,
      updatedAt: now
    } satisfies Food;
  });
}
