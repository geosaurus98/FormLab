# Nutrition engine (FuelTracker)

Code: `src/domain/nutrition/*`, `src/db/foodService.ts`.

## Nutrients and unknowns

Tracked nutrients: energy (kcal), protein, carbohydrate, fat, saturated fat, fibre, sugars and sodium. Each value is `number | null`.

`NutrientTotals` holds `values` (the sum of known contributions) and `missing` (how many items had an unknown value for each nutrient). A nutrient with `missing > 0` is shown with a ⚠ as a **lower-bound estimate**. Energy is stored in kcal; kJ is a display preference (×4.184).

## Diary entries are snapshots

`entryFromFood`, `entryFromRecipe` and `quickEntry` build a `FoodLogEntry` with:

- `nutrients`: what was eaten, frozen at logging time
- `unitNutrients`: nutrients per gram/ml (food) or per serving (recipe), also frozen
- `origin`: food id and amount, or recipe id plus **recipeVersionId and versionNumber** and servings

`rescaleEntry` changes a portion using `unitNutrients`, so editing a portion never picks up later edits to the food or recipe. `copyEntries` (copy yesterday's meal, repeat a recent item, saved meals) copies snapshots verbatim with new ids.

### Recipe → diary

`recipeServingSnapshot()` calculates the version's per-serving nutrition from ingredients (see RECIPE_ENGINE.md). Logging *n* servings stores `perServing × n`. For example, a 4-serving recipe totalling 2,000 kcal and 128 g protein logs 500 kcal and 32 g protein for 1 serving, and 750 kcal and 48 g for 1.5 servings. Incomplete recipe nutrition carries through as `incomplete: true`.

## Totals and analytics

- `dailyTotals`, `totalsByMeal`: sums with missing counts
- `frequentItems` / `recentItems`: frequency then recency, keyed by food id, recipe id or quick-add name
- Insights use only days with entries, or only days marked **fully logged** once at least 3 are marked, and always show *n of N days*.

## Targets

`NutritionTarget` has an `effectiveFrom` date and is never overwritten. `targetOn(targets, date)` returns the target in force on that day, so past adherence isn't rewritten when targets change. Fields: energy (with optional min/max range), protein, carbs, fat, fibre, saturated-fat maximum and sodium maximum.

## Energy-requirement estimation

`estimateEnergy()`:

1. Resting energy uses **Mifflin–St Jeor (1990)**: `10·kg + 6.25·cm − 5·age + (5 | −161)`.
2. Maintenance = resting × activity factor (1.2 / 1.375 / 1.55 / 1.725). **Activity is included here.**
3. An optional deficit is **capped at 25 %** and the result is never below the resting estimate. Warnings are returned when either cap applies.

Nothing is pre-filled: sex, birth year, height and weight are entered by the user, with weight taken from the latest weigh-in. The UI calls it an estimate (typically ±10–20 % for individuals), not a prescription.

## Exercise energy and double-counting

`energyAllowance(target, exerciseKcal, addExercise)` adds estimated exercise energy **only if** the user opted in **and** the target's basis is `manual`. Estimator targets already include activity through the activity factor, so nothing is added to them. Cardio estimates are *net* METs (MET − 1), so resting energy isn't counted twice either.

## Food database

- Starter foods are approximate generic reference values (USDA FDC SR Legacy based, rounded), with quality `reference` and the source shown. Stock is deliberately unknown.
- User and label foods can be entered per 100 g/ml or per serving (converted to per 100). An Atwater check (4/4/9) warns when energy and macros disagree by more than 20 %, which catches kJ entered as kcal.
- CSV import keeps blank values as unknown.
- A barcode scanner isn't required. `FoodDataProvider` is the interface for future databases.
