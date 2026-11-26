import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, ShoppingCart, Sparkles, Trash2, Repeat2, Check } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Checkbox, EmptyState, Field, Input, NumberInput, PageHeader, Select, Sheet, Notice } from '../../components/ui';
import { MacroLine } from '../../components/nutrition';
import { useToast } from '../../components/toast';
import { CookNav } from '../recipes/RecipesPage';
import { usePrefs, useToday, useNutritionLookup } from '../../hooks/data';
import { addPlanEntry, createPlan, generateGroceryList, recipeCandidates, removePlanEntry, updatePlanEntry } from '../../db/plannerService';
import { recommendMeals, type PlanConstraints, type ScoredRecipe } from '../../domain/planner/recommend';
import { calculateRecipeNutrition } from '../../domain/recipes/nutrition';
import { addDays, dateRange, formatDateKey, startOfWeek } from '../../lib/dates';
import { formatNZD } from '../../lib/utils';
import type { MealPlan, MealPlanEntry } from '../../domain/planner/mealPlan';
import { APPLIANCE_LABEL } from '../../domain/recipes/types';

export function PlannerPage() {
  const prefs = usePrefs();
  const today = useToday();
  const plans = useLiveQuery(() => db.mealPlans.orderBy('updatedAt').reverse().toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const versions = useLiveQuery(() => db.recipeVersions.toArray(), []);
  const lookup = useNutritionLookup();
  const [planId, setPlanId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ date: string | null } | null>(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const plan = plans?.find((p) => p.id === planId) ?? plans?.[0];

  const weekStart = startOfWeek(today, prefs?.weekStartsOn ?? 1);
  const newWeekPlan = async (start: string) => {
    const existing = plans?.find((p) => p.kind === 'dated' && p.weekStart === start);
    if (existing) return setPlanId(existing.id);
    const p = await createPlan({ name: `Week of ${formatDateKey(start, { day: 'numeric', month: 'short' })}`, kind: 'dated', weekStart: start });
    setPlanId(p.id);
  };
  const newCollection = async () => {
    const p = await createPlan({ name: 'Meal collection', kind: 'collection', weekStart: null });
    setPlanId(p.id);
  };

  const recipeName = (id: string) => recipes?.find((r) => r.id === id)?.name ?? 'Deleted recipe';
  const vmap = useMemo(() => new Map((versions ?? []).map((v) => [v.id, v])), [versions]);
  const entryNutrition = (e: MealPlanEntry) => {
    const v = vmap.get(e.recipeVersionId);
    return v && lookup ? calculateRecipeNutrition(v, lookup) : null;
  };

  if (!plans) return null;
  return (
    <div className="space-y-4">
      <CookNav />
      <PageHeader
        title="Meal planner"
        actions={
          <>
            <Button variant="outline" onClick={() => void newWeekPlan(weekStart)}>
              <CalendarDays className="h-4 w-4" /> This week
            </Button>
            <Button variant="outline" onClick={() => void newCollection()}>
              <Plus className="h-4 w-4" /> Collection
            </Button>
          </>
        }
      />
      {!plan ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No meal plans yet" action={<Button onClick={() => void newWeekPlan(weekStart)}>Plan this week</Button>}>
          Plan dated meals for a week, or keep an unordered collection of meals to cook.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={plan.id} onChange={(e) => setPlanId(e.target.value)} className="max-w-xs" aria-label="Plan">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {plan.kind === 'dated' && plan.weekStart && (
              <>
                <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => void newWeekPlan(addDays(plan.weekStart!, -7))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => void newWeekPlan(addDays(plan.weekStart!, 7))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setRecommendOpen(true)}>
              <Sparkles className="h-4 w-4" /> Suggest meals
            </Button>
            <Button
              onClick={async () => {
                const { list, coveredByPantry } = await generateGroceryList(plan.id);
                toast(`Grocery list created (${list.items.length} items${coveredByPantry.length ? `, ${coveredByPantry.length} covered by pantry` : ''})`);
                navigate(`/groceries?list=${list.id}`);
              }}
              disabled={!plan.entries.length}
            >
              <ShoppingCart className="h-4 w-4" /> Grocery list
            </Button>
          </div>

          <PlanSummary plan={plan} nutrition={entryNutrition} />

          {plan.kind === 'dated' && plan.weekStart ? (
            <div className="grid gap-3 md:grid-cols-2">
              {dateRange(plan.weekStart, addDays(plan.weekStart, 6)).map((d) => {
                const list = plan.entries.filter((e) => e.date === d);
                return (
                  <Card key={d} className={d === today ? 'border-brand-500' : ''}>
                    <CardTitle action={<Button variant="ghost" size="sm" onClick={() => setAdding({ date: d })} aria-label={`Add meal on ${d}`}><Plus className="h-4 w-4" /></Button>}>{formatDateKey(d, { weekday: 'long', day: 'numeric', month: 'short' })}</CardTitle>
                    {list.length ? list.map((e) => <EntryRow key={e.id} plan={plan} entry={e} name={recipeName(e.recipeId)} nutrition={entryNutrition(e)} />) : <p className="text-sm text-slate-400">Nothing planned</p>}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardTitle action={<Button variant="ghost" size="sm" onClick={() => setAdding({ date: null })}><Plus className="h-4 w-4" /> Add</Button>}>Meals to cook</CardTitle>
              {plan.entries.length ? plan.entries.map((e) => <EntryRow key={e.id} plan={plan} entry={e} name={recipeName(e.recipeId)} nutrition={entryNutrition(e)} />) : <p className="text-sm text-slate-400">Add recipes to this collection.</p>}
            </Card>
          )}
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={async () => {
              if (!confirm(`Delete plan "${plan.name}"?`)) return;
              await db.mealPlans.delete(plan.id);
              setPlanId(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete plan
          </Button>
        </>
      )}
      {plan && <AddEntrySheet plan={plan} state={adding} onClose={() => setAdding(null)} />}
      {plan && <RecommendSheet open={recommendOpen} onClose={() => setRecommendOpen(false)} plan={plan} />}
    </div>
  );
}

function PlanSummary({ plan, nutrition }: { plan: MealPlan; nutrition: (e: MealPlanEntry) => ReturnType<typeof calculateRecipeNutrition> | null }) {
  const cooks = plan.entries.filter((e) => !e.leftoverOfEntryId).length;
  const servings = plan.entries.reduce((s, e) => s + e.servings, 0);
  const protein = plan.entries.reduce((s, e) => s + (nutrition(e)?.perServing.proteinG ?? 0) * e.servings, 0);
  return (
    <div className="flex flex-wrap gap-2 text-sm text-slate-600 dark:text-slate-300">
      <Badge>{cooks} cook{cooks === 1 ? '' : 's'}</Badge>
      <Badge>{servings} servings planned</Badge>
      <Badge>{Math.round(protein)} g protein total</Badge>
      <Badge>{plan.entries.filter((e) => e.leftoverOfEntryId).length} leftover meals</Badge>
    </div>
  );
}

function EntryRow({ plan, entry, name, nutrition }: { plan: MealPlan; entry: MealPlanEntry; name: string; nutrition: ReturnType<typeof calculateRecipeNutrition> | null }) {
  const [open, setOpen] = useState(false);
  const [servings, setServings] = useState<number | null>(entry.servings);
  const [leftoverDate, setLeftoverDate] = useState<string>(entry.date ? addDays(entry.date, 1) : '');
  const parent = entry.leftoverOfEntryId ? plan.entries.find((e) => e.id === entry.leftoverOfEntryId) : null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 py-2 first:border-0 dark:border-slate-800">
      <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(true)}>
        <div className="flex items-center gap-1 truncate text-sm font-medium">
          {entry.cooked && <Check className="h-4 w-4 text-green-600" />}
          {name}
          {parent && <Badge tone="indigo">leftovers</Badge>}
        </div>
        <div className="text-xs text-slate-500">
          {entry.servings} serving(s) {nutrition && <>· <MacroLine n={nutrition.perServing} incomplete={!nutrition.complete} /> /serv.</>}
        </div>
      </button>
      <Link to={`/recipes/${entry.recipeId}`} className="text-xs text-brand-700">
        View
      </Link>
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <div className="space-y-3">
          <Field label="Servings">{(fid) => <NumberInput id={fid} value={servings} onChange={setServings} min={0.5} step={0.5} />}</Field>
          <Button className="w-full" onClick={async () => { await updatePlanEntry(plan.id, entry.id, { servings: servings ?? entry.servings }); setOpen(false); }}>
            Save servings
          </Button>
          <Checkbox checked={entry.cooked} onChange={(v) => void updatePlanEntry(plan.id, entry.id, { cooked: v })} label="Cooked (excluded from new grocery lists)" />
          {!entry.leftoverOfEntryId && (
            <Card className="space-y-2 bg-slate-50 dark:bg-slate-800/50">
              <div className="text-sm font-medium">Reuse as leftovers</div>
              <p className="text-xs text-slate-500">Adds a leftover meal; servings are added to how much you cook, without extra groceries per meal.</p>
              {plan.kind === 'dated' && <input type="date" className="h-10 w-full rounded-lg border border-slate-300 px-2 dark:border-slate-700 dark:bg-slate-900" value={leftoverDate} onChange={(e) => setLeftoverDate(e.target.value)} aria-label="Leftover date" />}
              <Button variant="outline" className="w-full" onClick={async () => { await addPlanEntry(plan.id, { date: plan.kind === 'dated' ? leftoverDate || entry.date : null, slot: 'lunch', recipeId: entry.recipeId, recipeVersionId: entry.recipeVersionId, servings: 1, leftoverOfEntryId: entry.id }); setOpen(false); }}>
                <Repeat2 className="h-4 w-4" /> Add leftover meal
              </Button>
            </Card>
          )}
          <Button variant="danger" className="w-full" onClick={() => void removePlanEntry(plan.id, entry.id)}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function AddEntrySheet({ plan, state, onClose }: { plan: MealPlan; state: { date: string | null } | null; onClose: () => void }) {
  const recipes = useLiveQuery(() => db.recipes.filter((r) => !r.archived).sortBy('name'), []);
  const prefs = usePrefs();
  const [q, setQ] = useState('');
  const [servings, setServings] = useState<number | null>(null);
  return (
    <Sheet open={!!state} onClose={onClose} title={state?.date ? `Add meal — ${formatDateKey(state.date)}` : 'Add meal'}>
      <div className="mb-3 grid grid-cols-[1fr_6rem] gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" />
        <NumberInput value={servings ?? prefs?.defaultServings ?? 4} onChange={setServings} min={1} aria-label="Servings" />
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {(recipes ?? [])
          .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
          .map((r) => (
            <li key={r.id}>
              <button
                className="w-full py-2.5 text-left text-sm font-medium hover:text-brand-700"
                onClick={async () => {
                  await addPlanEntry(plan.id, { date: state?.date ?? null, slot: 'dinner', recipeId: r.id, recipeVersionId: r.currentVersionId, servings: servings ?? prefs?.defaultServings ?? 4 });
                  onClose();
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
      </ul>
    </Sheet>
  );
}

function RecommendSheet({ open, onClose, plan }: { open: boolean; onClose: () => void; plan: MealPlan }) {
  const prefs = usePrefs();
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const [count, setCount] = useState<number | null>(4);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [maxCost, setMaxCost] = useState<number | null>(null);
  const [minProtein, setMinProtein] = useState<number | null>(null);
  const [excludeText, setExcludeText] = useState('');
  const [result, setResult] = useState<{ picks: ScoredRecipe[]; excluded: ScoredRecipe[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (prefs) {
      setMaxMinutes(prefs.maxCookMinutes);
      setMaxCost(prefs.maxCostPerServingNZD);
      setMinProtein(prefs.minProteinPerServingG);
    }
  }, [prefs]);
  if (!prefs || !ingredients) return null;
  const run = async () => {
    const ingMap = new Map(ingredients.map((i) => [i.id, i]));
    const excludedIds = excludeText
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .flatMap((term) => ingredients.filter((i) => i.name.toLowerCase().includes(term)).map((i) => i.id));
    const k: PlanConstraints = { availableAppliances: prefs.appliances, excludedTags: prefs.excludedTags, excludedIngredientIds: excludedIds, maxTotalMinutes: maxMinutes, maxCostPerServing: maxCost, minProteinPerServing: minProtein, maxSatFatPerServing: prefs.maxSatFatPerServingG };
    const r = recommendMeals(await recipeCandidates({ categories: ['main'] }), k, ingMap, count ?? 4);
    setResult(r);
    setChosen(new Set(r.picks.map((p) => p.candidate.recipe.id)));
  };
  const add = async () => {
    const picks = result!.picks.filter((p) => chosen.has(p.candidate.recipe.id));
    const dates = plan.kind === 'dated' && plan.weekStart ? dateRange(plan.weekStart, addDays(plan.weekStart, 6)).filter((d) => !plan.entries.some((e) => e.date === d)) : [];
    for (const [i, p] of picks.entries()) await addPlanEntry(plan.id, { date: plan.kind === 'dated' ? dates[i] ?? plan.weekStart : null, slot: 'dinner', recipeId: p.candidate.recipe.id, recipeVersionId: p.candidate.version.id, servings: prefs.defaultServings });
    onClose();
    setResult(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Suggest meals" footer={result ? <Button className="w-full" disabled={!chosen.size} onClick={() => void add()}>Add {chosen.size} to plan</Button> : <Button className="w-full" onClick={() => void run()}>Suggest</Button>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number of meals">{(fid) => <NumberInput id={fid} value={count} onChange={setCount} min={1} />}</Field>
          <Field label="Max total time (min)">{(fid) => <NumberInput id={fid} value={maxMinutes} onChange={setMaxMinutes} min={0} placeholder="any" />}</Field>
          <Field label="Max cost/serving (NZ$)">{(fid) => <NumberInput id={fid} value={maxCost} onChange={setMaxCost} step={0.5} min={0} placeholder="any" />}</Field>
          <Field label="Min protein/serving (g)">{(fid) => <NumberInput id={fid} value={minProtein} onChange={setMinProtein} min={0} placeholder="any" />}</Field>
        </div>
        <Field label="Exclude ingredients" hint={`Always excluded (Settings): ${prefs.excludedTags.join(', ') || 'none'}`}>{(fid) => <Input id={fid} value={excludeText} onChange={(e) => setExcludeText(e.target.value)} placeholder="e.g. mushroom, capsicum" />}</Field>
        <p className="text-xs text-slate-500">Uses your appliances ({prefs.appliances.map((a) => APPLIANCE_LABEL[a]).join(', ')}), ratings, recent meals, ingredient overlap and variety. Every score is explained.</p>
        {result && (
          <div className="space-y-2">
            {result.picks.length === 0 && <Notice tone="warn">No recipes fit these constraints.</Notice>}
            {result.picks.map((p) => (
              <Card key={p.candidate.recipe.id} className="p-3">
                <Checkbox checked={chosen.has(p.candidate.recipe.id)} onChange={(on) => setChosen((s) => { const n = new Set(s); if (on) n.add(p.candidate.recipe.id); else n.delete(p.candidate.recipe.id); return n; })} label={<span className="font-medium">{p.candidate.recipe.name}</span>} />
                <div className="mt-1 text-xs text-slate-500">
                  Score {p.score} · {p.reasons.join(' · ')}
                  {p.candidate.costPerServing != null && p.candidate.costUnpriced.length > 0 && ` (cost excludes ${p.candidate.costUnpriced.length} unpriced item(s))`}
                </div>
              </Card>
            ))}
            {result.excluded.length > 0 && (
              <details className="text-xs text-slate-500">
                <summary>{result.excluded.length} excluded</summary>
                <ul className="mt-1 space-y-1">
                  {result.excluded.map((e) => (
                    <li key={e.candidate.recipe.id}>
                      <span className="font-medium">{e.candidate.recipe.name}</span>: {e.excludedBecause.join('; ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {result.picks.some((p) => p.candidate.costPerServing != null) && <p className="text-xs text-slate-500">Estimated cost of picks: {formatNZD(result.picks.filter((p) => chosen.has(p.candidate.recipe.id)).reduce((s, p) => s + (p.candidate.costPerServing ?? 0) * prefs.defaultServings, 0))}</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
