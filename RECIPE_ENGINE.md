# Recipe engine (PantryGenome and Recipe Lab)

Code: `src/domain/recipes/*`, `src/domain/planner/*`, `src/db/recipeService.ts`, `src/db/plannerService.ts`.

## Structure

A **Recipe** holds metadata and points at `currentVersionId`. A **RecipeVersion** is immutable content: servings, times, appliances, equipment, steps and `RecipeIngredient[]`. Each recipe ingredient references a structured **Ingredient** (not free text), with a quantity, unit, role (protein/aromatic/spice/sauce/liquid/…), preparation note and an optional flag.

## Nutrition calculation

`calculateRecipeNutrition(version, {ingredients, foods})`:

1. For each non-optional ingredient: look up Ingredient → Food. If there's no linked food, report an issue and count the nutrients as missing.
2. Convert the quantity to the food's basis with `toGrams`: mass units directly, volume via the ingredient's **density**, and counts (each/can/clove/bunch) via **unit weights**. If a conversion isn't recorded, report an issue rather than guess.
3. Add up the scaled `per100` nutrients, tracking unknowns.
4. Return `total`, `perServing` (÷ servings), `issues` and `complete`, which is true only when energy and macros are fully known.

Changing ingredients means a new version, and the calculation reruns automatically wherever it's displayed.

## Scaling

`scaleVersion(version, servings)` multiplies quantities and rounds them to kitchen precision (quarters for counts and spoons, whole grams above 10 g, multiples of 5 above 100 g). `suggestedMeatGrams` applies the editable default of 500 g meat per 4 servings.

## Versions and the Lab

- `updateRecipe` creates a new version only when the cookable content changes, and generates a change summary with `diffVersions`.
- **Branches:** `createBranch` makes an experimental line (e.g. `extra-ginger`) from any version. Branch versions are always `experimental`. `promoteVersion` copies a branch head into a new *main* version, and the original stays in history.
- **Feedback:** cooking mode records actual time, rating, structured issues and whether you'd make it again.
- **Suggestion:** `suggestModification` takes the most frequent issue among the 5 most recent feedback entries and maps it to one rule (e.g. too mild → spice ingredients +25 %, too watery → liquid −15 %). It shows the number of reports behind it and can pre-fill an experiment.
- **Compare:** a diff plus nutrition and rating comparison, with sample-size caution.

## Shopping lists

`buildGroceryItems(cooks, ingredients, pantry)`:

1. **Aggregate:** convert to base units (g, ml or the count unit). Volume becomes mass only when a density is known; otherwise the lines stay separate rather than being guessed together. Leftover plan entries add servings to the parent cook instead of adding groceries.
2. **Pantry subtraction:** only within the same unit. Items marked *staple* by the user count as covered. Nothing is assumed in stock otherwise.
3. **Package rounding:** `packagesNeeded` rounds up to the pack size, converting between counts and grams through unit weights.
4. **Cost:** packages × the user's package price. Unpriced items are counted and shown, never silently ignored.

Lists are snapshots with check boxes and manual items. They can be copied or exported as text, and ticked items can be moved into the pantry.

## Food safety and method transformations

`checkRecipeSafety(version, ingredients, applianceProfiles)` returns findings at block, warn or info level, each with a source:

- **Block:** dried kidney beans in a slow cooker (they must be boiled first); frozen meat in a slow cooker.
- **Warn:** pressure cooker below the profile's minimum thin liquid; pressure or slow cooker over the fill line (approximate volume).
- **Info:** internal-temperature checks by ingredient tag (poultry 75 °C, mince 71 °C, pork 63 °C) with their sources; listed appliances that no step uses.

Cooking mode refuses to start when a block-level finding exists.

**Substitutions** (`validateSubstitution`) are blocked if the replacement has an excluded tag. A recorded rule returns its status and ratio. With no rule, a swap is allowed only as `experimental`, with warnings such as a changed protein type.

**Method transformations** (`checkMethodTransformation`) are rejected unless a rule exists. Supported ones return guidance text only. In the Lab, converted steps are flagged "REWRITE FOR …" and their timers are cleared. **The app never invents cooking times** and never upgrades validation status automatically.

Validation statuses: kitchen-tested · source-checked · experimental · blocked. All six seed recipes are *experimental*.

## Meal recommendations

`scoreRecipe` / `recommendMeals` work in two stages:

- **Hard exclusions**, each with a reason: missing appliance, excluded tag or ingredient, time limit, cost limit, blocked recipe.
- **Soft score**, starting at 50, where each adjustment adds a reason: protein ≥ minimum (+15), saturated fat above preference (−10), incomplete nutrition (−5), cost (±10), rating ((r−3)×5), eaten in the last 7 days (−20), shared fresh produce with other picks (up to +10), same cuisine already picked (−8), favourite (+5).

The selection is greedy, so overlap and variety update after each pick. `suggestForRemaining` ranks recipes by protein per 100 kcal that fit today's remaining energy.

## Importing from the recipe book

Code: `src/domain/recipes/recipeBook.ts` (pure conversion), `src/db/recipeBookService.ts` (preview and import), `src/features/recipes/RecipeImportPage.tsx` (Recipes → Import).

The [recipe book](https://github.com/geosaurus98/recipe-book) stays the place recipes are written. Its build produces `planner/recipes.json`, which FormLab downloads from `raw.githubusercontent.com` (the address is editable) or reads from an uploaded file.

**Conversion rules**

- Ingredients come from the book's parsed shopping items (standard key, quantity, unit, gram estimate, aisle). Book units are kept, including counts such as jar, scoop and head. Pounds and ounces convert exactly.
- About 50 book keys map to existing FormLab ingredients (`BOOK_KEY_TO_INGREDIENT`), and a few more map to existing foods (`BOOK_KEY_TO_FOOD`).
- Other keys become new ingredients (`book_<key>`) with no nutrition link, so FormLab never guesses their nutrition. They are given a grocery category, exclusion tags (seafood, poultry, red meat, brown/green lentils, fish-derived sauces, dairy, liquid) and a recipe role.
- The book's gram estimates only fill conversions an ingredient lacks: unit weights for count units, density for volume units. Existing values are never overwritten.
- Water, which the book's shopping list leaves out, is recovered from the ingredient text, so pressure-cooker liquid checks work.
- A line with no amount ("Rice, Greek yoghurt, grated cheese, to serve") becomes one optional line carrying the original text.
- Steps keep the book's text, with Markdown removed. Each step's appliance is detected from its wording; "Sauté" counts as pressure cooker only in that chapter. Step timers come from the first duration written in the step, using the lower bound of a range. Nothing is generated.
- Prep and cook times come from the book's `time` text and `minutes` value.
- Servings use the book's portion count: a midpoint for ranges like "3–4", or slices for baking.
- Chapters map to categories: stovetop, pressure, slow and oven are *Main*; the others are Side, Snack, Shake, Dessert, Breakfast, Baking or Bread. Dinner suggestions only consider *Main*.
- The book's per-portion nutrition is stored on the version as `declaredNutrition`, with quality `estimate` and its source.

**Which nutrition is used** (`servingNutrition`)

FormLab's ingredient calculation is used when energy and protein are fully known. Otherwise the declared estimate is used for display, suggestions and diary logging, and the entry is labelled "recipe book estimate". With neither, the incomplete calculation is used and flagged.

Most imported recipes use the book estimate until foods are added for ingredients such as stock and spice blends. The recipe page shows both figures and lists what is missing.

**Re-importing**

`meta['recipeBook:<recipeId>']` stores a fingerprint of the last imported content and the version it created.

| Situation | Result |
| --- | --- |
| New recipe | Created as v1, *experimental* |
| Unchanged | Nothing happens |
| Changed, not edited in FormLab | New main version, with a change summary from `diffVersions` |
| Changed, and edited in FormLab since the last import | New version on the `recipe-book` branch; your version stays current, and you can adopt the book's version in the Lab |
| Deleted in FormLab | Not re-created |

Recipe metadata (name, description, tags) follows the book. Diary entries keep their snapshots throughout.

After an import you can bulk-mark recipes that are still *experimental* as kitchen-tested, if you've cooked them.
