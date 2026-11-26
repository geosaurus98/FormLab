# Roadmap

## Delivered

**Phase 1: foundation and core tracking** ✅
Project setup, navigation and design system, IndexedDB with migrations, settings, food database, food diary, calorie and macro tracking with targets, exercise library (54 exercises), active workout logging, workout history, Home dashboard.

**Phase 2: meal planning and cooking** ✅
Recipe library with structured ingredients, scaling, nutrition integration with the diary (version snapshots), dated and collection meal plans with leftovers, grocery lists (aggregation, pantry, pack rounding, cost, export), cooking mode with timers and safety checks, pantry.

**Phase 3: advanced fitness** ✅
Programmes (rotation and weekday schedules), templates, progressive overload rules, personal records and e1RM estimates, timestamp rest timer, cardio logging, weight tracking with rolling averages and trends, fitness charts.

**Phase 4: recipe experimentation** ✅
Recipe Lab branches, immutable versions, validated substitutions, appliance profiles and method-transformation rules, cooking feedback, version comparison, adopting an experiment as main.

**Phase 5: personalisation and insights (first pass)** ✅
Cross-domain insights with sample sizes, explainable meal recommendations, a feedback-based recipe suggestion, local reminders, JSON backup/restore and CSV export, food CSV import.

**Phase 5b: training recommendations and nutrition analytics** ✅
Explainable "Recommended today" (programme schedule, per-muscle recovery preference, equipment swaps, time-based trimming, weekly target), started directly as a workout. Insights gained energy and protein vs target by day, macronutrient distribution, and a recipe nutrition comparison. Schema v2 migration. Lazy-loaded routes (main app chunk ~80 kB gzipped).

**Recipe book import** ✅
Recipes → Import pulls `planner/recipes.json` from geosaurus98/recipe-book: preview, chapter selection, versioned re-imports that respect local edits, and the book's estimates used as labelled fallback nutrition.

## Next steps (suggested priority)

1. **Add foods for common recipe-book ingredients** (stock, frozen mixed veg, spice blends, beef/pork cuts) so more imported recipes are calculated from food data instead of the book's estimate. Optionally publish `recipes.json` on the recipe book's GitHub Pages site.
2. **Verify starter food values** against NZ FOODfiles / product labels and add common NZ branded items (bread, yoghurt, milk). Add a FOODfiles CSV mapping to the importer.
3. **Learn timing from history:** replace the fixed 45 s/set timing assumption with your actual median set and session durations once enough workouts are logged.
4. **Barcode scanning** through a `FoodDataProvider` (e.g. Open Food Facts) with cached results and provenance, kept optional.
5. **Health Connect import** through an `ActivitySourceAdapter`, needing a thin Android wrapper (e.g. a Trusted Web Activity or Capacitor) because browsers can't access Health Connect. Use `isLikelyDuplicate` and `ImportRecord`.
6. **Plate calculator** and per-dumbbell available weights for more accurate increments.
7. **Recipe nutrition per version in Insights** (meal-prep vs adherence by recipe) and preference learning from ratings (e.g. cuisine weights in recommendations).
8. **Optional sync** through `SyncAdapter` (WebDAV or a user's own cloud folder), keeping local-first.
9. **Push reminders** only if a free, self-hostable option is acceptable; until then reminders stay local and best effort.
10. **Lazy-load charts on Home** (Recharts is still loaded up front because Home shows a weight chart).

## Known limitations

- Starter nutrition values and prices are approximate placeholders (labelled in the app).
- Rest-timer and reminder notifications aren't guaranteed once the OS freezes a backgrounded web app.
- Data lives in one browser profile; use backups to move between devices.
