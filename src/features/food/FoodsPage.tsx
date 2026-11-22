import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Search, Star, Trash2, Upload } from 'lucide-react';
import { db } from '../../db/db';
import { Button, Card, Field, Input, NumberInput, PageHeader, Select, Notice, Checkbox } from '../../components/ui';
import { MacroLine, QualityBadge } from '../../components/nutrition';
import { useToast } from '../../components/toast';
import { parseFoodCsv, saveFood } from '../../db/foodService';
import { atwaterKcal, NUTRIENT_KEYS, NUTRIENT_META, unknownNutrients, type Nutrients } from '../../domain/nutrition/nutrients';
import type { Food, FoodServing } from '../../domain/nutrition/foods';
import type { DataQuality } from '../../domain/shared/provenance';
import { newId } from '../../lib/id';
import { formatDateKey, isoToDateKey } from '../../lib/dates';

export function FoodsPage() {
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), []);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Food['kind']>('all');
  const toast = useToast();
  const list = useMemo(() => (foods ?? []).filter((f) => !f.archived && (kind === 'all' || f.kind === kind) && `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(q.toLowerCase())), [foods, q, kind]);

  const onCsv = async (file: File) => {
    const { foods: parsed, errors } = parseFoodCsv(await file.text());
    for (const f of parsed) await saveFood(f);
    await db.importRecords.add({ id: newId('imp'), kind: 'food-csv', at: new Date().toISOString(), fileName: file.name, counts: { foods: parsed.length }, notes: errors.join('; ') });
    toast(`Imported ${parsed.length} food(s)${errors.length ? `, ${errors.length} line(s) skipped` : ''}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Food database"
        subtitle={`${foods?.length ?? 0} foods stored on this device`}
        actions={
          <>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium dark:border-slate-700">
              <Upload className="h-4 w-4" /> Import CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void onCsv(e.target.files[0])} />
            </label>
            <Link to="/foods/new">
              <Button>
                <Plus className="h-4 w-4" /> New food
              </Button>
            </Link>
          </>
        }
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" aria-label="Search foods" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-32" aria-label="Filter">
          <option value="all">All</option>
          <option value="generic">Generic</option>
          <option value="branded">Branded</option>
          <option value="user">My foods</option>
        </Select>
      </div>
      <Card className="p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((f) => (
            <li key={f.id}>
              <Link to={`/foods/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    {f.favourite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    {f.name}
                    {f.brand && <span className="text-slate-500">· {f.brand}</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    per 100 {f.basis}: <MacroLine n={f.per100} incomplete={f.per100.energyKcal == null} />
                  </div>
                </div>
                <QualityBadge quality={f.quality} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-slate-500">CSV columns: name, brand, kcal, protein, carbs, fat, satfat, fibre, sugars, sodium (per 100 g). Empty cells are stored as unknown.</p>
    </div>
  );
}

export function FoodEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const existing = useLiveQuery(() => (id && id !== 'new' ? db.foods.get(id) : undefined), [id]);
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(params.get('name') ?? '');
  const [brand, setBrand] = useState('');
  const [basis, setBasis] = useState<'g' | 'ml'>('g');
  const [per, setPer] = useState<Nutrients>(unknownNutrients());
  const [servings, setServings] = useState<FoodServing[]>([]);
  const [quality, setQuality] = useState<DataQuality>('label');
  const [entryMode, setEntryMode] = useState<'per100' | 'perServing'>('per100');
  const [servingSize, setServingSize] = useState<number | null>(null);
  const [favourite, setFavourite] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (existing && !loaded) {
      setName(existing.name);
      setBrand(existing.brand ?? '');
      setBasis(existing.basis);
      setPer(existing.per100);
      setServings(existing.servings);
      setQuality(existing.quality);
      setFavourite(existing.favourite);
      setLoaded(true);
    }
  }, [existing, loaded]);

  const display = entryMode === 'per100' || !servingSize ? per : Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, per[k] == null ? null : Math.round(((per[k]! * servingSize) / 100) * 10) / 10])) as Nutrients;
  const setValue = (k: keyof Nutrients, v: number | null) => setPer((p) => ({ ...p, [k]: v == null ? null : entryMode === 'per100' || !servingSize ? v : (v * 100) / servingSize }));
  const atw = atwaterKcal(per);
  const mismatch = atw != null && per.energyKcal != null && per.energyKcal > 20 && Math.abs(atw - per.energyKcal) / per.energyKcal > 0.2;

  const save = async () => {
    const extra = entryMode === 'perServing' && servingSize && !servings.some((s) => s.amount === servingSize) ? [{ id: newId('sv'), label: `1 serving (${servingSize} ${basis})`, amount: servingSize }] : [];
    const all = [...servings.filter((s) => s.label && s.amount > 0), ...extra];
    const f = await saveFood({
      id: existing?.id,
      name: name.trim(),
      brand: brand.trim() || undefined,
      kind: existing?.kind === 'generic' ? 'generic' : brand.trim() ? 'branded' : 'user',
      basis,
      per100: per,
      servings: all,
      defaultServingId: all[0]?.id,
      source: existing && existing.quality === quality ? existing.source : { kind: quality === 'label' ? 'label' : 'user', name: quality === 'label' ? 'Nutrition information panel' : 'Entered by user' },
      quality,
      favourite,
      archived: false
    });
    toast(`Saved ${f.name}`);
    navigate(-1);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={existing ? 'Edit food' : 'New food'} back={<Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>} />
      {existing && (
        <Notice>
          Editing a food updates future logging and recipe calculations. Past diary entries keep the values they were logged with. Last updated {formatDateKey(isoToDateKey(existing.updatedAt))}.
        </Notice>
      )}
      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Brand (optional)">{(id) => <Input id={id} value={brand} onChange={(e) => setBrand(e.target.value)} />}</Field>
          <Field label="Measured in">
            {(id) => (
              <Select id={id} value={basis} onChange={(e) => setBasis(e.target.value as 'g' | 'ml')}>
                <option value="g">grams (per 100 g)</option>
                <option value="ml">millilitres (per 100 ml)</option>
              </Select>
            )}
          </Field>
          <Field label="Data source">
            {(id) => (
              <Select id={id} value={quality} onChange={(e) => setQuality(e.target.value as DataQuality)}>
                <option value="label">Food label</option>
                <option value="reference">Reference database</option>
                <option value="user">My own estimate / other</option>
                <option value="unknown">Unknown</option>
              </Select>
            )}
          </Field>
        </div>
        <Checkbox checked={favourite} onChange={setFavourite} label="Favourite (shown first in search)" />
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Nutrition</h2>
          <Select value={entryMode} onChange={(e) => setEntryMode(e.target.value as typeof entryMode)} className="w-48" aria-label="Entry mode">
            <option value="per100">Per 100 {basis}</option>
            <option value="perServing">Per serving (label column)</option>
          </Select>
        </div>
        {entryMode === 'perServing' && <Field label={`Serving size (${basis})`}>{(id) => <NumberInput id={id} value={servingSize} onChange={setServingSize} min={0} />}</Field>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {NUTRIENT_KEYS.map((k) => (
            <Field key={k} label={`${NUTRIENT_META[k].label} (${NUTRIENT_META[k].unit})`}>{(id) => <NumberInput id={id} value={display[k]} onChange={(v) => setValue(k, v)} min={0} step={0.1} placeholder="unknown" />}</Field>
          ))}
        </div>
        <p className="text-xs text-slate-500">Leave a value blank if it isn't on the label — it will be shown as unknown rather than zero.</p>
        {mismatch && <Notice tone="warn">Energy differs from protein/carbs/fat by more than 20% ({Math.round(atw!)} kcal by 4/4/9). Check for a typo (or kJ entered as kcal).</Notice>}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Serving sizes</h2>
          <Button variant="outline" size="sm" onClick={() => setServings((s) => [...s, { id: newId('sv'), label: '', amount: 0 }])}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {servings.map((s, i) => (
          <div key={s.id} className="flex gap-2">
            <Input value={s.label} placeholder="e.g. 1 pottle" onChange={(e) => setServings((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Serving label" />
            <NumberInput value={s.amount || null} onChange={(v) => setServings((list) => list.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} className="w-28" placeholder={basis} aria-label="Serving amount" />
            <Button variant="ghost" size="icon" aria-label="Remove serving" onClick={() => setServings((list) => list.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </Card>

      <div className="flex gap-2">
        <Button size="lg" className="flex-1" disabled={!name.trim()} onClick={() => void save()}>
          Save food
        </Button>
        {existing && (
          <Button
            size="lg"
            variant="outline"
            onClick={async () => {
              await db.foods.update(existing.id, { archived: true });
              toast('Food archived');
              navigate('/foods');
            }}
          >
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
