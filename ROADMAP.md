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

## Next steps (suggested priority)

1. **Verify starter food values** against NZ FOODfiles / product labels and add common NZ branded items (bread, yoghurt, milk). Add a FOODfiles CSV mapping to the importer.
2. **Workout recommendations panel:** combine the next scheduled template, days since each muscle group was trained (against user-set recovery preferences), available time (trim accessories) and equipment. The building blocks already exist (`nextTemplateInProgramme`, `muscleSetDistribution`, `findAlternatives`).
3. **Barcode scanning** through a `FoodDataProvider` (e.g. Open Food Facts) with cached results and provenance, kept optional.
4. **Health Connect import** through an `ActivitySourceAdapter`, needing a thin Android wrapper (e.g. a Trusted Web Activity or Capacitor) because browsers can't access Health Connect. Use `isLikelyDuplicate` and `ImportRecord`.
5. **Plate calculator** and per-dumbbell available weights for more accurate increments.
6. **Recipe nutrition per version in Insights** (meal-prep vs adherence by recipe) and preference learning from ratings (e.g. cuisine weights in recommendations).
7. **Optional sync** through `SyncAdapter` (WebDAV or a user's own cloud folder), keeping local-first.
8. **Push reminders** only if a free, self-hostable option is acceptable; until then reminders stay local and best effort.
9. **Code-split** feature routes to reduce the initial bundle (currently about 340 kB gzipped total).

## Known limitations

- Starter nutrition values and prices are approximate placeholders (labelled in the app).
- Rest-timer and reminder notifications aren't guaranteed once the OS freezes a backgrounded web app.
- Data lives in one browser profile; use backups to move between devices.
