import { describe, expect, it } from 'vitest';
import sample from '../../test/fixtures/recipe-book-sample.json';
import { aisleToCategory, bookRecipeId, contentFingerprint, convertBookRecipe, mapUnit, parseRecipeBook, parseServings, parseTimes, resolveIngredient, roleFor, stripMarkdown, tagsForKey, timerFromText, type IngredientDraft } from './recipeBook';
import { seedIngredients } from '../../data/ingredients';
import { seedFoods } from '../../data/foods';
import { calculateRecipeNutrition } from './nutrition';
import { validateSubstitution } from './safety';

const now = '2026-11-26T00:00:00.000Z';
const existing = new Map(seedIngredients(now).map((i) => [i.id, i]));
const foods = new Map(seedFoods(now).map((f) => [f.id, f]));
const { recipes: book, errors } = parseRecipeBook(sample);
const byId = (id: string) => book.find((r) => r.id === id)!;

function convert(id: string) {
  const drafts = new Map<string, IngredientDraft>();
  return { c: convertBookRecipe(byId(id), drafts, existing, now), drafts };
}

describe('recipe book parsing', () => {
  it('parses the real planner/recipes.json shape', () => {
    expect(errors).toEqual([]);
    expect(book).toHaveLength(5);
  });
  it('rejects non-arrays and reports bad rows without failing the rest', () => {
    expect(parseRecipeBook({}).errors[0]).toMatch(/JSON array/);
    const r = parseRecipeBook([{ id: 'x' }, sample[0], sample[0]]);
    expect(r.recipes).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
  });
});

describe('recipe conversion', () => {
  it('keeps quantities and units as written and maps to existing FormLab ingredients', () => {
    const { c } = convert('SlowCooker-Chilli_Con_Carne_Red_Lentils');
    expect(c.recipeId).toBe(bookRecipeId('SlowCooker-Chilli_Con_Carne_Red_Lentils'));
    const mince = c.content.ingredients.find((i) => i.ingredientId === 'ing_beef_mince')!;
    expect(mince).toMatchObject({ quantity: 500, unit: 'g', role: 'protein' });
    const lentils = c.content.ingredients.find((i) => i.ingredientId === 'ing_red_lentils')!;
    expect(lentils).toMatchObject({ quantity: 0.5, unit: 'cup' });
    expect(c.content.ingredients.find((i) => i.ingredientId === 'ing_garlic')).toMatchObject({ quantity: 3, unit: 'clove' });
    expect(c.content.ingredients.find((i) => i.ingredientId === 'ing_onion')).toMatchObject({ quantity: 1, unit: 'each', preparation: 'diced' });
  });

  it('uses the book chapter for appliances and steps, and the book text for timers', () => {
    const { c } = convert('SlowCooker-Chilli_Con_Carne_Red_Lentils');
    expect(c.content.appliances).toContain('slow-cooker');
    expect(c.content.appliances).toContain('stovetop'); // "In a frying pan, brown the mince"
    const slow = c.content.steps.find((s) => /Cook on Low/.test(s.text))!;
    expect(slow.appliance).toBe('slow-cooker');
    expect(slow.timerMinutes).toBe(360); // "6–8 hours" → lower bound
    expect(c.content.steps.every((s) => !s.text.includes('**'))).toBe(true);
    expect(c.content.validation).toBe('experimental');
    expect(c.meta.category).toBe('Main');
  });

  it('keeps the book nutrition as a labelled estimate', () => {
    const { c } = convert('InstantPot-Beef_Lentil_Bolognese');
    expect(c.content.declaredNutrition).toMatchObject({ perLabel: 'serving', quality: 'estimate' });
    expect(c.content.declaredNutrition!.nutrients.energyKcal).toBe(byId('InstantPot-Beef_Lentil_Bolognese').nutrition!.kcal);
    expect(c.content.declaredNutrition!.nutrients.satFatG).toBeNull();
  });

  it('uses portions for baked goods and midpoints for serving ranges', () => {
    expect(convert('Baking-Banana_Bread').c.content.servings).toBe(10);
    expect(convert('Baking-Banana_Bread').c.content.declaredNutrition!.perLabel).toBe('slice');
    expect(convert('Baking-Banana_Bread').c.meta.category).toBe('Baking');
    expect(convert('Stovetop-Burrito_Bowls').c.content.servings).toBe(2.5);
  });

  it('tags exclusions so preferences apply (brown/green lentils, seafood)', () => {
    const bolo = convert('InstantPot-Beef_Lentil_Bolognese');
    const lentil = [...bolo.drafts.values()].find((d) => d.ingredient.id === 'book_lentils')!;
    expect(lentil.ingredient.tags).toEqual(expect.arrayContaining(['green-lentil', 'brown-lentil']));
    const salmon = convert('Oven-Lemon_Herb_Salmon_Tray_Bake');
    const fish = [...salmon.drafts.values()].find((d) => d.ingredient.id === 'book_salmon')!;
    expect(fish.ingredient.tags).toContain('seafood');
    expect(fish.ingredient.tags).not.toContain('meat');
    expect(validateSubstitution('ing_chicken_thigh', 'book_salmon', [], new Map([...existing, ['book_salmon', fish.ingredient]]), ['seafood']).allowed).toBe(false);
  });

  it('creates new ingredients with conversions from the book estimate, without overwriting existing ones', () => {
    const { drafts } = convert('InstantPot-Beef_Lentil_Bolognese');
    const stock = drafts.get('book_beef-stock')!;
    expect(stock.isNew).toBe(true);
    expect(stock.ingredient.foodId).toBeNull();
    expect(stock.ingredient.densityGPerMl).toBeCloseTo(1, 1);
    const garlic = drafts.get('ing_garlic')!;
    expect(garlic.isNew).toBe(false);
    expect(garlic.ingredient.unitWeightsG.clove).toBe(3); // FormLab's own value kept (book says 5)
    expect(garlic.addedUnitWeights.clove).toBeUndefined();
  });

  it('produces FormLab nutrition from mapped foods and flags what is missing', () => {
    const drafts = new Map<string, IngredientDraft>();
    const c = convertBookRecipe(byId('SlowCooker-Chilli_Con_Carne_Red_Lentils'), drafts, existing, now);
    const ingredients = new Map(existing);
    for (const d of drafts.values()) ingredients.set(d.ingredient.id, d.ingredient);
    const n = calculateRecipeNutrition(c.content, { ingredients, foods });
    expect(n.perServing.proteinG ?? 0).toBeGreaterThan(20);
    expect(n.complete).toBe(false); // beef stock, smoked paprika, cocoa have no FormLab food
    expect(n.issues.map((i) => i.ingredientName)).toEqual(expect.arrayContaining(['Beef stock']));
  });

  it('fingerprint ignores generated ids and changes when content changes', () => {
    const a = convert('SlowCooker-Chilli_Con_Carne_Red_Lentils').c;
    const b = convert('SlowCooker-Chilli_Con_Carne_Red_Lentils').c;
    expect(contentFingerprint(a.content, a.meta)).toBe(contentFingerprint(b.content, b.meta));
    const changed = { ...b.content, ingredients: b.content.ingredients.map((i) => (i.ingredientId === 'ing_beef_mince' ? { ...i, quantity: 600 } : i)) };
    expect(contentFingerprint(changed, b.meta)).not.toBe(contentFingerprint(a.content, a.meta));
  });
});

describe('helpers', () => {
  it('maps units, converting imperial exactly and keeping count units', () => {
    expect(mapUnit('', 2)).toEqual({ unit: 'each', quantity: 2 });
    expect(mapUnit('lb', 1)).toEqual({ unit: 'g', quantity: 454 });
    expect(mapUnit('packet', 1)).toEqual({ unit: 'pack', quantity: 1 });
    expect(mapUnit('scoop', 2)).toEqual({ unit: 'scoop', quantity: 2 });
    expect(mapUnit('cup', 0.5)).toEqual({ unit: 'cup', quantity: 0.5 });
  });
  it('parses times, servings, timers and markdown', () => {
    expect(parseTimes({ ...byId('SlowCooker-Chilli_Con_Carne_Red_Lentils') })).toEqual({ prepMinutes: 15, cookMinutes: (byId('SlowCooker-Chilli_Con_Carne_Red_Lentils').minutes ?? 0) - 15 });
    expect(parseTimes({ ...byId('Stovetop-Burrito_Bowls'), time: '1 hr', minutes: null })).toEqual({ prepMinutes: 0, cookMinutes: 60 });
    expect(parseServings({ ...byId('Stovetop-Burrito_Bowls'), nutrition: null, servings: '4–6' })).toBe(5);
    expect(timerFromText('Pressure Cook on High for 10 minutes, then natural release')).toBe(10);
    expect(timerFromText('Season to taste.')).toBeNull();
    expect(stripMarkdown('**Brown the mince.** In a pan')).toBe('Brown the mince. In a pan');
  });
  it('categorises and assigns roles', () => {
    expect(aisleToCategory('Pantry: check first', 'cumin')).toBe('Spices');
    expect(aisleToCategory('Pantry: check first', 'soy-sauce')).toBe('Pantry');
    expect(aisleToCategory('Meat & fish', 'beef-mince')).toBe('Meat');
    expect(roleFor('onion', 'Fruit & veg')).toBe('aromatic');
    expect(roleFor('chicken-thigh', 'Meat & fish')).toBe('protein');
    expect(roleFor('beef-stock', 'Pantry: check first')).toBe('liquid');
    expect(tagsForKey('oyster-sauce', 'Pantry: check first')).toContain('fish-derived');
    expect(tagsForKey('oyster-sauce', 'Pantry: check first')).not.toContain('seafood');
  });
  it('resolveIngredient reuses one draft per ingredient across recipes', () => {
    const drafts = new Map<string, IngredientDraft>();
    const item = { key: 'beef-stock', name: 'Beef stock', aisle: 'Pantry: check first', qty: 1, unit: 'cup', optional: false, raw: '1 cup beef stock', g: 250 };
    const a = resolveIngredient(item, drafts, existing, now);
    const b = resolveIngredient({ ...item, qty: 2, g: 500 }, drafts, existing, now);
    expect(a).toBe(b);
    expect(drafts.size).toBe(1);
  });
});

describe('water lines', () => {
  it('recovers water the shopping list leaves out', async () => {
    const { parseWaterLine } = await import('./recipeBook');
    expect(parseWaterLine('2 cups water (500 ml)')).toEqual({ quantity: 2, unit: 'cup' });
    expect(parseWaterLine('1½ cups water')).toEqual({ quantity: 1.5, unit: 'cup' });
    expect(parseWaterLine('400 ml water')).toEqual({ quantity: 400, unit: 'ml' });
    expect(parseWaterLine('½ cup boiling water')).toEqual({ quantity: 0.5, unit: 'cup' });
    expect(parseWaterLine('1½ cups stock or water')).toBeNull();
    expect(parseWaterLine('1½ cups rice, rinsed until the water runs clear')).toBeNull();
  });
});

describe('amountless lines', () => {
  it('keeps one optional line with the written text for serving suggestions', () => {
    const { c } = convert('SlowCooker-Chilli_Con_Carne_Red_Lentils');
    const serve = c.content.ingredients.filter((i) => i.preparation.startsWith('Rice or baked potatoes'));
    expect(serve).toHaveLength(1);
    expect(serve[0]).toMatchObject({ quantity: 0, optional: true });
    expect(c.content.ingredients.filter((i) => i.preparation === 'Salt and pepper')).toHaveLength(1);
    expect(c.meta.description.match(/Freezes brilliantly/g)).toHaveLength(1);
  });
});
