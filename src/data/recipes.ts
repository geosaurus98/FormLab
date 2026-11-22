import type { ApplianceId, ApplianceProfile, IngredientRole, Recipe, RecipeVersion } from '../domain/recipes/types';
import type { QuantityUnit } from '../lib/units';
import type { MethodTransformation, SubstitutionRule } from '../domain/recipes/safety';

type I = [string, number, QuantityUnit, IngredientRole, string?, boolean?];
type S = [string, ApplianceId | null, number?, string?];

interface SeedRecipe {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  category: string;
  tags: string[];
  dietary: string[];
  servings: number;
  prep: number;
  cook: number;
  appliances: ApplianceId[];
  equipment: string[];
  ingredients: I[];
  steps: S[];
}

/**
 * Six starter recipes. Written for this app from common home-cooking practice; NOT kitchen-tested
 * by the app author, so all are marked "experimental". Times are typical published ranges and are
 * explicitly flagged in the steps. Always confirm safe internal temperatures.
 */
const RECIPES: SeedRecipe[] = [
  {
    id: 'rec_ip_chicken_curry',
    name: 'Instant Pot tomato chicken curry',
    description: 'Mild tomato-based chicken thigh curry cooked under pressure, served with rice from the rice cooker.',
    cuisine: 'Indian-style',
    category: 'Main',
    tags: ['high-protein', 'batch-cook', 'chicken'],
    dietary: ['dairy-free', 'gluten-free'],
    servings: 4,
    prep: 15,
    cook: 35,
    appliances: ['pressure-cooker', 'rice-cooker'],
    equipment: ['Chopping board', 'Knife', 'Wooden spoon'],
    ingredients: [
      ['ing_chicken_thigh', 500, 'g', 'protein', 'cut into 3 cm pieces'],
      ['ing_canola_oil', 1, 'tbsp', 'fat'],
      ['ing_onion', 1, 'each', 'aromatic', 'finely diced'],
      ['ing_garlic', 4, 'clove', 'aromatic', 'crushed'],
      ['ing_ginger', 20, 'g', 'aromatic', 'grated'],
      ['ing_curry_powder', 2, 'tbsp', 'spice'],
      ['ing_cumin', 1, 'tsp', 'spice'],
      ['ing_turmeric', 0.5, 'tsp', 'spice'],
      ['ing_chilli_powder', 0.5, 'tsp', 'spice', 'adjust to taste'],
      ['ing_water', 250, 'ml', 'liquid'],
      ['ing_tomato_canned', 1, 'can', 'sauce'],
      ['ing_tomato_paste', 2, 'tbsp', 'sauce'],
      ['ing_salt', 0.5, 'tsp', 'spice'],
      ['ing_rice', 300, 'g', 'base', 'rinsed'],
      ['ing_coriander', 10, 'g', 'garnish', 'chopped', true]
    ],
    steps: [
      ['Set the pressure cooker to Sauté. Heat the oil and cook the onion for 4–5 minutes until soft.', 'pressure-cooker', 5],
      ['Add garlic, ginger, curry powder, cumin, turmeric and chilli. Stir for about 1 minute until fragrant.', 'pressure-cooker', 1],
      ['Pour in the water and scrape the base well — removing stuck bits helps prevent a "burn" warning.', 'pressure-cooker'],
      ['Add the chicken and salt. Pour the tomatoes and tomato paste on top; do not stir (thick tomato on the base can scorch).', 'pressure-cooker'],
      ['Seal and pressure cook on High. 10 minutes is a commonly published time for boneless thigh pieces — this app has not tested it. Allow 10 minutes natural release.', 'pressure-cooker', 10, 'Check the thickest chicken piece reaches 75 °C before serving.'],
      ['Meanwhile, cook the rice in the rice cooker with water according to your cooker\'s markings.', 'rice-cooker'],
      ['Release remaining pressure, stir, and Sauté a few minutes to thicken if needed. Garnish with coriander.', 'pressure-cooker']
    ]
  },
  {
    id: 'rec_spag_bol',
    name: 'Spaghetti bolognese',
    description: 'Lean beef mince and vegetable ragù with spaghetti.',
    cuisine: 'Italian-style',
    category: 'Main',
    tags: ['high-protein', 'family', 'beef'],
    dietary: ['dairy-free'],
    servings: 4,
    prep: 15,
    cook: 40,
    appliances: ['stovetop'],
    equipment: ['Large frying pan or pot', 'Large pot for pasta'],
    ingredients: [
      ['ing_olive_oil', 1, 'tbsp', 'fat'],
      ['ing_onion', 1, 'each', 'aromatic', 'diced'],
      ['ing_carrot', 1, 'each', 'vegetable', 'finely diced'],
      ['ing_celery', 1, 'each', 'vegetable', 'finely diced (1 stalk)'],
      ['ing_garlic', 3, 'clove', 'aromatic', 'crushed'],
      ['ing_beef_mince', 500, 'g', 'protein'],
      ['ing_tomato_canned', 1, 'can', 'sauce'],
      ['ing_passata', 300, 'g', 'sauce'],
      ['ing_tomato_paste', 2, 'tbsp', 'sauce'],
      ['ing_oregano', 1, 'tsp', 'spice'],
      ['ing_salt', 0.5, 'tsp', 'spice'],
      ['ing_pepper', 0.25, 'tsp', 'spice'],
      ['ing_spaghetti', 320, 'g', 'base']
    ],
    steps: [
      ['Heat oil in a large pan over medium heat. Cook onion, carrot and celery for 6–8 minutes until soft.', 'stovetop', 7],
      ['Add garlic for 30 seconds, then the mince. Break it up and cook until no pink remains.', 'stovetop', undefined, 'Minced beef should reach 71 °C.'],
      ['Stir in tomatoes, passata, tomato paste, oregano, salt and pepper. Simmer gently, partly covered, 20–25 minutes, stirring occasionally.', 'stovetop', 25],
      ['Meanwhile cook spaghetti in salted boiling water according to the packet. Drain.', 'stovetop'],
      ['Serve the sauce over the spaghetti.', null]
    ]
  },
  {
    id: 'rec_chicken_rice_bake',
    name: 'Chicken and rice bake',
    description: 'One-dish oven bake of chicken thigh, rice, peas and carrot in stock.',
    cuisine: 'Home-style',
    category: 'Main',
    tags: ['one-pan', 'chicken'],
    dietary: ['dairy-free'],
    servings: 4,
    prep: 15,
    cook: 55,
    appliances: ['oven', 'stovetop'],
    equipment: ['Ovenproof dish with lid or foil (approx. 23 × 33 cm)'],
    ingredients: [
      ['ing_chicken_thigh', 500, 'g', 'protein', 'whole thighs or large pieces'],
      ['ing_olive_oil', 1, 'tbsp', 'fat'],
      ['ing_onion', 1, 'each', 'aromatic', 'diced'],
      ['ing_garlic', 3, 'clove', 'aromatic', 'crushed'],
      ['ing_rice', 300, 'g', 'base', 'rinsed'],
      ['ing_chicken_stock', 750, 'ml', 'liquid', 'hot'],
      ['ing_carrot', 2, 'each', 'vegetable', 'diced'],
      ['ing_peas_frozen', 150, 'g', 'vegetable'],
      ['ing_paprika', 2, 'tsp', 'spice'],
      ['ing_pepper', 0.25, 'tsp', 'spice']
    ],
    steps: [
      ['Preheat the oven to 190 °C (conventional).', 'oven'],
      ['Heat oil in a frying pan; soften onion 4 minutes, add garlic 30 seconds.', 'stovetop', 5],
      ['Spread rice, onion mixture and carrot in the dish. Pour over hot stock. Lay chicken on top and sprinkle with paprika and pepper.', null],
      ['Cover tightly and bake. 45–50 minutes is a typical range for this kind of bake; this app has not tested it. Rice should be tender and liquid absorbed.', 'oven', 45, 'Check chicken reaches 75 °C in the thickest part.'],
      ['Stir peas through, cover and stand 5 minutes before serving.', null, 5]
    ]
  },
  {
    id: 'rec_beef_chilli',
    name: 'Beef chilli',
    description: 'Lean beef and kidney bean chilli, browned on the stovetop then slow cooked.',
    cuisine: 'Tex-Mex-style',
    category: 'Main',
    tags: ['high-protein', 'high-fibre', 'batch-cook', 'beef'],
    dietary: ['dairy-free', 'gluten-free'],
    servings: 4,
    prep: 20,
    cook: 360,
    appliances: ['stovetop', 'slow-cooker'],
    equipment: ['Frying pan', 'Slow cooker'],
    ingredients: [
      ['ing_canola_oil', 1, 'tbsp', 'fat'],
      ['ing_onion', 1, 'each', 'aromatic', 'diced'],
      ['ing_garlic', 3, 'clove', 'aromatic', 'crushed'],
      ['ing_beef_mince', 500, 'g', 'protein'],
      ['ing_capsicum', 1, 'each', 'vegetable', 'diced'],
      ['ing_kidney_beans', 2, 'can', 'protein', 'drained and rinsed'],
      ['ing_tomato_canned', 1, 'can', 'sauce'],
      ['ing_tomato_paste', 2, 'tbsp', 'sauce'],
      ['ing_chilli_powder', 2, 'tsp', 'spice'],
      ['ing_cumin', 2, 'tsp', 'spice'],
      ['ing_paprika', 1, 'tsp', 'spice'],
      ['ing_oregano', 1, 'tsp', 'spice'],
      ['ing_water', 125, 'ml', 'liquid'],
      ['ing_rice', 300, 'g', 'base', 'to serve (optional)', true]
    ],
    steps: [
      ['Heat oil in a frying pan. Cook onion 4 minutes, add garlic, then brown the mince well. Drain excess fat if desired.', 'stovetop', 10, 'Thaw mince fully before cooking; never put frozen meat in the slow cooker.'],
      ['Stir in the spices for 1 minute, then transfer to the slow cooker.', 'stovetop', 1],
      ['Add capsicum, canned kidney beans, tomatoes, tomato paste and water. Stir.', 'slow-cooker'],
      ['Cook on Low. 6 hours is a typical published time; the app has not tested it.', 'slow-cooker', 360],
      ['If serving with rice, cook it in the rice cooker near the end.', null]
    ]
  },
  {
    id: 'rec_chicken_stir_fry',
    name: 'Chicken stir-fry',
    description: 'Quick chicken breast and vegetable stir-fry with a soy–honey–ginger sauce.',
    cuisine: 'Asian-style',
    category: 'Main',
    tags: ['quick', 'high-protein', 'chicken'],
    dietary: ['dairy-free'],
    servings: 4,
    prep: 20,
    cook: 15,
    appliances: ['stovetop', 'rice-cooker'],
    equipment: ['Wok or large frying pan'],
    ingredients: [
      ['ing_chicken_breast', 500, 'g', 'protein', 'thinly sliced'],
      ['ing_canola_oil', 1, 'tbsp', 'fat'],
      ['ing_broccoli', 300, 'g', 'vegetable', 'small florets'],
      ['ing_capsicum', 1, 'each', 'vegetable', 'sliced'],
      ['ing_carrot', 1, 'each', 'vegetable', 'thin batons'],
      ['ing_garlic', 3, 'clove', 'aromatic', 'crushed'],
      ['ing_ginger', 15, 'g', 'aromatic', 'grated'],
      ['ing_soy_sauce', 3, 'tbsp', 'sauce'],
      ['ing_honey', 1, 'tbsp', 'sauce'],
      ['ing_cornflour', 1, 'tbsp', 'sauce'],
      ['ing_water', 60, 'ml', 'liquid'],
      ['ing_spring_onion', 2, 'each', 'garnish', 'sliced'],
      ['ing_rice', 300, 'g', 'base', 'rinsed']
    ],
    steps: [
      ['Start the rice in the rice cooker.', 'rice-cooker'],
      ['Mix soy sauce, honey, cornflour and water in a cup.', null],
      ['Heat half the oil in a wok over high heat. Stir-fry chicken in batches until cooked through; set aside.', 'stovetop', 6, 'Chicken should reach 75 °C; slice a thick piece to check.'],
      ['Add remaining oil; stir-fry carrot and broccoli 3 minutes, then capsicum, garlic and ginger 1 minute.', 'stovetop', 4],
      ['Return chicken, pour in sauce and toss until glossy and thickened. Top with spring onion.', 'stovetop', 2]
    ]
  },
  {
    id: 'rec_lf_mac_cheese',
    name: 'Lactose-free macaroni and cheese',
    description: 'Stovetop macaroni cheese using lactose-free milk and aged cheddar, with broccoli.',
    cuisine: 'Comfort',
    category: 'Main',
    tags: ['vegetarian', 'comfort'],
    dietary: ['vegetarian', 'lactose-free'],
    servings: 4,
    prep: 10,
    cook: 25,
    appliances: ['stovetop'],
    equipment: ['Large pot', 'Medium saucepan', 'Whisk'],
    ingredients: [
      ['ing_macaroni', 350, 'g', 'base'],
      ['ing_broccoli', 250, 'g', 'vegetable', 'small florets'],
      ['ing_butter', 30, 'g', 'fat'],
      ['ing_flour', 30, 'g', 'base'],
      ['ing_milk_lf', 600, 'ml', 'liquid'],
      ['ing_cheddar', 150, 'g', 'protein', 'grated'],
      ['ing_mustard', 1, 'tsp', 'sauce'],
      ['ing_pepper', 0.25, 'tsp', 'spice']
    ],
    steps: [
      ['Cook macaroni in boiling salted water according to the packet, adding broccoli for the last 3 minutes. Drain.', 'stovetop', 10],
      ['Melt butter in a saucepan over medium heat, add flour and stir 1 minute.', 'stovetop', 1],
      ['Gradually whisk in the lactose-free milk; simmer, whisking, until thickened (about 5 minutes).', 'stovetop', 5],
      ['Off the heat stir in the cheddar, mustard and pepper until smooth. Combine with pasta and broccoli.', null],
      ['Aged cheddar and butter contain very little lactose, but check labels if you are sensitive.', null]
    ]
  }
];

export function seedRecipes(now: string): { recipes: Recipe[]; versions: RecipeVersion[] } {
  const recipes: Recipe[] = [];
  const versions: RecipeVersion[] = [];
  for (const r of RECIPES) {
    const vId = `${r.id}_v1`;
    recipes.push({
      id: r.id,
      name: r.name,
      description: r.description,
      cuisine: r.cuisine,
      category: r.category,
      tags: r.tags,
      dietary: r.dietary,
      source: { kind: 'seed', name: 'FormLab starter recipe', note: 'Written from common home-cooking practice; not kitchen-tested.' },
      currentVersionId: vId,
      favourite: false,
      archived: false,
      createdAt: now,
      updatedAt: now
    });
    versions.push({
      id: vId,
      recipeId: r.id,
      versionNumber: 1,
      parentVersionId: null,
      branch: 'main',
      servings: r.servings,
      prepMinutes: r.prep,
      cookMinutes: r.cook,
      ingredients: r.ingredients.map(([ingredientId, quantity, unit, role, preparation, optional], i) => ({ id: `${vId}_i${i}`, ingredientId, quantity, unit, role, preparation: preparation ?? '', optional: optional ?? false })),
      appliances: r.appliances,
      equipment: r.equipment,
      steps: r.steps.map(([text, appliance, timer, safety], i) => ({ id: `${vId}_s${i}`, text, appliance, timerMinutes: timer ?? null, safetyNote: safety ?? null })),
      validation: 'experimental',
      changeSummary: 'Initial version',
      changeReason: '',
      createdAt: now
    });
  }
  return { recipes, versions };
}

export const SEED_APPLIANCE_PROFILES: ApplianceProfile[] = [
  { id: 'pressure-cooker', name: 'Electric pressure cooker (Instant Pot-style, 6 qt / 5.7 L)', capacityLitres: 5.7, maxFillFraction: 2 / 3, minLiquidMl: 250, notes: 'Do not fill above 2/3 (1/2 for foods that foam, such as beans and grains). Thin liquid is needed to build pressure.', sourceReference: 'Typical manufacturer guidance for 6-quart models — check your model\'s manual and edit these values.', validation: 'source-checked' },
  { id: 'slow-cooker', name: 'Slow cooker', capacityLitres: 5.5, maxFillFraction: 0.75, minLiquidMl: null, notes: 'Fill between half and three-quarters. Thaw meat first. Boil dried kidney beans before slow cooking.', sourceReference: 'Common manufacturer and food-safety guidance — check your model.', validation: 'source-checked' },
  { id: 'rice-cooker', name: 'Rice cooker', capacityLitres: null, maxFillFraction: null, minLiquidMl: null, notes: 'Use the cooker\'s own water markings.', sourceReference: 'Manufacturer instructions', validation: 'source-checked' },
  { id: 'air-fryer', name: 'Air fryer', capacityLitres: null, maxFillFraction: null, minLiquidMl: null, notes: 'Cook in a single layer; shake halfway. Times vary widely between models.', sourceReference: 'Manufacturer instructions', validation: 'experimental' },
  { id: 'oven', name: 'Oven', capacityLitres: null, maxFillFraction: null, minLiquidMl: null, notes: 'Temperatures are conventional; reduce ~20 °C for fan-forced.', sourceReference: 'General guidance', validation: 'source-checked' },
  { id: 'stovetop', name: 'Stovetop', capacityLitres: null, maxFillFraction: null, minLiquidMl: null, notes: '', sourceReference: '', validation: 'source-checked' },
  { id: 'microwave', name: 'Microwave', capacityLitres: null, maxFillFraction: null, minLiquidMl: null, notes: 'Stir and stand; reheat leftovers until steaming hot (74 °C).', sourceReference: 'USDA FSIS', validation: 'source-checked' }
];

export const SEED_SUBSTITUTIONS: SubstitutionRule[] = [
  { id: 'sub_thigh_breast', fromIngredientId: 'ing_chicken_thigh', toIngredientId: 'ing_chicken_breast', ratio: 1, status: 'experimental', notes: 'Breast is leaner and dries out faster; cooking time may need to be shorter. Still cook to 75 °C.', source: '' },
  { id: 'sub_breast_thigh', fromIngredientId: 'ing_chicken_breast', toIngredientId: 'ing_chicken_thigh', ratio: 1, status: 'experimental', notes: 'Thigh has more fat (and saturated fat); usually more forgiving.', source: '' },
  { id: 'sub_canned_passata', fromIngredientId: 'ing_tomato_canned', toIngredientId: 'ing_passata', ratio: 1, status: 'experimental', notes: 'Passata is thicker — in a pressure cooker this raises burn-warning risk; keep thin liquid on the base.', source: '' },
  { id: 'sub_rice_barley', fromIngredientId: 'ing_rice', toIngredientId: 'ing_barley', ratio: 1, status: 'experimental', notes: 'Barley needs longer cooking and more liquid than rice. Rewrite the method; do not reuse rice timings.', source: '' }
];

export const SEED_METHOD_TRANSFORMATIONS: MethodTransformation[] = [
  { id: 'mt_stove_slow', from: 'stovetop', to: 'slow-cooker', status: 'experimental', guidance: 'Brown meat and aromatics on the stovetop first. Reduce added liquid (little evaporates). Do not add dried kidney beans or frozen meat. Write and test your own times.', source: 'General slow-cooker guidance (USDA FSIS)' },
  { id: 'mt_stove_pressure', from: 'stovetop', to: 'pressure-cooker', status: 'experimental', guidance: 'Ensure at least the minimum thin liquid for your cooker; layer thick sauces on top; fill no more than 2/3. Times must come from a tested source.', source: 'Manufacturer guidance' },
  { id: 'mt_pressure_slow', from: 'pressure-cooker', to: 'slow-cooker', status: 'experimental', guidance: 'Reduce liquid; extend cooking substantially; use tested slow-cooker times from a reliable source.', source: '' },
  { id: 'mt_slow_pressure', from: 'slow-cooker', to: 'pressure-cooker', status: 'experimental', guidance: 'Check minimum liquid and fill line. Dried beans need source-checked pressure times.', source: '' }
];
