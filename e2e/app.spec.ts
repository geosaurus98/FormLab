import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * End-to-end flow from the specification:
 * recipe → plan → shopping list → cook → log serving → nutrition check → workout → sets → complete →
 * history/progress → reload persistence → export → restore → offline.
 */

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('formlab');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('full meal-to-workout flow with persistence, backup and restore', async ({ page }, testInfo) => {
  await fresh(page);

  // Targets so the diary has something to compare against
  await page.goto('/settings');
  const targets = page.locator('#targets');
  await targets.getByLabel('Energy (kcal)').fill('2200');
  await targets.getByLabel('Protein (g)').fill('150');
  await targets.getByRole('button', { name: 'Save targets' }).click();
  await expect(page.getByText('Targets saved')).toBeVisible();

  // 1. Create a recipe
  await page.goto('/recipes/new');
  await page.getByLabel('Name').first().fill('E2E chicken and rice');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByLabel('Ingredient', { exact: true }).nth(0).selectOption({ label: 'Chicken breast' });
  await page.getByLabel('Quantity').nth(0).fill('500');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByLabel('Ingredient', { exact: true }).nth(1).selectOption({ label: 'White rice (long-grain / basmati)' });
  await page.getByLabel('Quantity').nth(1).fill('300');
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 1').fill('Cook the chicken and rice.');
  await page.getByRole('button', { name: 'Create recipe' }).click();
  await expect(page.getByRole('heading', { name: 'E2E chicken and rice' })).toBeVisible();
  // 500 g × 120 + 300 g × 365 = 1695 kcal / 4 servings = 424 (rounded)
  await expect(page.getByText('424', { exact: true })).toBeVisible();
  const recipeUrl = page.url();

  // 2. Add it to a meal plan
  await page.getByRole('button', { name: 'Plan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(/Added to Week of/)).toBeVisible();

  // 3. Generate a shopping list
  await page.goto('/planner');
  await expect(page.getByText('E2E chicken and rice').first()).toBeVisible();
  await page.getByRole('button', { name: 'Grocery list' }).click();
  await expect(page).toHaveURL(/groceries\?list=/);
  await expect(page.getByText('Chicken breast')).toBeVisible();
  await expect(page.getByText(/500 g → 1 × 500 g tray/)).toBeVisible();
  await page.getByRole('button', { name: 'Tick Chicken breast' }).click();
  await expect(page.getByRole('button', { name: 'Untick Chicken breast' })).toBeVisible();

  // 4–5. Cook it and log one serving
  await page.goto(recipeUrl);
  await page.getByRole('main').getByRole('link', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: /Start cooking/ }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: '5 stars' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved and logged 1 serving/)).toBeVisible();

  // 6. Confirm nutrition in the diary
  await page.goto('/food');
  await expect(page.getByTestId('day-kcal')).toContainText('424');
  await expect(page.getByText('E2E chicken and rice')).toBeVisible();

  // Edit the recipe; the diary entry must not change
  await page.goto(recipeUrl);
  await page.getByRole('link', { name: /Edit \(new version\)/ }).click();
  await page.getByLabel('Quantity').nth(1).fill('400');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved as version 2/)).toBeVisible();
  await page.goto('/food');
  await expect(page.getByTestId('day-kcal')).toContainText('424');

  // Quick add from recent foods
  await page.goto('/food/add?meal=snack');
  await page.getByLabel('Search foods').fill('banana');
  await page.getByRole('button', { name: /^Banana/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Add 118 g/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('day-kcal')).toContainText('529'); // 424 + 105

  // 7. Start a gym workout
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'Start an empty workout' }).click();
  await expect(page).toHaveURL(/workouts\/active/);
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Search exercises').fill('leg press');
  await page.getByRole('dialog').getByRole('button', { name: /^Leg press/ }).first().click();

  // 8. Log several sets
  for (let i = 1; i <= 3; i++) {
    await page.getByLabel(`Set ${i} weight`).fill('100');
    await page.getByLabel(`Set ${i} reps`).fill('10');
    await page.getByRole('button', { name: `Complete set ${i}` }).click();
  }
  await expect(page.getByTestId('rest-remaining')).toBeVisible();
  await page.getByRole('button', { name: 'Pause rest timer' }).click();
  await page.getByRole('button', { name: 'Resume rest timer' }).click();
  await page.getByRole('button', { name: 'Skip rest' }).click();

  // Interrupted session is recoverable after a reload
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark set 3 not done' })).toBeVisible();

  // 9. Complete the workout
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByText('Workout saved. Nice work.')).toBeVisible();
  await expect(page.getByText('3,000 kg')).toBeVisible();

  // 10. History and progress
  await page.goto('/workouts');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Quick workout')).toBeVisible();
  await page.goto('/exercises/ex_leg_press');
  await expect(page.getByText('One session logged — a trend needs at least two.')).toBeVisible();

  // Weight entry
  await page.goto('/progress');
  await page.getByRole('button', { name: 'Record weight' }).click();
  await page.getByLabel('Weight (kg)').fill('82.4');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('82.4 kg')).toBeVisible();

  // 11–12. Reload and confirm persistence
  await page.reload();
  await page.goto('/food');
  await expect(page.getByTestId('day-kcal')).toContainText('529');
  await page.goto('/workouts');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Quick workout')).toBeVisible();

  // 13. Export
  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export full backup/ }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath('backup.json');
  await download.saveAs(path);
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  expect(backup.format).toBe('formlab-backup');
  expect(backup.tables.foodLog).toHaveLength(2);
  expect(backup.tables.workouts).toHaveLength(1);

  // 14. Wipe and restore
  await fresh(page);
  await page.goto('/food');
  await expect(page.getByTestId('day-kcal')).toContainText('0');
  await page.goto('/settings');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path);
  await expect(page.getByText(/Restore "backup.json"\?/)).toBeVisible();
  const safety = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Replace my data' }).click();
  await safety;
  await expect(page.getByText('Backup restored')).toBeVisible();
  await page.goto('/food');
  await expect(page.getByTestId('day-kcal')).toContainText('529');
  await page.goto('/workouts/history/' + backup.tables.workouts[0].id);
  await expect(page.getByText('Leg press')).toBeVisible();
});

test('works offline after first load', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  // wait for the service worker to take control so assets are precached
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText(/Offline — everything still works/)).toBeVisible();

  // Log food offline
  await page.goto('/food/add?meal=breakfast');
  await page.getByLabel('Search foods').fill('oats');
  await page.getByRole('button', { name: /^Rolled oats/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Add 40 g/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /Rolled oats, dry/ })).toBeVisible();

  // View a recipe offline
  await page.goto('/recipes/rec_beef_chilli');
  await expect(page.getByRole('heading', { name: 'Beef chilli' })).toBeVisible();

  // Start and log a workout offline
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'Start an empty workout' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Search exercises').fill('chest press');
  await page.getByRole('dialog').getByRole('button', { name: /^Chest press machine/ }).first().click();
  await page.getByLabel('Set 1 weight').fill('40');
  await page.getByLabel('Set 1 reps').fill('12');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByText('Workout saved. Nice work.')).toBeVisible();
  await context.setOffline(false);
});

test('recipe lab: create an experiment without changing the original', async ({ page }) => {
  await page.goto('/lab/rec_ip_chicken_curry');
  await page.getByRole('button', { name: 'New experiment' }).click();
  await page.getByLabel('Experiment name').fill('extra-ginger');
  await page.getByLabel('Fresh ginger quantity').fill('40');
  await page.getByLabel('Reason for change').fill('More warmth');
  await page.getByRole('button', { name: 'Create experiment' }).click();
  await expect(page.getByText('Experiment "extra-ginger" created')).toBeVisible();
  await expect(page.getByText('Fresh ginger: 20 g → 40 g')).toBeVisible();
  await page.goto('/recipes/rec_ip_chicken_curry');
  await expect(page.getByText('20 g', { exact: true })).toBeVisible();
});

test('training recommendation fits the available time and starts a workout', async ({ page }) => {
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'Add example programmes' }).click();
  await expect(page.getByText('Recommended today')).toBeVisible();
  await page.getByRole('button', { name: '30 min' }).click();
  // The recommended option must fit the time: either a template that already fits, or a trimmed one.
  const estimate = page.getByTestId('rec-estimate');
  await expect(estimate).toBeVisible();
  expect(Number(await estimate.getAttribute('data-minutes'))).toBeLessThanOrEqual(30);
  // Shorter still: 30 min is tight enough that nothing should exceed it
  await page.getByRole('button', { name: 'Any time' }).click();
  expect(Number(await estimate.getAttribute('data-minutes'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: '30 min' }).click();
  await page.getByRole('button', { name: /^Start recommended/ }).click();
  await expect(page).toHaveURL(/workouts\/active/);
  await expect(page.getByRole('button', { name: 'Complete set 1' }).first()).toBeVisible();
  // clean up so later runs start without an active workout
  await page.getByRole('button', { name: 'Workout options' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Discard workout' }).click();
  await expect(page).toHaveURL(/\/workouts$/);
});

test('imports recipes from the recipe book and logs a serving with the book estimate', async ({ page }) => {
  const fixture = readFileSync('src/test/fixtures/recipe-book-sample.json', 'utf8');
  await page.route('https://raw.githubusercontent.com/geosaurus98/recipe-book/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: fixture }));
  await page.goto('/recipes');
  await page.getByRole('link', { name: 'Import' }).click();
  await page.getByRole('button', { name: /Check for recipes/ }).click();
  await expect(page.getByText('New: 5')).toBeVisible();
  await page.getByRole('button', { name: 'Import 5 recipes' }).click();
  await expect(page.getByText(/Done\. Imported recipes are in your library/)).toBeVisible();

  // Re-checking finds nothing new
  await page.getByRole('button', { name: /Check for recipes/ }).click();
  await expect(page.getByText('Unchanged: 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Everything is up to date' })).toBeDisabled();

  await page.goto('/recipes?source=book');
  await expect(page.getByText('PantryGenome · 5 shown')).toBeVisible();
  await page.getByRole('heading', { name: /Chilli Con Carne/ }).click();
  await expect(page.getByText('From your recipe book')).toBeVisible();
  await expect(page.getByText(/Recipe book estimate/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Log serving' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Log 1 serving/ }).click();
  await expect(page.getByText('Logged 1 serving(s)')).toBeVisible();
  await page.goto('/food');
  await expect(page.getByText(/recipe book estimate/)).toBeVisible();
  await expect(page.getByTestId('day-kcal')).toContainText(String(JSON.parse(fixture).find((r: { id: string }) => r.id === 'SlowCooker-Chilli_Con_Carne_Red_Lentils').nutrition.kcal));
});
