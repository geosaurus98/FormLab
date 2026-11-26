import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, Archive, CalendarPlus, ChefHat, Copy, FlaskConical, Minus, Pencil, Plus, Star, Trash2, Utensils, Info, ShieldAlert } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Notice, PageHeader, Select, Sheet, NumberInput, Field } from '../../components/ui';
import { NutrientTable, ValidationBadge, IncompleteMark, QualityBadge, useEnergy } from '../../components/nutrition';
import { chooseServingNutrition } from '../../db/recipeService';
import { RECIPE_BOOK_REPO_URL, RECIPE_BOOK_SOURCE_NAME } from '../../domain/recipes/recipeBook';
import { useToast } from '../../components/toast';
import { useNutritionLookup, useToday } from '../../hooks/data';
import { calculateRecipeNutrition } from '../../domain/recipes/nutrition';
import { scaleVersion } from '../../domain/recipes/scaling';
import { estimateRecipeCost } from '../../domain/recipes/shopping';
import { checkRecipeSafety } from '../../domain/recipes/safety';
import { averageRating } from '../../domain/recipes/lab';
import { APPLIANCE_LABEL, VALIDATION_LABEL, type RecipeVersion, type ValidationStatus } from '../../domain/recipes/types';
import { deleteRecipe, duplicateRecipe, setRecipeFlags, setVersionValidation } from '../../db/recipeService';
import { logRecipe } from '../../db/foodService';
import { addPlanEntry, createPlan } from '../../db/plannerService';
import { DEFAULT_MEALS, mealLabel } from '../../domain/nutrition/diary';
import { formatQuantity } from '../../lib/units';
import { formatNZD } from '../../lib/utils';
import { formatDateKey, isoToDateKey, startOfWeek } from '../../lib/dates';

export function RecipeDetailPage() {
  const { id } = useParams();
  const recipe = useLiveQuery(() => db.recipes.get(id!), [id]);
  const versions = useLiveQuery(() => db.recipeVersions.where('recipeId').equals(id!).sortBy('versionNumber'), [id]);
  const feedback = useLiveQuery(() => db.recipeFeedback.where('recipeId').equals(id!).toArray(), [id]);
  const cooks = useLiveQuery(() => db.cookingSessions.where('recipeId').equals(id!).reverse().sortBy('startedAt'), [id]);
  const profiles = useLiveQuery(() => db.applianceProfiles.toArray(), []);
  const lookup = useNutritionLookup();
  const [versionId, setVersionId] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { fmt, unit } = useEnergy();

  const version = versions?.find((v) => v.id === (versionId ?? recipe?.currentVersionId));
  const scaled = useMemo(() => (version ? (servings && servings !== version.servings ? scaleVersion(version, servings) : version) : null), [version, servings]);
  const nutrition = useMemo(() => (scaled && lookup ? calculateRecipeNutrition(scaled, lookup) : null), [scaled, lookup]);
  const logged = useMemo(() => (nutrition && scaled ? chooseServingNutrition(nutrition, scaled.declaredNutrition ?? null, { recipeId: '', recipeVersionId: '', versionNumber: 0, name: '' }) : null), [nutrition, scaled]);
  const cost = useMemo(() => (scaled && lookup ? estimateRecipeCost(scaled, lookup.ingredients) : null), [scaled, lookup]);
  const safety = useMemo(() => (version && lookup && profiles ? checkRecipeSafety(version, lookup.ingredients, new Map(profiles.map((p) => [p.id, p]))) : []), [version, lookup, profiles]);
  if (!recipe || !version || !scaled || !lookup) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const rating = averageRating(feedback ?? []);
  const isCurrent = version.id === recipe.currentVersionId;

  return (
    <div className="space-y-4">
      <PageHeader
        title={recipe.name}
        subtitle={[recipe.cuisine, recipe.category, rating ? `★ ${rating.mean.toFixed(1)} (${rating.n})` : null].filter(Boolean).join(' · ')}
        back={<Link to="/recipes" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Recipes</Link>}
        actions={
          <Button variant="ghost" size="icon" aria-label={recipe.favourite ? 'Remove favourite' : 'Add favourite'} onClick={() => void setRecipeFlags(recipe.id, { favourite: !recipe.favourite })}>
            <Star className={recipe.favourite ? 'h-5 w-5 fill-amber-400 text-amber-400' : 'h-5 w-5'} />
          </Button>
        }
      />
      {recipe.archived && <Notice tone="warn">This recipe is archived. <button className="underline" onClick={() => void setRecipeFlags(recipe.id, { archived: false })}>Restore</button></Notice>}
      {recipe.source.name === RECIPE_BOOK_SOURCE_NAME && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="indigo">From your recipe book</Badge>
          {recipe.source.note && (
            <a href={`${RECIPE_BOOK_REPO_URL}/blob/main/${recipe.source.note}`} target="_blank" rel="noreferrer" className="text-brand-700 underline">
              {recipe.source.note}
            </a>
          )}
          <span className="text-slate-500">Edit it in the book and re-import, or edit here (your version is kept).</span>
        </div>
      )}
      <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{recipe.description}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link to={`/recipes/${recipe.id}/cook?version=${version.id}&servings=${scaled.servings}`}>
          <Button className="w-full" size="lg">
            <ChefHat className="h-5 w-5" /> Cook
          </Button>
        </Link>
        <Button variant="outline" size="lg" onClick={() => setLogOpen(true)}>
          <Utensils className="h-5 w-5" /> Log serving
        </Button>
        <Button variant="outline" size="lg" onClick={() => setPlanOpen(true)}>
          <CalendarPlus className="h-5 w-5" /> Plan
        </Button>
        <Link to={`/lab/${recipe.id}`}>
          <Button variant="outline" size="lg" className="w-full">
            <FlaskConical className="h-5 w-5" /> Lab
          </Button>
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ValidationBadge status={version.validation} />
            <Badge>v{version.versionNumber}{version.branch !== 'main' ? ` · ${version.branch}` : ''}</Badge>
            <span className="text-sm text-slate-500">
              Prep {version.prepMinutes} min · Cook {version.cookMinutes} min
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-500">Servings</span>
            <Button variant="outline" size="icon" aria-label="Fewer servings" onClick={() => setServings(Math.max(1, (servings ?? version.servings) - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-semibold tabular-nums" data-testid="servings">{scaled.servings}</span>
            <Button variant="outline" size="icon" aria-label="More servings" onClick={() => setServings((servings ?? version.servings) + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {version.appliances.map((a) => (
            <Badge key={a} tone="teal">{APPLIANCE_LABEL[a]}</Badge>
          ))}
          {version.equipment.map((e) => (
            <Badge key={e}>{e}</Badge>
          ))}
        </div>
      </Card>

      {safety.filter((f) => f.level !== 'info').map((f) => (
        <Notice key={f.code} tone={f.level === 'block' ? 'danger' : 'warn'}>
          <ShieldAlert className="mr-1 inline h-4 w-4" />
          {f.message} {f.source && <span className="block text-xs opacity-80">Source: {f.source}</span>}
        </Notice>
      ))}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardTitle>Ingredients</CardTitle>
            <ul className="space-y-1.5 text-sm">
              {scaled.ingredients.map((ri) => {
                const ing = lookup.ingredients.get(ri.ingredientId);
                const missing = nutrition?.issues.some((i) => i.recipeIngredientId === ri.id);
                return (
                  <li key={ri.id} className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatQuantity(ri.quantity, ri.unit)}</span>
                    <span>
                      {ri.quantity === 0 && ri.preparation ? ri.preparation : ing?.name ?? 'Unknown'}
                      {ri.preparation && ri.quantity !== 0 && <span className="text-slate-500">, {ri.preparation}</span>}
                      {ri.optional && <Badge className="ml-1">optional</Badge>}
                      {missing && <IncompleteMark show title="No usable nutrition data for this ingredient" />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardTitle>Method</CardTitle>
            <ol className="space-y-3">
              {version.steps.map((s, i) => (
                <li key={s.id} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">{i + 1}</span>
                  <div>
                    {s.appliance && <Badge tone="teal" className="mb-1">{APPLIANCE_LABEL[s.appliance]}</Badge>}
                    <p>{s.text}</p>
                    {s.safetyNote && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400"><AlertTriangle className="h-3.5 w-3.5" /> {s.safetyNote}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Nutrition per {scaled.declaredNutrition?.perLabel ?? 'serving'}</CardTitle>
            {nutrition && logged && logged.quality === 'estimate' && (
              <>
                <div className="mb-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
                  {fmt(logged.perServing.energyKcal)} <span className="text-sm font-normal text-slate-500">{unit}</span>
                  <QualityBadge quality="estimate" />
                </div>
                <NutrientTable totals={{ values: logged.perServing }} />
                <Notice className="mt-2 text-xs">
                  <strong>Recipe book estimate</strong> ({scaled.declaredNutrition!.source}). This is what's logged to your diary, because FormLab's own calculation is incomplete: {fmt(nutrition.perServing.energyKcal)} {unit} and {Math.round(nutrition.perServing.proteinG ?? 0)} g protein from known ingredients, missing {[...new Set(nutrition.issues.map((i) => i.ingredientName))].slice(0, 6).join(', ')}
                  {new Set(nutrition.issues.map((i) => i.ingredientName)).size > 6 ? '…' : ''}. <Link to="/foods" className="underline">Add foods</Link> to calculate it exactly.
                </Notice>
              </>
            )}
            {nutrition && logged?.quality !== 'estimate' && (
              <>
                <div className="mb-2 text-2xl font-bold tabular-nums">
                  {fmt(nutrition.perServing.energyKcal)} <span className="text-sm font-normal text-slate-500">{unit}</span>
                </div>
                <NutrientTable totals={{ values: nutrition.perServing }} />
                {scaled.declaredNutrition && <p className="mt-2 text-xs text-slate-500">Recipe book estimate for comparison: {fmt(scaled.declaredNutrition.nutrients.energyKcal)} {unit}, {Math.round(scaled.declaredNutrition.nutrients.proteinG ?? 0)} g protein.</p>}
                {!nutrition.complete ? (
                  <Notice tone="warn" className="mt-2 text-xs">
                    Incomplete estimate — missing data for: {[...new Set(nutrition.issues.map((i) => i.ingredientName))].join(', ')}. <Link to="/foods" className="underline">Update foods</Link>
                  </Notice>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Calculated from ingredient data (optional ingredients excluded). Values from reference data are approximate.</p>
                )}
              </>
            )}
          </Card>
          <Card>
            <CardTitle>Estimated cost</CardTitle>
            {cost && cost.total > 0 ? (
              <>
                <div className="text-lg font-semibold">
                  {formatNZD(cost.total)} total · {formatNZD(cost.perServing)}/serving
                </div>
                <p className="text-xs text-slate-500">Pro-rated from package prices you've entered (seed prices are indicative placeholders).{cost.unpriced.length > 0 && ` Not priced: ${cost.unpriced.join(', ')}.`}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Add package prices to ingredients to estimate cost.</p>
            )}
          </Card>
          {safety.some((f) => f.level === 'info') && (
            <Card>
              <CardTitle>Safety checks</CardTitle>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {safety.filter((f) => f.level === 'info').map((f) => (
                  <li key={f.code} title={f.source}>
                    <Info className="mr-1 inline h-3.5 w-3.5" />
                    {f.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardTitle>Versions</CardTitle>
            <Select value={version.id} onChange={(e) => setVersionId(e.target.value)} aria-label="Version">
              {(versions ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} {v.branch !== 'main' ? `(${v.branch})` : ''} {v.id === recipe.currentVersionId ? '· current' : ''} — {v.changeSummary || 'no summary'}
                </option>
              ))}
            </Select>
            {!isCurrent && <p className="mt-1 text-xs text-slate-500">Viewing a non-current version. Logging and cooking use the version shown.</p>}
            <ValidationEditor version={version} />
          </Card>
          {(cooks ?? []).length > 0 && (
            <Card>
              <CardTitle>Cooking history</CardTitle>
              <ul className="space-y-1 text-sm">
                {cooks!.slice(0, 6).map((c) => {
                  const v = versions?.find((x) => x.id === c.recipeVersionId);
                  return (
                    <li key={c.id} className="flex justify-between">
                      <span>{formatDateKey(isoToDateKey(c.startedAt))}</span>
                      <span className="text-slate-500">
                        v{v?.versionNumber} · {c.servingsMade} serv. {c.actualMinutes ? `· ${c.actualMinutes} min` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to={`/recipes/${recipe.id}/edit?from=${version.id}`}>
          <Button variant="outline">
            <Pencil className="h-4 w-4" /> Edit (new version)
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={async () => {
            const d = await duplicateRecipe(recipe.id);
            navigate(`/recipes/${d.id}`);
          }}
        >
          <Copy className="h-4 w-4" /> Duplicate
        </Button>
        <Button variant="outline" onClick={() => void setRecipeFlags(recipe.id, { archived: !recipe.archived })}>
          <Archive className="h-4 w-4" /> {recipe.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button
          variant="ghost"
          className="text-red-600"
          onClick={async () => {
            if (!confirm(`Delete "${recipe.name}" permanently?`)) return;
            const r = await deleteRecipe(recipe.id);
            if (r.deleted) navigate('/recipes');
            else toast(r.reason ?? 'Cannot delete');
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <LogServingSheet open={logOpen} onClose={() => setLogOpen(false)} recipeId={recipe.id} version={version} />
      <AddToPlanSheet open={planOpen} onClose={() => setPlanOpen(false)} recipeId={recipe.id} versionId={version.id} defaultServings={version.servings} />
    </div>
  );
}

function ValidationEditor({ version }: { version: RecipeVersion }) {
  return (
    <div className="mt-3">
      <Field label="Validation status" hint="Only mark as kitchen-tested after you've cooked this version and confirmed it's safe and done.">
        {(fid) => (
          <Select id={fid} value={version.validation} onChange={(e) => void setVersionValidation(version.id, e.target.value as ValidationStatus)}>
            {Object.entries(VALIDATION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

function LogServingSheet({ open, onClose, recipeId, version }: { open: boolean; onClose: () => void; recipeId: string; version: RecipeVersion }) {
  const today = useToday();
  const [servings, setServings] = useState<number | null>(1);
  const [meal, setMeal] = useState('dinner');
  const [date, setDate] = useState(today);
  const toast = useToast();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log to food diary"
      footer={
        <Button
          className="w-full"
          disabled={!servings}
          onClick={async () => {
            await logRecipe({ recipeId, versionId: version.id, date, meal, servings: servings! });
            toast(`Logged ${servings} serving(s)`);
            onClose();
          }}
        >
          Log {servings} serving{servings === 1 ? '' : 's'}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Servings">{(fid) => <NumberInput id={fid} value={servings} onChange={setServings} step={0.25} min={0} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meal">
            {(fid) => (
              <Select id={fid} value={meal} onChange={(e) => setMeal(e.target.value)}>
                {DEFAULT_MEALS.map((m) => (
                  <option key={m} value={m}>
                    {mealLabel(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">{(fid) => <input id={fid} type="date" className="h-10 w-full rounded-lg border border-slate-300 px-2 dark:border-slate-700 dark:bg-slate-900" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <p className="text-xs text-slate-500">A snapshot of version {version.versionNumber}'s nutrition is saved with the entry.</p>
      </div>
    </Sheet>
  );
}

export function AddToPlanSheet({ open, onClose, recipeId, versionId, defaultServings }: { open: boolean; onClose: () => void; recipeId: string; versionId: string; defaultServings: number }) {
  const plans = useLiveQuery(() => db.mealPlans.orderBy('updatedAt').reverse().toArray(), []);
  const prefs = useLiveQuery(() => db.preferences.get('prefs'), []);
  const today = useToday();
  const [planId, setPlanId] = useState('');
  const [date, setDate] = useState<string>(today);
  const [servings, setServings] = useState<number | null>(defaultServings);
  const toast = useToast();
  const plan = plans?.find((p) => p.id === planId) ?? plans?.[0];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add to meal plan"
      footer={
        <Button
          className="w-full"
          onClick={async () => {
            let target = plan;
            if (!target) target = await createPlan({ name: `Week of ${formatDateKey(startOfWeek(today, prefs?.weekStartsOn ?? 1))}`, kind: 'dated', weekStart: startOfWeek(today, prefs?.weekStartsOn ?? 1) });
            await addPlanEntry(target.id, { date: target.kind === 'dated' ? date : null, slot: 'dinner', recipeId, recipeVersionId: versionId, servings: servings ?? defaultServings });
            toast(`Added to ${target.name}`);
            onClose();
          }}
        >
          Add
        </Button>
      }
    >
      <div className="space-y-3">
        {plans?.length ? (
          <Field label="Plan">
            {(fid) => (
              <Select id={fid} value={plan?.id} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <p className="text-sm text-slate-500">A plan for this week will be created.</p>
        )}
        {(!plan || plan.kind === 'dated') && <Field label="Date">{(fid) => <input id={fid} type="date" className="h-10 w-full rounded-lg border border-slate-300 px-2 dark:border-slate-700 dark:bg-slate-900" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>}
        <Field label="Servings">{(fid) => <NumberInput id={fid} value={servings} onChange={setServings} min={1} />}</Field>
      </div>
    </Sheet>
  );
}
