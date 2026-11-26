# Data model

The schemas are Zod definitions in `src/domain/**`. TypeScript types are inferred from them, and backups are validated against them. Storage is Dexie (`src/db/db.ts`), with one table per entity listed below.

## Conventions

- IDs are prefixed random strings (`rec_…`, `log_…`, `ws_…`). Seed IDs are stable (`food_oats`, `ex_leg_press`).
- Dates are local calendar keys (`YYYY-MM-DD`); timestamps are ISO strings.
- Mass is stored in **grams** (ingredients) and **kg** (body and lifting); volume in ml. Display units are a preference.
- Nutrient values are `number | null`, where `null` means unknown.
- Provenance: `DataQuality` = measured · label · reference · calculated · estimate · user · unknown, plus a `DataSource` {kind, name, reference, note}.

## Food domain

| Table | Entity | Notes |
| --- | --- | --- |
| `foods` | **Food** | `per100` nutrients (g or ml basis), servings, source, quality, `updatedAt`, favourite/archived. The **NutritionProfile** is the `per100` block. |
| `ingredients` | **Ingredient** | Cooking and shopping entity: `foodId` (nutrition link, nullable), grocery category, density, unit weights (each/can/clove…), tags (seafood, poultry, liquid, no-shop…), package size and price |
| `recipes` | **Recipe** | Mutable metadata (name, cuisine, tags, favourite, archived) plus `currentVersionId` |
| `recipeVersions` | **RecipeVersion** | **Immutable** cookable content: servings, times, `RecipeIngredient[]` (ingredientId, quantity, unit, role, optional), appliances, steps (appliance, timer, safety note), validation, `branch`, `parentVersionId`, change summary and reason |
| `mealPlans` | **MealPlan** | `dated` (weekStart) or `collection`; entries reference recipe **and version**, servings, `leftoverOfEntryId`, cooked |
| `foodLog` | **FoodLogEntry** | Date, meal, name, origin (food/recipe/quick, including `recipeVersionId`), **snapshot** `nutrients` and `unitNutrients`, `incomplete`, quality |
| `savedMeals` | SavedMeal | Snapshot items for one-tap logging |
| `dayStatus` | DayStatus | User marked a day as fully logged (completeness indicator) |
| `groceryLists` | **GroceryList** | Generated snapshot of items (quantity, packages, cost, sources, checked) plus manual items |
| `pantry` | **PantryItem** | Ingredient, quantity and unit, `staple` flag |
| `cookingSessions` | **CookingSession** | Recipe, version, servings made, actual minutes |
| `recipeFeedback` | **RecipeFeedback** | Rating, structured issues (too-mild, too-watery…), notes, repeat |
| `applianceProfiles` | ApplianceProfile | Capacity, max fill, minimum liquid, source, validation |
| `substitutionRules` | SubstitutionRule | from→to, ratio, status, notes |
| `methodTransformations` | MethodTransformation | Appliance A→B, status, guidance, source (never times) |

## Fitness domain

| Table | Entity | Notes |
| --- | --- | --- |
| `exercises` | **Exercise** | Muscles, `equipmentIds`, movement pattern, type, **tracking** (weight_reps, bodyweight_reps, assisted_bodyweight, reps, duration, distance_duration), **loadType** (free-weight, machine, cable, bodyweight, none), alternatives, increment |
| `equipment` | **Equipment** | Available flag, increment kg |
| `gyms` | Gym | Used to separate machine comparisons |
| `programmes` | **WorkoutProgramme** | Template ids; schedule = rotation or weekdays |
| `templates` | **WorkoutTemplate** | `TemplateExercise[]` with sets, rep range, target kg, rest, warm-ups, RPE/RIR, **ProgressionRule** |
| `workouts` | **WorkoutSession** | Status active/completed/discarded, gym, embedded **ExerciseSession[]** (snapshot of name, tracking, load type, target) with **ExerciseSet[]** (type, weight, reps, added/assistance kg, duration, distance, RPE, RIR, completed, timestamp), `restTimer`, `revision`, `editedAt` |
| `cardio` | **CardioActivity** | Type, date, duration, distance, elevation, HR, energy estimate (labelled), source {manual/import, externalId} |
| (derived) | **PersonalRecord** | Computed from history by `computeRecords`, keyed by comparison key |

## Personal metrics domain

| Table | Entity | Notes |
| --- | --- | --- |
| `body` | **BodyMeasurement** | Date and time, weightKg, waistCm, other measurements, notes, quality |
| `targets` | **NutritionTarget** | `effectiveFrom`; history preserved (adherence uses the target in force that day); basis manual or estimator |
| `preferences` | **UserPreferences** | Units, servings, exclusions, appliances, budgets, goals (**FitnessGoal**), recovery preferences, reminders, energy profile |
| `importRecords` | **ImportRecord** | Restores, CSV imports and recipe-book imports, with counts |
| `meta` | key/value | seedVersion, lastBackupAt, reminder state, recipe-book URL and per-recipe import state |

**DataSource** is embedded on foods, recipes and imports rather than kept as a separate table.

## Relationships

```
Food 1─* Ingredient (foodId)          Recipe 1─* RecipeVersion (recipeId, parentVersionId → tree, branch)
RecipeVersion *─* Ingredient (via RecipeIngredient)
MealPlanEntry → Recipe + RecipeVersion       FoodLogEntry → (Food | RecipeVersion) as origin + own snapshot
CookingSession/RecipeFeedback → RecipeVersion
WorkoutProgramme *─* WorkoutTemplate         TemplateExercise → Exercise
WorkoutSession → Template (optional) + Gym;  ExerciseSession → Exercise (snapshot fields)
Exercise *─* Equipment
```

## History independence

- Editing recipe content creates a new `RecipeVersion`; diary entries keep their snapshots and version numbers.
- Editing a food changes future calculations only.
- Editing a template doesn't touch `WorkoutSession`s. Editing a completed session bumps `revision`, and records are recomputed.
- Deleting a recipe that has diary entries or plan entries is refused; archiving is offered instead.

## Migrations

- **v2** (training recommendations): adds `recoveryDefaultHours` (48) and `recoveryOverrides` ({}) to preferences. It is a data-only upgrade with no index changes. The same `upgradePreferencesV2()` is used by the Dexie upgrade and by `migrateBackup`, so v1 backups restore correctly. `src/db/migration.test.ts` creates a real v1 database and opens it with the current code.
- **Optional fields without a migration:** `RecipeVersion.declaredNutrition` (an outside estimate with source and quality) was added as an optional field. Older records and backups simply lack it, so no Dexie version bump was needed. Count units and the `bread-maker` appliance only widened enums.
- `SCHEMA_VERSION` and `this.version(n)` blocks live in `src/db/db.ts`. For any schema change, add `this.version(n+1).stores({...}).upgrade(tx => …)`. Never edit an existing version block.
- Backups carry `schemaVersion`. `migrateBackup()` in `src/db/backup.ts` must gain a step for every bump, and backups from a newer version are rejected.
- Seed data is versioned with `meta.seedVersion`. Seeding only inserts reference data and never overwrites user history.
