import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Minus, Plus, Search, Star, Zap, ChefHat, History } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, Field, Input, NumberInput, Select, Sheet, Tabs, EmptyState, Notice } from '../../components/ui';
import { MacroLine, QualityBadge, IncompleteMark } from '../../components/nutrition';
import { useToast } from '../../components/toast';
import { DEFAULT_MEALS, frequentItems, mealLabel, recentItems, type FrequentItem } from '../../domain/nutrition/diary';
import { nutrientsForAmount, type Food } from '../../domain/nutrition/foods';
import { scaleNutrients, unknownNutrients, type Nutrients } from '../../domain/nutrition/nutrients';
import { logFood, logQuick, logRecipe, logSavedMeal, repeatEntry } from '../../db/foodService';
import { useNutritionLookup, useToday } from '../../hooks/data';
import { calculateRecipeNutrition } from '../../domain/recipes/nutrition';
import { addDays } from '../../lib/dates';
import type { Recipe } from '../../domain/recipes/types';

type Tab = 'recent' | 'frequent' | 'recipes' | 'meals' | 'quick';

export function AddFoodPage() {
  const today = useToday();
  const [params] = useSearchParams();
  const date = params.get('date') ?? today;
  const [meal, setMeal] = useState(params.get('meal') ?? guessMeal());
  const [tab, setTab] = useState<Tab>('recent');
  const [query, setQuery] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const history = useLiveQuery(() => db.foodLog.where('date').between(addDays(today, -60), addDays(today, 1), true, true).toArray(), [today]);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const savedMeals = useLiveQuery(() => db.savedMeals.toArray(), []);

  const q = query.trim().toLowerCase();
  const foodResults = useMemo(() => (q ? (foods ?? []).filter((f) => !f.archived && `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(q)).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)).slice(0, 40) : []), [foods, q]);
  const recipeResults = (recipes ?? []).filter((r) => !r.archived && (!q || r.name.toLowerCase().includes(q)));

  const onRepeat = async (item: FrequentItem) => {
    await repeatEntry(item.lastEntry, date, meal);
    toast(`Added ${item.name} to ${mealLabel(meal).toLowerCase()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to={`/food${date === today ? '' : `?date=${date}`}`}>
          <Button variant="ghost" size="icon" aria-label="Back to diary">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="flex-1 text-xl font-bold">Add food</h1>
        <Select value={meal} onChange={(e) => setMeal(e.target.value)} className="w-36" aria-label="Meal">
          {DEFAULT_MEALS.map((m) => (
            <option key={m} value={m}>
              {mealLabel(m)}
            </option>
          ))}
        </Select>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods and recipes…" className="pl-9" aria-label="Search foods" />
      </div>

      {q ? (
        <div className="space-y-3">
          {recipeResults.length > 0 && (
            <Card className="p-0">
              <div className="px-4 pt-3 text-xs font-semibold uppercase text-slate-500">Recipes</div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recipeResults.slice(0, 6).map((r) => (
                  <ResultRow key={r.id} title={r.name} sub="Recipe — log by serving" onClick={() => setRecipe(r)} icon={<ChefHat className="h-4 w-4 text-pantry-600" />} />
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-0">
            <div className="px-4 pt-3 text-xs font-semibold uppercase text-slate-500">Foods</div>
            {foodResults.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {foodResults.map((f) => (
                  <ResultRow key={f.id} title={f.brand ? `${f.name} · ${f.brand}` : f.name} sub={<MacroLine n={nutrientsForAmount(f, 100)} incomplete={f.per100.energyKcal == null} />} onClick={() => setFood(f)} icon={f.favourite ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : undefined} />
                ))}
              </ul>
            ) : (
              <div className="p-4 text-sm text-slate-500">
                No foods match.{' '}
                <Link className="text-brand-700 underline" to={`/foods/new?name=${encodeURIComponent(query)}`}>
                  Create “{query}”
                </Link>{' '}
                or use Quick add.
              </div>
            )}
          </Card>
        </div>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'frequent', label: 'Frequent' },
              { value: 'recipes', label: 'Recipes' },
              { value: 'meals', label: 'Meals' },
              { value: 'quick', label: 'Quick add' }
            ]}
          />
          {tab === 'recent' && <ItemList items={recentItems(history ?? [])} onPick={onRepeat} empty="Foods you log appear here for one-tap re-logging." />}
          {tab === 'frequent' && <ItemList items={frequentItems(history ?? [])} onPick={onRepeat} empty="Your most frequently eaten foods appear here." />}
          {tab === 'recipes' && (
            <Card className="p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recipeResults.map((r) => (
                  <ResultRow key={r.id} title={r.name} sub={r.description} onClick={() => setRecipe(r)} icon={<ChefHat className="h-4 w-4 text-pantry-600" />} />
                ))}
              </ul>
            </Card>
          )}
          {tab === 'meals' &&
            ((savedMeals ?? []).length ? (
              <Card className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(savedMeals ?? []).map((m) => (
                    <ResultRow
                      key={m.id}
                      title={m.name}
                      sub={`${m.items.length} items · ${Math.round(m.items.reduce((s, i) => s + (i.nutrients.energyKcal ?? 0), 0))} kcal`}
                      onClick={async () => {
                        await logSavedMeal(m.id, date, meal);
                        toast(`Added ${m.name}`);
                      }}
                      icon={<Star className="h-4 w-4 text-amber-500" />}
                    />
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState title="No saved meals yet">Use the save button on a meal in your diary to reuse a combination of foods.</EmptyState>
            ))}
          {tab === 'quick' && <QuickAdd onAdd={async (name, n) => { await logQuick({ date, meal, name, nutrients: n }); toast(`Added ${name || 'quick entry'}`); }} />}
        </>
      )}

      <div className="sticky bottom-20 flex justify-end lg:bottom-4">
        <Button variant="secondary" onClick={() => navigate(`/food${date === today ? '' : `?date=${date}`}`)}>
          Done
        </Button>
      </div>

      <FoodAmountSheet food={food} onClose={() => setFood(null)} onAdd={async (amount, servingId, count) => {
        const f = food!;
        const serving = f.servings.find((s) => s.id === servingId);
        await logFood({ foodId: f.id, date, meal, amount, serving, servingCount: count ?? undefined });
        toast(`Added ${f.name}`);
        setFood(null);
      }} />
      <RecipeServingSheet recipe={recipe} onClose={() => setRecipe(null)} onAdd={async (servings) => {
        await logRecipe({ recipeId: recipe!.id, date, meal, servings });
        toast(`Added ${servings} serving(s) of ${recipe!.name}`);
        setRecipe(null);
      }} />
    </div>
  );
}

function guessMeal(): string {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

function ResultRow({ title, sub, onClick, icon }: { title: string; sub?: React.ReactNode; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <li>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={onClick}>
        {icon}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
        </div>
        <Plus className="h-4 w-4 text-slate-400" />
      </button>
    </li>
  );
}

function ItemList({ items, onPick, empty }: { items: FrequentItem[]; onPick: (i: FrequentItem) => void; empty: string }) {
  if (!items.length) return <EmptyState icon={<History className="h-6 w-6" />} title="Nothing here yet">{empty}</EmptyState>;
  return (
    <Card className="p-0">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((i) => (
          <li key={i.key}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => onPick(i)} aria-label={`Add ${i.name} again`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{i.name}</div>
                <div className="truncate text-xs text-slate-500">
                  {i.lastEntry.description} · <MacroLine n={i.lastEntry.nutrients} incomplete={i.lastEntry.incomplete} />
                </div>
              </div>
              {i.count > 1 && <Badge>{i.count}×</Badge>}
              <Plus className="h-4 w-4 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FoodAmountSheet({ food, onClose, onAdd }: { food: Food | null; onClose: () => void; onAdd: (amount: number, servingId: string | null, count: number | null) => void }) {
  const [servingId, setServingId] = useState<string>('');
  const [count, setCount] = useState<number | null>(1);
  const [grams, setGrams] = useState<number | null>(100);
  if (!food) return null;
  const sid = servingId || food.defaultServingId || '';
  const serving = food.servings.find((s) => s.id === sid);
  const amount = serving ? serving.amount * (count ?? 0) : grams ?? 0;
  const n = nutrientsForAmount(food, amount);
  return (
    <Sheet open onClose={() => { setServingId(''); setCount(1); setGrams(100); onClose(); }} title={food.name} footer={<Button className="w-full" size="lg" disabled={!(amount > 0)} onClick={() => onAdd(amount, serving?.id ?? null, serving ? count : null)}>Add {Math.round(amount)} {food.basis}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <QualityBadge quality={food.quality} />
          <span className="text-xs text-slate-500">{food.source.name}</span>
        </div>
        <Field label="Portion">
          {(id) => (
            <Select id={id} value={sid} onChange={(e) => setServingId(e.target.value || 'grams')}>
              {food.servings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="grams">Weight ({food.basis})</option>
            </Select>
          )}
        </Field>
        {serving ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Fewer" onClick={() => setCount(Math.max(0.25, (count ?? 1) - 0.5))}>
              <Minus className="h-4 w-4" />
            </Button>
            <NumberInput value={count} onChange={setCount} step={0.25} min={0} className="text-center text-lg" aria-label="Number of servings" />
            <Button variant="outline" size="icon" aria-label="More" onClick={() => setCount((count ?? 0) + 0.5)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Field label={`Amount (${food.basis})`}>{(id) => <NumberInput id={id} value={grams} onChange={setGrams} min={0} className="text-lg" />}</Field>
        )}
        <Card className="bg-slate-50 dark:bg-slate-800/50">
          <MacroLine n={n} incomplete={Object.values(food.per100).some((v) => v == null)} />
          <div className="mt-1 text-xs text-slate-500">Sat fat {n.satFatG?.toFixed(1) ?? '?'} g · Fibre {n.fibreG?.toFixed(1) ?? '?'} g · Sodium {n.sodiumMg != null ? Math.round(n.sodiumMg) : '?'} mg</div>
        </Card>
        {food.per100.energyKcal == null && <Notice tone="warn">This food has no energy value recorded. <Link className="underline" to={`/foods/${food.id}`}>Add it from the label</Link>.</Notice>}
      </div>
    </Sheet>
  );
}

function RecipeServingSheet({ recipe, onClose, onAdd }: { recipe: Recipe | null; onClose: () => void; onAdd: (servings: number) => void }) {
  const [servings, setServings] = useState<number | null>(1);
  const version = useLiveQuery(() => (recipe ? db.recipeVersions.get(recipe.currentVersionId) : undefined), [recipe?.currentVersionId]);
  const lookup = useNutritionLookup();
  if (!recipe) return null;
  const nutrition = version && lookup ? calculateRecipeNutrition(version, lookup) : null;
  const per = nutrition?.perServing ?? unknownNutrients();
  return (
    <Sheet open onClose={() => { setServings(1); onClose(); }} title={recipe.name} footer={<Button className="w-full" size="lg" disabled={!(servings && servings > 0)} onClick={() => onAdd(servings!)}>Add {servings} serving{servings === 1 ? '' : 's'}</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Recipe makes {version?.servings ?? '?'} servings (version {version?.versionNumber}). Nutrition is calculated from its ingredients and saved with this entry.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Fewer servings" onClick={() => setServings(Math.max(0.25, (servings ?? 1) - 0.5))}>
            <Minus className="h-4 w-4" />
          </Button>
          <NumberInput value={servings} onChange={setServings} step={0.25} min={0} className="text-center text-lg" aria-label="Servings" />
          <Button variant="outline" size="icon" aria-label="More servings" onClick={() => setServings((servings ?? 0) + 0.5)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Card className="bg-slate-50 dark:bg-slate-800/50">
          <MacroLine n={scaleNutrients(per, servings ?? 0)} incomplete={!nutrition?.complete} />
          {nutrition && !nutrition.complete && <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><IncompleteMark show /> Incomplete: {nutrition.issues.map((i) => i.ingredientName).join(', ')}</p>}
        </Card>
      </div>
    </Sheet>
  );
}

function QuickAdd({ onAdd }: { onAdd: (name: string, n: Nutrients) => Promise<void> }) {
  const [name, setName] = useState('');
  const [n, setN] = useState<Nutrients>(unknownNutrients());
  const set = (k: keyof Nutrients) => (v: number | null) => setN((x) => ({ ...x, [k]: v }));
  return (
    <Card className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Zap className="h-4 w-4" /> Enter what you know — leave the rest blank (recorded as unknown, not zero).
      </p>
      <Field label="Description">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Café flat white" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Energy (kcal)">{(id) => <NumberInput id={id} value={n.energyKcal} onChange={set('energyKcal')} min={0} />}</Field>
        <Field label="Protein (g)">{(id) => <NumberInput id={id} value={n.proteinG} onChange={set('proteinG')} min={0} step={0.1} />}</Field>
        <Field label="Carbs (g)">{(id) => <NumberInput id={id} value={n.carbsG} onChange={set('carbsG')} min={0} step={0.1} />}</Field>
        <Field label="Fat (g)">{(id) => <NumberInput id={id} value={n.fatG} onChange={set('fatG')} min={0} step={0.1} />}</Field>
      </div>
      <Button
        className="w-full"
        disabled={n.energyKcal == null && n.proteinG == null}
        onClick={async () => {
          await onAdd(name.trim(), n);
          setName('');
          setN(unknownNutrients());
        }}
      >
        Quick add
      </Button>
    </Card>
  );
}
