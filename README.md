# FormLab

FormLab is a private, offline-first personal app for **meal planning, food logging and gym training**. It has three connected modules that share one local database:

| Module | What it does |
| --- | --- |
| **FuelTracker** | Food diary, calories and macros, targets, food database, quick add, saved meals |
| **PantryGenome** | Structured recipes, scaling, cooking mode, meal planner, grocery lists, pantry, Recipe Lab |
| **WorkoutLab** | Programmes and templates, active-workout logging, rest timer, progressive overload, records, cardio, exercise library |

These are tied together by Home, Progress (body weight, strength, activity), Insights (analysis across all three modules) and Settings.

There are no accounts, servers or subscriptions. Your data stays in your browser's IndexedDB on your device until you export it.

## Quick start

Requirements: Node 20+ (developed on Node 22).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. For a production build with the offline service worker:

```bash
npm run build
```

```bash
npm run preview
```

### Use it on your phone (GitHub Pages)

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `main` runs the tests, builds the app for the `/FormLab/` sub-path, and publishes it to **https://geosaurus98.github.io/FormLab/**.

One-time setup: on GitHub, open the repository's **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Then re-run the "Deploy to GitHub Pages" workflow from the **Actions** tab, or push to `main`.

To install it:

1. Open the address in Chrome on your Android phone.
2. Choose **Install app** (or **Add to Home screen**).
3. Open it once while online. After that it works fully offline.

GitHub Pages only hosts the app's files; your data still lives only on your phone. Pages has no single-page-app rewrites, so the workflow copies `index.html` to `404.html`. A deep link opened before the app is cached may log a harmless 404 in the console while the app loads normally.

To host it elsewhere, build with `BASE_PATH=/your/sub/path/ npm run build` (the default is `/`) and serve `dist/` over HTTPS with an `index.html` fallback.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then build to `dist/`, including the PWA service worker |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit and integration tests (Vitest with fake IndexedDB) |
| `npm run e2e` | Playwright end-to-end tests (builds and serves automatically) |

## Data storage, backup and privacy

- **Where:** IndexedDB database `formlab` in the browser profile on this device. Nothing is sent anywhere.
- **Durability:** the app asks the browser for *persistent storage*. Its status is shown in **Settings → Data**. Clearing site data, uninstalling the browser or factory-resetting the phone deletes the data.
- **Backup:** **Settings → Export full backup** downloads a JSON file containing every table. Home shows a reminder once you have data and haven't backed up for 14 days.
- **Restore:** **Settings → Restore from backup** checks the file first and shows a summary before anything changes. Restoring replaces all data in a single transaction, so it either completes fully or changes nothing. A safety copy of your current data is downloaded before the restore.
- **CSV:** the food diary and workout sets export as CSV for spreadsheets.
- **Food import:** **Food database → Import CSV** with the columns `name, brand, kcal, protein, carbs, fat, satfat, fibre, sugars, sodium` (per 100 g). Blank cells are stored as *unknown*, not zero.

## Data honesty

- Starter foods are **approximate generic reference values** (based on USDA FoodData Central SR Legacy) and are labelled *Reference database*. Check them against the labels of the NZ products you buy. Foods that vary too much, such as stock, are deliberately left unknown.
- Unknown nutrient values are never treated as zero. Totals that include unknowns are marked as incomplete (⚠).
- The six starter recipes are marked **Experimental / untested**. Their cooking times are typical published ranges and are labelled that way. Only you can mark a version *kitchen-tested*.
- Starter ingredient prices are **indicative placeholders**. Update them under **Groceries → Prices & packs**.
- Energy estimates (Mifflin–St Jeor, cardio MET values) are labelled estimates. Estimated exercise energy is never added to your allowance unless you opt in, and never on top of an estimator-based target, which already includes activity.
- There is no fake history: no workouts, weights, records or diary entries are seeded.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): structure, layers and key decisions
- [DATA_MODEL.md](DATA_MODEL.md): entities, relationships and migrations
- [NUTRITION_ENGINE.md](NUTRITION_ENGINE.md): diary snapshots, totals, targets and estimation
- [RECIPE_ENGINE.md](RECIPE_ENGINE.md): recipe nutrition, versions, shopping lists, safety and Lab
- [WORKOUT_ENGINE.md](WORKOUT_ENGINE.md): sessions, progression, records and the rest timer
- [TESTING.md](TESTING.md): test strategy and how to run the tests
- [ROADMAP.md](ROADMAP.md): what's done and what's next
