import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import { Button, Card, Checkbox, Field, Input, NumberInput, PageHeader, Select, Sheet, Textarea, Notice } from '../../components/ui';
import { MacroLine } from '../../components/nutrition';
import { useToast } from '../../components/toast';
import { useNutritionLookup, usePrefs } from '../../hooks/data';
import { calculateRecipeNutrition } from '../../domain/recipes/nutrition';
import { contentOf, diffVersions, type VersionContent } from '../../domain/recipes/versions';
import { suggestedMeatGrams } from '../../domain/recipes/scaling';
import { APPLIANCE_LABEL, APPLIANCES, GROCERY_CATEGORIES, INGREDIENT_ROLES, type GroceryCategory, type IngredientRole, type RecipeIngredient, type RecipeStep } from '../../domain/recipes/types';
import { createRecipe, updateRecipe, type RecipeDraft } from '../../db/recipeService';
import { ALL_UNITS, type QuantityUnit } from '../../lib/units';
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';

const emptyContent = (servings: number): VersionContent => ({ servings, prepMinutes: 10, cookMinutes: 30, ingredients: [], appliances: ['stovetop'], equipment: [], steps: [], validation: 'experimental', changeSummary: 'Initial version', changeReason: '' });

export function RecipeEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = !id || id === 'new';
  const recipe = useLiveQuery(() => (isNew ? undefined : db.recipes.get(id!)), [id]);
  const fromVersion = useLiveQuery(() => (recipe ? db.recipeVersions.get(params.get('from') ?? recipe.currentVersionId) : undefined), [recipe, params]);
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []);
  const prefs = usePrefs();
  const lookup = useNutritionLookup();
  const navigate = useNavigate();
  const toast = useToast();
  const [meta, setMeta] = useState<RecipeDraft['meta']>({ name: '', description: '', cuisine: '', category: 'Main', tags: [], dietary: [] });
  const [content, setContent] = useState<VersionContent | null>(null);
  const [newIng, setNewIng] = useState<{ rowId: string; name: string } | null>(null);

  useEffect(() => {
    if (content) return;
    if (isNew && prefs) setContent(emptyContent(prefs.defaultServings));
    if (recipe && fromVersion) {
      setMeta({ name: recipe.name, description: recipe.description, cuisine: recipe.cuisine, category: recipe.category, tags: recipe.tags, dietary: recipe.dietary });
      setContent({ ...contentOf(fromVersion), changeSummary: '', changeReason: '' });
    }
  }, [isNew, prefs, recipe, fromVersion, content]);

  const nutrition = useMemo(() => (content && lookup ? calculateRecipeNutrition(content, lookup) : null), [content, lookup]);
  if (!content || !ingredients) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const ingName = (iid: string) => ingredients.find((i) => i.id === iid)?.name ?? iid;
  const changes = fromVersion ? diffVersions(fromVersion, content, ingName) : [];
  const meatTotal = content.ingredients.filter((ri) => ingredients.find((i) => i.id === ri.ingredientId)?.tags.includes('meat') && ri.unit === 'g').reduce((s, ri) => s + ri.quantity, 0);
  const meatSuggestion = suggestedMeatGrams(content.servings, prefs?.meatGramsPerFourServings ?? 500);

  const setIng = (i: number, patch: Partial<RecipeIngredient>) => setContent({ ...content, ingredients: content.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setStep = (i: number, patch: Partial<RecipeStep>) => setContent({ ...content, steps: content.steps.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const moveStep = (i: number, d: -1 | 1) => {
    const list = [...content.steps];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setContent({ ...content, steps: list });
  };

  const save = async () => {
    const clean = { ...content, steps: content.steps.filter((s) => s.text.trim()), ingredients: content.ingredients.filter((i) => i.ingredientId) };
    if (isNew) {
      const r = await createRecipe({ meta, content: clean });
      toast('Recipe created');
      navigate(`/recipes/${r.id}`);
    } else {
      const { newVersion } = await updateRecipe(recipe!.id, { meta, content: { ...clean, changeSummary: clean.changeSummary || changes.join('; ') || 'Edited' } }, fromVersion!.id);
      toast(newVersion ? `Saved as version ${newVersion.versionNumber}` : 'Details saved (method unchanged)');
      navigate(`/recipes/${recipe!.id}`);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={isNew ? 'New recipe' : `Edit ${recipe?.name ?? ''}`} back={<Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>} />
      {!isNew && <Notice>Saving changes to ingredients, servings, appliances or steps creates version {fromVersion ? '(new)' : ''} — earlier versions and diary entries are kept unchanged.</Notice>}
      <Card className="space-y-3">
        <Field label="Name">{(fid) => <Input id={fid} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />}</Field>
        <Field label="Description">{(fid) => <Textarea id={fid} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Cuisine">{(fid) => <Input id={fid} value={meta.cuisine} onChange={(e) => setMeta({ ...meta, cuisine: e.target.value })} />}</Field>
          <Field label="Category">{(fid) => <Input id={fid} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} />}</Field>
          <Field label="Tags">{(fid) => <Input id={fid} value={meta.tags.join(', ')} onChange={(e) => setMeta({ ...meta, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="comma separated" />}</Field>
          <Field label="Dietary">{(fid) => <Input id={fid} value={meta.dietary.join(', ')} onChange={(e) => setMeta({ ...meta, dietary: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. dairy-free" />}</Field>
          <Field label="Servings">{(fid) => <NumberInput id={fid} value={content.servings} onChange={(v) => setContent({ ...content, servings: Math.max(1, v ?? 1) })} min={1} />}</Field>
          <Field label="Prep (min)">{(fid) => <NumberInput id={fid} value={content.prepMinutes} onChange={(v) => setContent({ ...content, prepMinutes: v ?? 0 })} min={0} />}</Field>
          <Field label="Cook (min)">{(fid) => <NumberInput id={fid} value={content.cookMinutes} onChange={(v) => setContent({ ...content, cookMinutes: v ?? 0 })} min={0} />}</Field>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Appliances</div>
          <div className="flex flex-wrap gap-2">
            {APPLIANCES.map((a) => (
              <Checkbox key={a} checked={content.appliances.includes(a)} onChange={(on) => setContent({ ...content, appliances: on ? [...content.appliances, a] : content.appliances.filter((x) => x !== a) })} label={APPLIANCE_LABEL[a]} />
            ))}
          </div>
        </div>
        <Field label="Other equipment (comma separated)">{(fid) => <Input id={fid} value={content.equipment.join(', ')} onChange={(e) => setContent({ ...content, equipment: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />}</Field>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Ingredients</h2>
          {nutrition && <MacroLine n={nutrition.perServing} incomplete={!nutrition.complete} />}
        </div>
        {meatTotal > 0 && Math.abs(meatTotal - meatSuggestion) > meatSuggestion * 0.25 && <p className="text-xs text-slate-500">Your default is about {meatSuggestion} g meat for {content.servings} servings; this recipe has {meatTotal} g.</p>}
        {content.ingredients.map((ri, i) => (
          <div key={ri.id} className="grid grid-cols-[1fr_5rem_5.5rem_2.5rem] gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-[1fr_5rem_5.5rem_7rem_8rem_auto_2.5rem]">
            <Select
              value={ri.ingredientId}
              onChange={(e) => (e.target.value === '__new' ? setNewIng({ rowId: ri.id, name: '' }) : setIng(i, { ingredientId: e.target.value }))}
              aria-label="Ingredient"
              className="col-span-4 sm:col-span-1"
            >
              <option value="">Choose ingredient…</option>
              {ingredients.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              <option value="__new">+ New ingredient…</option>
            </Select>
            <NumberInput value={ri.quantity} onChange={(v) => setIng(i, { quantity: v ?? 0 })} step={0.25} min={0} aria-label="Quantity" />
            <Select value={ri.unit} onChange={(e) => setIng(i, { unit: e.target.value as QuantityUnit })} aria-label="Unit">
              {ALL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
            <Select value={ri.role} onChange={(e) => setIng(i, { role: e.target.value as IngredientRole })} aria-label="Role" className="hidden sm:block">
              {INGREDIENT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Input value={ri.preparation} onChange={(e) => setIng(i, { preparation: e.target.value })} placeholder="prep" aria-label="Preparation" className="col-span-3 sm:col-span-1" />
            <Checkbox checked={ri.optional} onChange={(v) => setIng(i, { optional: v })} label="opt." className="hidden sm:flex" />
            <Button variant="ghost" size="icon" aria-label="Remove ingredient" onClick={() => setContent({ ...content, ingredients: content.ingredients.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" aria-label="Add ingredient" onClick={() => setContent({ ...content, ingredients: [...content.ingredients, { id: newId('ri'), ingredientId: '', quantity: 100, unit: 'g', preparation: '', optional: false, role: 'other' }] })}>
          <Plus className="h-4 w-4" /> Ingredient
        </Button>
        {nutrition && nutrition.issues.length > 0 && (
          <Notice tone="warn" className="text-xs">
            Nutrition incomplete: {nutrition.issues.map((i) => `${i.ingredientName} — ${i.reason}`).join('; ')}
          </Notice>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Method</h2>
        {content.steps.map((s, i) => (
          <div key={s.id} className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <div className="flex items-start gap-2">
              <span className="pt-2 text-sm font-semibold">{i + 1}.</span>
              <Textarea value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} aria-label={`Step ${i + 1}`} className="min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_7rem_1fr_auto]">
              <Select value={s.appliance ?? ''} onChange={(e) => setStep(i, { appliance: (e.target.value || null) as RecipeStep['appliance'] })} aria-label="Step appliance">
                <option value="">No appliance</option>
                {content.appliances.map((a) => (
                  <option key={a} value={a}>
                    {APPLIANCE_LABEL[a]}
                  </option>
                ))}
              </Select>
              <NumberInput value={s.timerMinutes} onChange={(v) => setStep(i, { timerMinutes: v })} min={0} placeholder="timer min" aria-label="Timer minutes" />
              <Input value={s.safetyNote ?? ''} onChange={(e) => setStep(i, { safetyNote: e.target.value || null })} placeholder="Safety note (optional)" aria-label="Safety note" className="col-span-2 sm:col-span-1" />
              <div className="flex">
                <Button variant="ghost" size="icon" aria-label="Move step up" onClick={() => moveStep(i, -1)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move step down" onClick={() => moveStep(i, 1)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Remove step" onClick={() => setContent({ ...content, steps: content.steps.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" aria-label="Add step" onClick={() => setContent({ ...content, steps: [...content.steps, { id: newId('st'), text: '', appliance: content.appliances[0] ?? null, timerMinutes: null, safetyNote: null }] })}>
          <Plus className="h-4 w-4" /> Step
        </Button>
        <p className="text-xs text-slate-500">Write cooking times from a source you trust or your own testing. FormLab never generates cooking times.</p>
      </Card>

      {!isNew && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Change summary</h2>
          {changes.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <Input value={content.changeSummary} onChange={(e) => setContent({ ...content, changeSummary: e.target.value })} placeholder="Summary (optional — auto-generated if blank)" aria-label="Change summary" />
          <Input value={content.changeReason} onChange={(e) => setContent({ ...content, changeReason: e.target.value })} placeholder="Reason for change (optional)" aria-label="Reason" />
        </Card>
      )}

      <Button size="lg" className="w-full" disabled={!meta.name.trim()} onClick={() => void save()}>
        {isNew ? 'Create recipe' : 'Save'}
      </Button>

      <NewIngredientSheet
        state={newIng}
        onClose={() => setNewIng(null)}
        onCreated={(ingId) => {
          const idx = content.ingredients.findIndex((x) => x.id === newIng?.rowId);
          if (idx >= 0) setIng(idx, { ingredientId: ingId });
          setNewIng(null);
        }}
      />
    </div>
  );
}

function NewIngredientSheet({ state, onClose, onCreated }: { state: { rowId: string; name: string } | null; onClose: () => void; onCreated: (id: string) => void }) {
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), []);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroceryCategory>('Produce');
  const [foodId, setFoodId] = useState('');
  const [each, setEach] = useState<number | null>(null);
  const [density, setDensity] = useState<number | null>(null);
  const [tags, setTags] = useState('');
  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      title="New ingredient"
      footer={
        <Button
          className="w-full"
          disabled={!name.trim()}
          onClick={async () => {
            const id = newId('ing');
            const now = nowIso();
            await db.ingredients.add({ id, name: name.trim(), foodId: foodId || null, category, densityGPerMl: density, unitWeightsG: each ? { each } : {}, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), packageSize: null, packagePriceNZD: null, priceUpdatedAt: null, createdAt: now, updatedAt: now });
            onCreated(id);
          }}
        >
          Create ingredient
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Name">{(fid) => <Input id={fid} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Nutrition source (food)" hint="Link a food so recipes can calculate nutrition. Leave blank if unknown — the recipe will show as incomplete.">
          {(fid) => (
            <Select id={fid} value={foodId} onChange={(e) => setFoodId(e.target.value)}>
              <option value="">No nutrition data</option>
              {(foods ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Supermarket category">
          {(fid) => (
            <Select id={fid} value={category} onChange={(e) => setCategory(e.target.value as GroceryCategory)}>
              {GROCERY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight of one (g)" hint="for 'each' quantities">{(fid) => <NumberInput id={fid} value={each} onChange={setEach} min={0} />}</Field>
          <Field label="Density (g/ml)" hint="for spoon/cup quantities">{(fid) => <NumberInput id={fid} value={density} onChange={setDensity} step={0.01} min={0} />}</Field>
        </div>
        <Field label="Tags" hint="e.g. meat, poultry, seafood, dairy, liquid, spice">{(fid) => <Input id={fid} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
