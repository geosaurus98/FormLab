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
