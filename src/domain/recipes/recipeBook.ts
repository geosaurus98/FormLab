import { z } from 'zod';
import { unknownNutrients } from '../nutrition/nutrients';
import { COUNT_UNITS, VOLUME_UNITS, isCountUnit, isVolumeUnit, type CountUnit, type QuantityUnit } from '../../lib/units';
import type { ApplianceId, DeclaredNutrition, GroceryCategory, Ingredient, IngredientRole, RecipeIngredient, RecipeStep } from './types';
import type { VersionContent } from './versions';

/**
 * Converts recipes from the "recipe-book" repository (its planner/recipes.json) into FormLab
 * recipes. Pure: no database access. The recipe book stays the place recipes are written; FormLab
 * imports them as versioned recipes with structured ingredients.
 *
 * Honesty rules:
 * - Quantities and units are kept as written in the book.
 * - Cooking times come only from the book's own text (never generated).
 * - Gram weights the book's parser estimated are used only to fill conversions FormLab lacks.
 * - The book's per-serving nutrition is kept as a labelled *estimate*, separate from FormLab's
 *   calculation from food data.
 * - Imported versions are "experimental" until the user marks them otherwise.
 */

export const DEFAULT_RECIPE_BOOK_URL = 'https://raw.githubusercontent.com/geosaurus98/recipe-book/main/planner/recipes.json';
export const RECIPE_BOOK_SOURCE_NAME = 'Recipe book (geosaurus98/recipe-book)';
export const BOOK_ESTIMATE_SOURCE = "Recipe book planner estimate (generic ingredient values, about ±10–15%)";

const ShopItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  aisle: z.string().nullable().optional(),
  qty: z.number().nullable().optional(),
  unit: z.string().nullish().transform((v) => v ?? ''),
  optional: z.boolean().nullish().transform((v) => v ?? false),
  raw: z.string().nullish().transform((v) => v ?? ''),
  g: z.number().nullable().optional()
});
export type BookShopItem = z.infer<typeof ShopItemSchema>;

/** null and missing both mean "absent" in the book's generated JSON */
const optStr = z.string().nullish().transform((v) => v ?? undefined);
const SectionItemSchema = z.object({ text: optStr, group: optStr }).passthrough();
const SectionSchema = z
  .object({
    kind: z.string(),
    heading: optStr,
    items: z.array(SectionItemSchema).nullish().transform((v) => v ?? undefined),
    text: optStr
  })
  .passthrough();

export const BookRecipeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    file: z.string().optional(),
    servings: z.union([z.string(), z.number()]).transform(String),
    time: z.string().nullish().transform((v) => v ?? ''),
    minutes: z.number().nullable().optional(),
    intro: z.string().nullish().transform((v) => v ?? ''),
    sections: z.array(SectionSchema).nullish().transform((v) => v ?? []),
    chapter: z.string().nullish().transform((v) => v ?? ''),
    chapterName: z.string().nullish().transform((v) => v ?? ''),
    shop: z.array(ShopItemSchema).nullish().transform((v) => v ?? []),
    /** flat list of every ingredient line as written */
    ingredients: z.array(z.string()).nullish().transform((v) => v ?? []),
    tags: z.array(z.string()).nullish().transform((v) => v ?? []),
    diet: z.array(z.string()).nullish().transform((v) => v ?? []),
    storage: z.array(z.string()).nullish().transform((v) => v ?? []),
    nutrition: z
      .object({ kcal: z.number().nullable().optional(), protein: z.number().nullable().optional(), carbs: z.number().nullable().optional(), fat: z.number().nullable().optional(), per: z.string().nullish().transform((v) => v ?? 'serving'), count: z.number().nullable().optional() })
      .nullable()
      .optional()
  })
  .passthrough();
export type BookRecipe = z.infer<typeof BookRecipeSchema>;

export function parseRecipeBook(raw: unknown): { recipes: BookRecipe[]; errors: string[] } {
  if (!Array.isArray(raw)) return { recipes: [], errors: ['Expected a JSON array of recipes (planner/recipes.json).'] };
  const recipes: BookRecipe[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((r, i) => {
    const p = BookRecipeSchema.safeParse(r);
    if (!p.success) {
      errors.push(`Recipe ${i + 1}: ${p.error.issues[0]?.path.join('.')} ${p.error.issues[0]?.message}`);
      return;
    }
    if (seen.has(p.data.id)) {
      errors.push(`Duplicate recipe id ${p.data.id} skipped`);
      return;
    }
    seen.add(p.data.id);
    recipes.push(p.data);
  });
  return { recipes, errors };
}

/* ---------------- ingredient mapping ---------------- */

/** Book ingredient keys that are the same thing as an existing FormLab ingredient. */
export const BOOK_KEY_TO_INGREDIENT: Record<string, string> = {
  onion: 'ing_onion',
  garlic: 'ing_garlic',
  ginger: 'ing_ginger',
  carrot: 'ing_carrot',
  celery: 'ing_celery',
  capsicum: 'ing_capsicum',
  broccoli: 'ing_broccoli',
  spinach: 'ing_spinach',
  'spring-onion': 'ing_spring_onion',
  coriander: 'ing_coriander',
  'frozen-peas': 'ing_peas_frozen',
  edamame: 'ing_edamame',
  'canned-tomatoes': 'ing_tomato_canned',
  'tomato-paste': 'ing_tomato_paste',
  passata: 'ing_passata',
  'kidney-beans': 'ing_kidney_beans',
  'red-lentils': 'ing_red_lentils',
  'split-peas': 'ing_split_peas',
  barley: 'ing_barley',
  rice: 'ing_rice',
  spaghetti: 'ing_spaghetti',
  macaroni: 'ing_macaroni',
  flour: 'ing_flour',
  cornflour: 'ing_cornflour',
  cheese: 'ing_cheddar',
  butter: 'ing_butter',
  'olive-oil': 'ing_olive_oil',
  oil: 'ing_canola_oil',
  'soy-sauce': 'ing_soy_sauce',
  honey: 'ing_honey',
  mustard: 'ing_mustard',
  'chicken-stock': 'ing_chicken_stock',
  'curry-powder': 'ing_curry_powder',
  cumin: 'ing_cumin',
  turmeric: 'ing_turmeric',
  'chilli-powder': 'ing_chilli_powder',
  paprika: 'ing_paprika',
  oregano: 'ing_oregano',
  pepper: 'ing_pepper',
  salt: 'ing_salt',
  potato: 'ing_potato',
  kumara: 'ing_kumara',
  mushrooms: 'ing_mushroom',
  'chicken-breast': 'ing_chicken_breast',
  'chicken-thigh': 'ing_chicken_thigh',
  'beef-mince': 'ing_beef_mince',
  eggs: 'ing_egg'
};

/** New ingredients that can use an existing FormLab food for nutrition (same food, different name/form). */
export const BOOK_KEY_TO_FOOD: Record<string, string> = {
  'basmati-rice': 'food_rice_white',
  'jasmine-rice': 'food_rice_white',
  pasta: 'food_pasta_dry',
  rigatoni: 'food_pasta_dry',
  'lasagne-sheets': 'food_pasta_dry',
  'greek-yoghurt': 'food_greek_yoghurt',
  banana: 'food_banana',
  apple: 'food_apple',
  oats: 'food_oats',
  'peanut-butter': 'food_peanut_butter'
};

/** Parser artefacts in the book data (not real ingredients). */
const NOT_INGREDIENTS = new Set(['cut-into-chunks', 'for-garnish', 'for-topping', 'optional', 'your-choice-of-toppings']);

const SPICE_WORDS = /allspice|bay|cayenne|cinnamon|cloves|coriander|cumin|curry|garam|ginger|herbs|masala|mustard-powder|nutmeg|oregano|paprika|pepper|rosemary|sage|seasoning|spice|star-anise|thyme|turmeric|chilli-flakes|chilli-powder|caraway|cardamom|fennel|sichuan|salt|garlic-powder|onion-powder/;

export function aisleToCategory(aisle: string | null | undefined, key: string): GroceryCategory {
  switch (aisle) {
    case 'Meat & fish':
      return 'Meat';
    case 'Fruit & veg':
      return 'Produce';
    case 'Dairy, eggs & chilled':
      return 'Dairy & eggs';
    case 'Frozen':
      return 'Frozen';
    case 'Cans, jars & pulses':
      return 'Tins & jars';
    case 'Bread & wraps':
      return 'Bakery';
    case 'Pasta, rice & grains':
    case 'Baking':
      return 'Pantry';
    case 'Pantry: check first':
      return SPICE_WORDS.test(key) ? 'Spices' : 'Pantry';
    default:
      return SPICE_WORDS.test(key) ? 'Spices' : 'Other';
  }
}

export function tagsForKey(key: string, aisle: string | null | undefined): string[] {
  const t = new Set<string>(['recipe-book']);
  if (aisle === 'Meat & fish') t.add('meat');
  if (/^(salmon|tuna|fish|prawn|shrimp|mussel|seafood)/.test(key)) {
    t.add('seafood');
    t.delete('meat');
  }
  if (/^chicken/.test(key)) t.add('poultry');
  if (/mince/.test(key)) t.add('mince');
  if (/^(pork|bacon|ham|sausage)/.test(key)) t.add('pork');
  if (/^(beef|steak|stewing-beef|schnitzel)/.test(key)) t.add('red-meat');
  if (key === 'lentils') ['legume', 'green-lentil', 'brown-lentil'].forEach((x) => t.add(x));
  if (/beans|chickpeas|lentil|split-peas|edamame/.test(key)) t.add('legume');
  if (/^(fish-sauce|oyster-sauce)$/.test(key)) t.add('fish-derived');
  if (aisle === 'Dairy, eggs & chilled' && /cheese|milk|butter|cream|yoghurt|feta|parmesan|mozzarella|sour-cream/.test(key)) t.add('dairy');
  if (/stock|^wine$|guinness|coconut-milk|^milk$/.test(key)) t.add('liquid');
  return [...t];
}

export function roleFor(key: string, aisle: string | null | undefined): IngredientRole {
  if (/^(onion|red-onion|garlic|ginger|spring-onion|shallot|chilli|lemon|lime)$/.test(key)) return 'aromatic';
  if (aisle === 'Meat & fish' || /^(eggs|tofu|lentils|red-lentils|split-peas|chickpeas|black-beans|kidney-beans|cannellini|edamame|protein-powder|greek-yoghurt|cottage-cheese)$/.test(key)) return 'protein';
  if (/stock|^water$|^wine$|guinness|coconut-milk|coconut-cream|^milk$/.test(key)) return 'liquid';
  if (/oil$|^butter$/.test(key)) return 'fat';
  if (SPICE_WORDS.test(key) && aisle !== 'Fruit & veg') return 'spice';
  if (/sauce|paste|tomatoes|passata|salsa|honey|vinegar|syrup|jam|hoisin|mustard|mayonnaise|worcestershire|sweet-chilli/.test(key)) return 'sauce';
  if (/rice|pasta|spaghetti|macaroni|noodles|flour|oats|bread|tortillas|couscous|quinoa|barley|potato|kumara|wrap|buns|pita|lasagne|rigatoni|polenta/.test(key)) return 'base';
  if (/^(coriander|parsley|basil|mint)$/.test(key)) return 'garnish';
  if (aisle === 'Fruit & veg' || aisle === 'Frozen') return 'vegetable';
  return 'other';
}

/** Maps a book unit to a FormLab unit and a quantity in that unit. Pounds/ounces convert exactly. */
export function mapUnit(unit: string, qty: number): { unit: QuantityUnit; quantity: number } {
  const u = unit.trim().toLowerCase();
  if (u === '') return { unit: 'each', quantity: qty };
  if (u === 'lb') return { unit: 'g', quantity: Math.round(qty * 453.59237) };
  if (u === 'oz') return { unit: 'g', quantity: Math.round(qty * 28.349523) };
  if (u === 'packet') return { unit: 'pack', quantity: qty };
  if (u === 'g' || u === 'kg' || u === 'mg') return { unit: u, quantity: qty };
  if (isVolumeUnit(u)) return { unit: u, quantity: qty };
  if (isCountUnit(u)) return { unit: u, quantity: qty };
  return { unit: 'each', quantity: qty };
}

export interface IngredientDraft {
  ingredient: Ingredient;
  isNew: boolean;
  /** conversions this import adds to the ingredient (only where it had none) */
  addedUnitWeights: Partial<Record<CountUnit, number>>;
  addedDensity: number | null;
}

export function bookIngredientId(key: string): string {
  return BOOK_KEY_TO_INGREDIENT[key] ?? `book_${key.replace(/[^a-z0-9-]/gi, '-')}`;
}

/**
 * Resolves (and if needed drafts) the FormLab ingredient for a book shopping item. Fills missing
 * unit weights / density from the book's gram estimate, never overwriting existing values.
 */
export function resolveIngredient(item: BookShopItem, drafts: Map<string, IngredientDraft>, existing: Map<string, Ingredient>, now: string): IngredientDraft {
  const id = bookIngredientId(item.key);
  let draft = drafts.get(id);
  if (!draft) {
    const found = existing.get(id);
    draft = found
      ? { ingredient: { ...found, unitWeightsG: { ...found.unitWeightsG } }, isNew: false, addedUnitWeights: {}, addedDensity: null }
      : {
          ingredient: {
            id,
            name: item.name,
            foodId: BOOK_KEY_TO_FOOD[item.key] ?? null,
            category: aisleToCategory(item.aisle, item.key),
            densityGPerMl: null,
            unitWeightsG: {},
            tags: tagsForKey(item.key, item.aisle),
            packageSize: null,
            packagePriceNZD: null,
            priceUpdatedAt: null,
            createdAt: now,
            updatedAt: now
          },
          isNew: true,
          addedUnitWeights: {},
          addedDensity: null
        };
    drafts.set(id, draft);
  }
  const qty = item.qty ?? null;
  const g = item.g ?? null;
  if (qty && qty > 0 && g && g > 0) {
    const { unit } = mapUnit(item.unit, qty);
    const ing = draft.ingredient;
    if (isCountUnit(unit) && ing.unitWeightsG[unit] == null) {
      const w = Math.round((g / qty) * 10) / 10;
      ing.unitWeightsG[unit] = w;
      draft.addedUnitWeights[unit] = w;
    } else if (isVolumeUnit(unit) && ing.densityGPerMl == null) {
      const d = Math.round((g / (qty * VOLUME_UNITS[unit])) * 1000) / 1000;
      if (d > 0) {
        ing.densityGPerMl = d;
        draft.addedDensity = d;
      }
    }
  }
  return draft;
}

/* ---------------- recipe conversion ---------------- */

export const CHAPTER_CATEGORY: Record<string, string> = {
  stovetop: 'Main',
  pressure: 'Main',
  slow: 'Main',
  oven: 'Main',
  sides: 'Side',
  baking: 'Baking',
  breadmaker: 'Bread',
  snacks: 'Snack',
  desserts: 'Dessert',
  breakfast: 'Breakfast',
  shakes: 'Shake'
};

const CHAPTER_APPLIANCE: Record<string, ApplianceId | undefined> = {
  stovetop: 'stovetop',
  pressure: 'pressure-cooker',
  slow: 'slow-cooker',
  oven: 'oven',
  baking: 'oven',
  breadmaker: 'bread-maker'
};

const STEP_APPLIANCE_PATTERNS: [ApplianceId, RegExp][] = [
  ['pressure-cooker', /pressure cook|instant pot|valve|natural release|quick release/i],
  ['slow-cooker', /slow cook|slow-cook|on low|on high for|crock/i],
  ['bread-maker', /bread maker|breadmaker|bread pan|machine/i],
  ['air-fryer', /air fryer|air-fry/i],
  ['rice-cooker', /rice cooker/i],
  ['microwave', /microwave/i],
  ['oven', /\boven\b|\bbake\b|\bbaking\b|\broast\b|\bgrill\b/i],
  ['stovetop', /frying pan|saucepan|stovetop|\bwok\b|skillet|\bpan over|\bsimmer\b|\bboil\b|\bfry\b/i]
];

export function stripMarkdown(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/\s+/g, ' ').trim();
}

/** First explicit duration in a step ("for 10 minutes", "6–8 hours") → minutes, lower bound of ranges. */
export function timerFromText(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:[–-]\s*\d+(?:\.\d+)?\s*)?(minutes?|mins?|hours?|hrs?|hr)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  return /^h/i.test(m[2]!) ? n * 60 : n;
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/** Parses an ingredient line that is plain water, e.g. "400 ml water", "2½ cups water (500 ml)". */
export function parseWaterLine(line: string): { quantity: number; unit: QuantityUnit } | null {
  const m = /^\s*(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛])?\s*(ml|l|litres?|cups?|tbsp|tsp)\s+(?:of\s+)?(?:cold\s+|hot\s+|boiling\s+|warm\s+|extra\s+)?water\b/i.exec(stripMarkdown(line));
  if (!m || (!m[1] && !m[2])) return null;
  const qty = Number(m[1] ?? 0) + (m[2] ? FRACTIONS[m[2]]! : 0);
  const u = m[3]!.toLowerCase();
  const unit: QuantityUnit = u.startsWith('cup') ? 'cup' : u.startsWith('l') && u !== 'ml' ? 'l' : (u as QuantityUnit);
  return qty > 0 ? { quantity: qty, unit } : null;
}

export function parseServings(book: BookRecipe): number {
  const c = book.nutrition?.count;
  if (c && c > 0) return c;
  const nums = (book.servings.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return 4;
  return nums.length >= 2 ? (nums[0]! + nums[1]!) / 2 : nums[0]!;
}

export function parseTimes(book: BookRecipe): { prepMinutes: number; cookMinutes: number } {
  const t = book.time;
  const prepMatch = /(\d+)\s*min(?:utes)?\s*prep|prep\s*(\d+)\s*min/i.exec(t);
  const prep = prepMatch ? Number(prepMatch[1] ?? prepMatch[2]) : 0;
  let total = book.minutes ?? null;
  if (total == null) {
    let sum = 0;
    for (const m of t.matchAll(/(\d+)\s*(min|hr|hour)/gi)) sum += /^h/i.test(m[2]!) ? Number(m[1]) * 60 : Number(m[1]);
    total = sum || prep;
  }
  return { prepMinutes: prep, cookMinutes: Math.max(0, total - prep) };
}

function describe(book: BookRecipe): string {
  const parts: string[] = [];
  const ingredientText = new Set(book.ingredients.map((l) => stripMarkdown(l)));
  if (book.intro) parts.push(stripMarkdown(book.intro));
  for (const s of book.sections) {
    if (s.kind === 'notes' || s.kind === 'list' || s.kind === 'text') {
      const texts = (s.items ?? []).map((i) => i.text).filter((x): x is string => !!x);
      // Some recipes keep ingredient lists in "list" sections — those are already structured ingredients.
      if (s.kind === 'list' && texts.length && texts.every((t) => ingredientText.has(stripMarkdown(t)))) continue;
      const lines = (s.items ?? []).map((i) => i.text).filter((x): x is string => !!x).map((x) => `• ${stripMarkdown(x)}`);
      if (s.text) lines.unshift(stripMarkdown(s.text));
      if (lines.length) parts.push(`${s.heading ?? 'Notes'}:\n${lines.join('\n')}`);
    } else if (s.kind === 'variation' && s.text) {
      parts.push(`${s.heading ?? 'Variation'}: ${stripMarkdown(s.text)}`);
    }
  }
  if (book.storage.length) parts.push(`Storage: ${book.storage.map(stripMarkdown).join(' ')}`);
  return parts.join('\n\n');
}

export interface ConvertedRecipe {
  bookId: string;
  recipeId: string;
  meta: { name: string; description: string; cuisine: string; category: string; tags: string[]; dietary: string[] };
  content: VersionContent;
  skippedItems: string[];
}

export function bookRecipeId(bookId: string): string {
  return `book_${bookId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export function convertBookRecipe(book: BookRecipe, drafts: Map<string, IngredientDraft>, existing: Map<string, Ingredient>, now: string): ConvertedRecipe {
  const recipeId = bookRecipeId(book.id);
  const skippedItems: string[] = [];
  const ingredients: RecipeIngredient[] = [];
  book.shop.forEach((item, i) => {
    if (NOT_INGREDIENTS.has(item.key)) {
      skippedItems.push(item.raw || item.name);
      return;
    }
    const draft = resolveIngredient(item, drafts, existing, now);
    const qty = item.qty ?? null;
    const mapped = qty != null && qty > 0 ? mapUnit(item.unit, qty) : { unit: 'g' as QuantityUnit, quantity: 0 };
    const comma = item.raw.indexOf(',');
    ingredients.push({
      id: `${recipeId}_i${i}`,
      ingredientId: draft.ingredient.id,
      quantity: mapped.quantity,
      unit: mapped.unit,
      preparation: comma >= 0 ? item.raw.slice(comma + 1).trim() : qty == null ? item.raw : '',
      optional: item.optional || qty == null,
      role: roleFor(item.key, item.aisle)
    });
  });

  // The book's shopping list leaves out water (nothing to buy), but cooking checks need it.
  book.ingredients.forEach((line, i) => {
    const w = parseWaterLine(line);
    if (w) ingredients.push({ id: `${recipeId}_w${i}`, ingredientId: 'ing_water', quantity: w.quantity, unit: w.unit, preparation: '', optional: false, role: 'liquid' });
  });

  const stepTexts = book.sections.filter((s) => s.kind === 'steps').flatMap((s) => (s.items ?? []).map((i) => i.text).filter((x): x is string => !!x));
  const chapterAppliance = CHAPTER_APPLIANCE[book.chapter];
  const steps: RecipeStep[] = stepTexts.map((raw, i) => {
    const text = stripMarkdown(raw);
    // "Sauté" means the pressure cooker's Sauté mode only in the pressure-cooker chapter.
    const appliance = (book.chapter === 'pressure' && /sauté|saute/i.test(text) ? 'pressure-cooker' : null) ?? STEP_APPLIANCE_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
    return { id: `${recipeId}_s${i}`, text, appliance, timerMinutes: timerFromText(text), safetyNote: null };
  });
  const appliances = new Set<ApplianceId>();
  if (chapterAppliance) appliances.add(chapterAppliance);
  for (const s of steps) if (s.appliance) appliances.add(s.appliance);
  // Steps with no detected appliance in a single-appliance chapter use that appliance.
  if (chapterAppliance && !steps.some((s) => s.appliance === chapterAppliance)) for (const s of steps) if (!s.appliance) s.appliance = chapterAppliance;

  const n = book.nutrition;
  const declaredNutrition: DeclaredNutrition | null =
    n && (n.kcal != null || n.protein != null)
      ? { perLabel: n.per || 'serving', nutrients: { ...unknownNutrients(), energyKcal: n.kcal ?? null, proteinG: n.protein ?? null, carbsG: n.carbs ?? null, fatG: n.fat ?? null }, source: BOOK_ESTIMATE_SOURCE, quality: 'estimate' }
      : null;

  const { prepMinutes, cookMinutes } = parseTimes(book);
  return {
    bookId: book.id,
    recipeId,
    meta: {
      name: stripMarkdown(book.title),
      description: describe(book),
      cuisine: '',
      category: CHAPTER_CATEGORY[book.chapter] ?? (book.chapterName || 'Other'),
      tags: [...new Set([...book.tags, 'recipe-book', book.chapterName].filter(Boolean))],
      dietary: book.diet
    },
    content: {
      servings: parseServings(book),
      prepMinutes,
      cookMinutes,
      ingredients,
      appliances: [...appliances],
      equipment: [],
      steps,
      validation: 'experimental',
      declaredNutrition,
      changeSummary: 'Imported from recipe book',
      changeReason: ''
    },
    skippedItems
  };
}

/** Stable fingerprint of book-derived content, used to detect changes between imports. */
export function contentFingerprint(c: VersionContent, meta?: ConvertedRecipe['meta']): string {
  const strip = <T extends { id: string }>(xs: T[]) => xs.map(({ id: _id, ...rest }) => rest);
  return JSON.stringify({ s: c.servings, p: c.prepMinutes, c: c.cookMinutes, i: strip(c.ingredients), a: [...c.appliances].sort(), st: strip(c.steps), d: c.declaredNutrition ?? null, m: meta ?? null });
}

export const ALL_COUNT_UNITS = COUNT_UNITS;
