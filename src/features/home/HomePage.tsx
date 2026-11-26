import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChefHat, Dumbbell, Play, Plus, Scale, ShoppingCart, Utensils, Footprints, HardDriveDownload, X } from 'lucide-react';
import { db } from '../../db/db';
import { Button, Card, CardTitle, EmptyState, Notice, Stat } from '../../components/ui';
import { MacroLine, TargetRow, useEnergy, IncompleteMark } from '../../components/nutrition';
import { TrendLine, SERIES, shortDate } from '../../components/charts';
import { usePrefs, useTargetOn, useToday, updatePrefs } from '../../hooks/data';
import { dailyTotals, mealLabel, DEFAULT_MEALS } from '../../domain/nutrition/diary';
import { energyAllowance } from '../../domain/nutrition/targets';
import { nextTemplateInProgramme } from '../../domain/workouts/session';
import { sessionVolume } from '../../domain/workouts/records';
import { dailyWeights, rollingAverage, weightTrend } from '../../domain/body/body';
import { suggestForRemaining, type RecipeCandidate } from '../../domain/planner/recommend';
import { MEAL_CATEGORIES, SNACK_CATEGORIES, recipeCandidates } from '../../db/plannerService';
import { startWorkout } from '../../db/workoutService';
import { logRecipe } from '../../db/foodService';
import { addDays, formatDateKey, formatDuration, isoToDateKey, relativeDayLabel, startOfWeek, daysBetween } from '../../lib/dates';
import { WeightEntrySheet, useMassUnit } from '../progress/ProgressPage';
import { useToast } from '../../components/toast';
import { RecommendationCard } from '../workouts/RecommendationCard';

export function HomePage() {
  const today = useToday();
  const prefs = usePrefs();
  const target = useTargetOn(today);
  const entries = useLiveQuery(() => db.foodLog.where('date').equals(today).toArray(), [today]);
  const cardioToday = useLiveQuery(() => db.cardio.where('date').equals(today).toArray(), [today]);
  const workouts = useLiveQuery(() => db.workouts.where('status').anyOf('completed', 'active').toArray(), []);
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const cardio = useLiveQuery(() => db.cardio.where('date').aboveOrEqual(addDays(today, -13)).toArray(), [today]);
  const body = useLiveQuery(() => db.body.toArray(), []);
  const plans = useLiveQuery(() => db.mealPlans.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const lists = useLiveQuery(() => db.groceryLists.orderBy('createdAt').reverse().limit(1).toArray(), []);
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackupAt'), []);
  const counts = useLiveQuery(async () => (await db.foodLog.count()) + (await db.workouts.count()) + (await db.body.count()), []);
  const [weightOpen, setWeightOpen] = useState(false);
  const [candidates, setCandidates] = useState<RecipeCandidate[]>([]);
  const navigate = useNavigate();
  const toast = useToast();
  const { fmt, unit } = useEnergy();
  const mass = useMassUnit();
  useEffect(() => void recipeCandidates({ categories: [...MEAL_CATEGORIES, ...SNACK_CATEGORIES] }).then(setCandidates), [recipes]);

  const totals = useMemo(() => dailyTotals(entries ?? []), [entries]);
  const exKcal = (cardioToday ?? []).reduce((s, c) => s + (c.energyEstimate?.kcal ?? 0), 0);
  const allowance = energyAllowance(target ?? null, exKcal, prefs?.addExerciseEnergy ?? false).allowance;
  const completed = (workouts ?? []).filter((w) => w.status === 'completed').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = (workouts ?? []).find((w) => w.status === 'active');
  const last = completed[0];
  const weekStart = startOfWeek(today, prefs?.weekStartsOn ?? 1);
  const weekSessions = completed.filter((w) => isoToDateKey(w.startedAt) >= weekStart).length;
  const weekCardio = (cardio ?? []).filter((c) => c.date >= weekStart);
  const consistency = prefs?.goals.find((g) => g.id === 'consistency' && g.enabled);
  const activeProg = (programmes ?? []).find((p) => p.active);
  const next = activeProg ? nextTemplateInProgramme(activeProg, completed) : null;
  const nextTpl = next ? templates?.find((t) => t.id === next.templateId) : null;
  const daily = useMemo(() => dailyWeights(body ?? []), [body]);
  const recentWeights = rollingAverage(daily, 7, 3, { start: addDays(today, -29), end: today }).filter((p) => p.weightKg != null || p.avgKg != null);
  const trend = weightTrend(daily.filter((d) => d.date >= addDays(today, -41)));
  const upcoming = (plans ?? [])
    .flatMap((p) => p.entries.filter((e) => e.date && e.date >= today && e.date <= addDays(today, 2) && !e.cooked).map((e) => ({ ...e, planId: p.id })))
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const nextMeal = upcoming[0];
  const recipeName = (id: string) => recipes?.find((r) => r.id === id)?.name ?? 'Recipe';
  const remainingKcal = allowance != null ? allowance - totals.values.energyKcal : null;
  const remainingProtein = target?.proteinG != null ? target.proteinG - totals.values.proteinG : null;
  const ideas = remainingKcal != null && remainingKcal > 250 && candidates.length ? suggestForRemaining(candidates, remainingKcal, remainingProtein) : [];
  const listLeft = lists?.[0]?.items.filter((i) => !i.checked).length ?? 0;
  const needsBackup = (counts ?? 0) > 20 && (!lastBackup || daysBetween(isoToDateKey(lastBackup.value as string), today) > 14);
  const incomplete = (entries ?? []).some((e) => e.incomplete);

  const quickStart = async () => {
    if (active) return navigate('/workouts/active');
    await startWorkout({ templateId: next?.templateId ?? null, programmeId: activeProg?.id ?? null });
    navigate('/workouts/active');
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-slate-500">{formatDateKey(today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="text-2xl font-bold">Today</h1>
      </div>

      {prefs && !prefs.onboarded && (
        <Card className="border-brand-300 bg-brand-50/50 dark:bg-brand-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">Welcome to FormLab</div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">A private, offline tracker for meals, food and training. Three quick steps make it useful:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                <li><Link to="/settings#targets" className="text-brand-700 underline">Set calorie and protein targets</Link> (optional estimator included)</li>
                <li><Link to="/settings" className="text-brand-700 underline">Tick the gym equipment you can use</Link></li>
                <li><Link to="/workouts" className="text-brand-700 underline">Create a workout template</Link> or add the optional examples</li>
              </ol>
            </div>
            <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => void updatePrefs({ onboarded: true })}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {needsBackup && (
        <Notice tone="warn">
          <HardDriveDownload className="mr-1 inline h-4 w-4" />
          {lastBackup ? 'Your last backup was over two weeks ago.' : "You haven't exported a backup yet."} <Link to="/settings" className="font-medium underline">Back up now</Link> — data only lives on this device.
        </Notice>
      )}

      <RecommendationCard compact />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Link to="/food" className="text-xs text-brand-700">Diary</Link>}>Food today</CardTitle>
          <div className="mb-3 flex items-end justify-between">
            <div className="flex items-center gap-1 text-3xl font-bold tabular-nums">
              {fmt(totals.values.energyKcal)}
              <span className="text-base font-medium text-slate-500">{allowance != null ? ` / ${fmt(allowance)}` : ''} {unit}</span>
              <IncompleteMark show={incomplete} />
            </div>
            {allowance == null && (
              <Link to="/settings#targets" className="text-sm text-brand-700 underline">
                Set targets
              </Link>
            )}
          </div>
          <div className="space-y-2">
            <TargetRow label="Protein" value={totals.values.proteinG} target={target?.proteinG ?? null} unit="g" tone="lift" />
            <div className="grid grid-cols-2 gap-2">
              <TargetRow label="Carbs" value={totals.values.carbsG} target={target?.carbsG ?? null} unit="g" tone="fuel" />
              <TargetRow label="Fat" value={totals.values.fatG} target={target?.fatG ?? null} unit="g" tone="pantry" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {DEFAULT_MEALS.map((m) => {
              const list = (entries ?? []).filter((e) => e.meal === m);
              return (
                <span key={m}>
                  {mealLabel(m)}: {list.length ? `${fmt(list.reduce((s, e) => s + (e.nutrients.energyKcal ?? 0), 0))} ${unit}` : '—'}
                </span>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to={`/food/add?date=${today}`}>
              <Button className="w-full">
                <Plus className="h-4 w-4" /> Add food
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setWeightOpen(true)}>
              <Scale className="h-4 w-4" /> Add weight
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle action={<Link to="/workouts" className="text-xs text-brand-700">Workouts</Link>}>Training</CardTitle>
          {active ? (
            <div className="mb-3">
              <div className="text-sm text-slate-500">In progress</div>
              <div className="text-lg font-semibold">{active.name}</div>
            </div>
          ) : nextTpl ? (
            <div className="mb-3">
              <div className="text-sm text-slate-500">
                Next · {next!.when} · {activeProg!.name}
              </div>
              <div className="text-lg font-semibold">{nextTpl.name}</div>
            </div>
          ) : (
            <p className="mb-3 text-sm text-slate-500">No workout scheduled. Activate a programme to plan sessions.</p>
          )}
          <Button size="lg" className="w-full bg-lift-600 hover:bg-lift-500" onClick={() => void quickStart()}>
            {active ? <Dumbbell className="h-5 w-5" /> : <Play className="h-5 w-5" />} {active ? 'Resume workout' : nextTpl ? `Start ${nextTpl.name}` : 'Quick start workout'}
          </Button>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="This week" value={`${weekSessions}${consistency?.target ? `/${consistency.target}` : ''}`} sub="gym sessions" />
            <Stat label="Cardio" value={`${Math.round(weekCardio.reduce((s, c) => s + c.durationMin, 0))} min`} sub={`${weekCardio.length} activities`} />
            <Stat label="Last workout" value={last ? relativeDayLabel(isoToDateKey(last.startedAt), today) : '—'} sub={last ? `${last.name}${last.endedAt ? ` · ${formatDuration(new Date(last.endedAt).getTime() - new Date(last.startedAt).getTime())}` : ''}` : 'none yet'} />
          </div>
          {last && (
            <Link to={`/workouts/history/${last.id}`} className="mt-2 block text-xs text-slate-500">
              {last.exercises.length} exercises · {Math.round(sessionVolume(last)).toLocaleString()} kg volume →
            </Link>
          )}
          <Link to="/workouts/cardio/new" className="mt-2 inline-flex items-center gap-1 text-sm text-brand-700">
            <Footprints className="h-4 w-4" /> Log a walk or cardio
          </Link>
        </Card>

        <Card>
          <CardTitle action={<Link to="/planner" className="text-xs text-brand-700">Planner</Link>}>Next planned meal</CardTitle>
          {nextMeal ? (
            <div>
              <div className="text-sm text-slate-500">{relativeDayLabel(nextMeal.date!, today)} · {nextMeal.leftoverOfEntryId ? 'leftovers' : `cook ${nextMeal.servings} servings`}</div>
              <div className="text-lg font-semibold">{recipeName(nextMeal.recipeId)}</div>
              <div className="mt-2 flex gap-2">
                <Link to={`/recipes/${nextMeal.recipeId}/cook?version=${nextMeal.recipeVersionId}&servings=${nextMeal.servings}`}>
                  <Button size="sm">
                    <ChefHat className="h-4 w-4" /> Cook
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await logRecipe({ recipeId: nextMeal.recipeId, versionId: nextMeal.recipeVersionId, date: today, meal: 'dinner', servings: 1 });
                    toast('Logged 1 serving');
                  }}
                >
                  <Utensils className="h-4 w-4" /> Log 1 serving
                </Button>
              </div>
              {upcoming.length > 1 && <p className="mt-2 text-xs text-slate-500">Then: {upcoming.slice(1, 3).map((u) => `${recipeName(u.recipeId)} (${relativeDayLabel(u.date!, today)})`).join(', ')}</p>}
            </div>
          ) : (
            <EmptyState title="Nothing planned for the next few days" action={<Link to="/planner"><Button variant="outline" size="sm">Plan meals</Button></Link>} />
          )}
          {listLeft > 0 && (
            <Link to="/groceries" className="mt-3 flex items-center gap-2 text-sm text-brand-700">
              <ShoppingCart className="h-4 w-4" /> {listLeft} item{listLeft === 1 ? '' : 's'} left on your shopping list
            </Link>
          )}
          {ideas.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Fits the rest of today ({fmt(remainingKcal)} {unit} left)</div>
              {ideas.map((i) => (
                <Link key={i.candidate.recipe.id} to={`/recipes/${i.candidate.recipe.id}`} className="block py-1 text-sm">
                  <span className="font-medium">{i.candidate.recipe.name}</span>
                  <span className="block text-xs text-slate-500">{i.reason}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle action={<Link to="/progress" className="text-xs text-brand-700">Progress</Link>}>Body weight</CardTitle>
          {recentWeights.length >= 2 ? (
            <>
              <TrendLine data={recentWeights.map((p) => ({ date: shortDate(p.date), weight: p.weightKg != null ? Math.round(mass.toDisplay(p.weightKg) * 10) / 10 : null, avg: p.avgKg != null ? Math.round(mass.toDisplay(p.avgKg) * 10) / 10 : null }))} xKey="date" series={[{ key: 'weight', label: 'Daily', color: SERIES.muted, dots: true }, { key: 'avg', label: '7-day avg', color: SERIES.primary }]} height={150} />
              <p className="text-xs text-slate-500">{trend ? `Trend ${trend.slopeKgPerWeek > 0 ? '+' : ''}${(mass.toDisplay(trend.slopeKgPerWeek)).toFixed(2)} ${mass.unit}/week over ${trend.n} weigh-ins.` : 'More weigh-ins are needed before a trend is shown.'}</p>
            </>
          ) : (
            <EmptyState icon={<Scale className="h-6 w-6" />} title="No weight trend yet" action={<Button variant="outline" size="sm" onClick={() => setWeightOpen(true)}>Record weight</Button>}>
              Record a few weigh-ins to see a 7-day average.
            </EmptyState>
          )}
        </Card>
      </div>

      {(entries ?? []).length > 0 && (
        <Card>
          <CardTitle>Logged today</CardTitle>
          <ul className="space-y-1 text-sm">
            {(entries ?? []).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="text-xs text-slate-500">{mealLabel(e.meal)} · </span>
                  {e.name}
                </span>
                <MacroLine n={e.nutrients} incomplete={e.incomplete} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <WeightEntrySheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </div>
  );
}
