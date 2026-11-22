# Testing

```bash
npm test
```

```bash
npm run e2e
```

`npm test` runs Vitest (jsdom plus `fake-indexeddb`). `npm run e2e` runs Playwright on a production build, emulating a Pixel 7.

## Unit tests: pure domain logic

| File | Covers |
| --- | --- |
| `src/domain/recipes/recipes.test.ts` | Unit conversion; recipe nutrition (the 2,000 kcal / 128 g → 500 / 32 per serving example); missing data shown as incomplete; optional ingredients; recalculation after ingredient change; seed recipe sanity; scaling and rounding; shopping aggregation; no merging without a conversion; pantry subtraction and staples; package rounding and cost; versioning, diff and lineage; pressure-cooker liquid; kidney-bean block; substitution validation and exclusions; method transformations rejected and never given times; Lab suggestion |
| `src/domain/nutrition/nutrition.test.ts` | Add food; log recipe servings (1 and 1.5); edit portion from the snapshot; historical nutrition preserved after recipe change; daily and per-meal totals; missing values; copy/repeat; quick add; frequent items; Mifflin–St Jeor; deficit caps; no double-counting exercise energy; effective-dated targets |
| `src/domain/workouts/workouts.test.ts` | Start from a template; log and toggle sets; prepopulate and progress from the previous session; no cross-gym machine comparison; replace exercise; edit a completed workout (revision, recomputed records); double/fixed/reps/time/manual progression; RPE ceiling; decline guard; e1RM limits; record detection (first session excluded, other gym excluded); session summary; timestamp timer (pause/resume/extend); programme rotation and weekdays; alternatives and equipment; cardio estimate and duplicates |
| `src/domain/body/body.test.ts` | Multiple weigh-ins per day; 7-day rolling average with missing dates and minimum points; trend thresholds; change over a range; goal progress; kg/lb; insights aggregation, correlation thresholds and group-comparison sample sizes |

| `src/domain/workouts/recommend.test.ts` | Next programme workout chosen; recovery-window warnings and preferring the other split; rest/cardio when everything conflicts; per-muscle overrides; equipment swaps; time trimming (sets first, then accessories, first exercise kept); duration estimate; last-trained hours |
| `src/db/migration.test.ts` | Opens a real v1 database with current code (data kept, new preference fields added); v1 backup migration and validation; newer-schema backups rejected |

Insights helpers (macro distribution, recipe usage) are covered in `body.test.ts`.

## Integration tests: database services

`src/db/integration.test.ts` uses a fresh fake IndexedDB per test:

- Seed has reference data and **no personal history**, and is idempotent.
- Full flow: create recipe → plan → grocery list (package count) → cook session → log a serving (nutrition checked) → edit the recipe (diary unchanged, new version logged at a different value) → start a workout → log sets → recover from interruption (active session persisted) → complete → progress and records → edit completed → export → wipe → restore → verify.
- Diary operations: add, edit portion, copy yesterday, saved meals, delete.
- Recipe Lab: branch, promote (original kept); delete refused when history exists; duplicate.
- Starting a workout from a recommendation plan applies drops, trims and equipment swaps.
- Recommendation candidates; cardio duplicate detection; invalid backups rejected; CSV food import keeps unknowns.

## End-to-end tests (Playwright)

`e2e/app.spec.ts`:

1. **Full flow in the real UI:** set targets → create recipe → add to plan → generate grocery list and tick an item → cook mode, finish with rating and log a serving → diary shows 424 kcal → edit the recipe (diary still 424) → add a banana via search → start a workout, add leg press, log 3 sets, use the rest timer → **reload mid-workout and confirm the sets survive** → finish (3,000 kg volume) → history and exercise page → record weight → reload and confirm persistence → **export backup** (file contents checked) → wipe the database → **restore** → data back.
2. **Offline:** after the service worker takes control, go offline, reload, then log food, view a recipe, and start, log and finish a workout.
3. **Recipe Lab:** create an experiment and confirm the original recipe is unchanged.
4. **Training recommendation:** add the example programmes, choose 30 minutes, check the recommended estimate fits, and start it as a workout.

The suite is set up to run without traces (`--trace off`). To debug one failure, rerun it with `--trace on`.

## Manual checks worth doing on a real phone

- Install to the home screen and use it in airplane mode.
- Background the app during a rest timer and check the alert (best effort; varies by device).
- Grant notification permission and test a reminder at a near time.
- **Settings → Persistent storage** should show *granted*.
