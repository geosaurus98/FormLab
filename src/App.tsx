import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, useRouteError, Link } from 'react-router-dom';
import { Layout, MorePage } from './app/Layout';
import { ToastProvider, useToast } from './components/toast';
import { ensureSeeded } from './db/seed';
import { startReminderLoop } from './app/reminders';
import { HomePage } from './features/home/HomePage';
import { FoodDiaryPage } from './features/food/FoodDiaryPage';
import { AddFoodPage } from './features/food/AddFoodPage';
import { FoodEditorPage, FoodsPage } from './features/food/FoodsPage';
import { RecipesPage } from './features/recipes/RecipesPage';
import { RecipeDetailPage } from './features/recipes/RecipeDetailPage';
import { RecipeEditorPage } from './features/recipes/RecipeEditorPage';
import { CookingModePage } from './features/recipes/CookingModePage';
import { PlannerPage } from './features/planner/PlannerPage';
import { GroceriesPage } from './features/groceries/GroceriesPage';
import { LabIndexPage, LabRecipePage } from './features/lab/LabPage';
import { WorkoutsPage } from './features/workouts/WorkoutsPage';
import { ActiveWorkoutPage } from './features/workouts/ActiveWorkoutPage';
import { WorkoutDetailPage } from './features/workouts/WorkoutDetailPage';
import { ProgrammeEditorPage, TemplateEditorPage } from './features/workouts/TemplateEditorPage';
import { CardioPage } from './features/workouts/CardioPage';
import { ExerciseDetailPage, ExerciseEditorPage, ExercisesPage } from './features/exercises/ExercisesPage';
import { ProgressPage } from './features/progress/ProgressPage';
import { InsightsPage } from './features/insights/InsightsPage';
import { SettingsPage } from './features/settings/SettingsPage';

function RouteError() {
  const error = useRouteError() as Error | undefined;
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">{error?.message ?? 'Page not found.'} Your data is stored safely on this device.</p>
      <Link to="/" className="mt-4 inline-block text-brand-700 underline">
        Go home
      </Link>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/food', element: <FoodDiaryPage /> },
      { path: '/food/add', element: <AddFoodPage /> },
      { path: '/foods', element: <FoodsPage /> },
      { path: '/foods/:id', element: <FoodEditorPage /> },
      { path: '/recipes', element: <RecipesPage /> },
      { path: '/recipes/new', element: <RecipeEditorPage /> },
      { path: '/recipes/:id', element: <RecipeDetailPage /> },
      { path: '/recipes/:id/edit', element: <RecipeEditorPage /> },
      { path: '/recipes/:id/cook', element: <CookingModePage /> },
      { path: '/planner', element: <PlannerPage /> },
      { path: '/groceries', element: <GroceriesPage /> },
      { path: '/lab', element: <LabIndexPage /> },
      { path: '/lab/:id', element: <LabRecipePage /> },
      { path: '/workouts', element: <WorkoutsPage /> },
      { path: '/workouts/active', element: <ActiveWorkoutPage /> },
      { path: '/workouts/history/:id', element: <WorkoutDetailPage /> },
      { path: '/workouts/templates/:id', element: <TemplateEditorPage /> },
      { path: '/workouts/programmes/:id', element: <ProgrammeEditorPage /> },
      { path: '/workouts/cardio/:id', element: <CardioPage /> },
      { path: '/exercises', element: <ExercisesPage /> },
      { path: '/exercises/new', element: <ExerciseEditorPage /> },
      { path: '/exercises/:id', element: <ExerciseDetailPage /> },
      { path: '/exercises/:id/edit', element: <ExerciseEditorPage /> },
      { path: '/progress', element: <ProgressPage /> },
      { path: '/insights', element: <InsightsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/more', element: <MorePage /> },
      { path: '*', element: <RouteError /> }
    ]
  }
]);

function Reminders() {
  const toast = useToast();
  useEffect(() => startReminderLoop((title, body) => toast(`${title} — ${body}`)), [toast]);
  return null;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureSeeded()
      .then(() => setReady(true))
      .catch((e: Error) => setError(e.message));
    void navigator.storage?.persist?.();
  }, []);
  if (error)
    return (
      <div className="p-8 text-center">
        <h1 className="font-bold">Could not open the local database</h1>
        <p className="mt-2 text-sm text-slate-500">{error}. Private browsing modes may block storage.</p>
      </div>
    );
  if (!ready) return <div className="p-8 text-center text-slate-500">Loading FormLab…</div>;
  return (
    <ToastProvider>
      <Reminders />
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
