import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Copy, Minus, Plus, Save, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { db } from '../../db/db';
import { Button, Card, Input, NumberInput, PageHeader, Select, Sheet, Notice } from '../../components/ui';
import { MacroLine, TargetRow, useEnergy, QualityBadge, IncompleteMark } from '../../components/nutrition';
import { useToast } from '../../components/toast';
import { DEFAULT_MEALS, dailyTotals, entryQuantity, mealLabel, totalsByMeal, type FoodLogEntry } from '../../domain/nutrition/diary';
import { copyFromYesterday, deleteEntry, moveEntry, restoreEntry, saveMealFromEntries, setDayComplete, updatePortion } from '../../db/foodService';
import { addDays, relativeDayLabel, formatDateKey } from '../../lib/dates';
import { useToday, useTargetOn, usePrefs } from '../../hooks/data';
import { energyAllowance } from '../../domain/nutrition/targets';
import { formatNutrient } from '../../domain/nutrition/nutrients';

export function FoodDiaryPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });
  const entries = useLiveQuery(() => db.foodLog.where('date').equals(date).sortBy('createdAt'), [date]);
  const status = useLiveQuery(() => db.dayStatus.get(date), [date]);
  const cardio = useLiveQuery(() => db.cardio.where('date').equals(date).toArray(), [date]);
  const target = useTargetOn(date);
  const prefs = usePrefs();
  const toast = useToast();
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const { fmt, unit } = useEnergy();

  const totals = useMemo(() => dailyTotals(entries ?? []), [entries]);
  const byMeal = useMemo(() => totalsByMeal(entries ?? []), [entries]);
  const meals = useMemo(() => {
    const custom = [...new Set((entries ?? []).map((e) => e.meal))].filter((m) => !(DEFAULT_MEALS as readonly string[]).includes(m));
    return [...DEFAULT_MEALS, ...custom];
  }, [entries]);
  const exerciseKcal = (cardio ?? []).reduce((s, c) => s + (c.energyEstimate?.kcal ?? 0), 0);
  const allowance = energyAllowance(target ?? null, exerciseKcal, prefs?.addExerciseEnergy ?? false);
  const incomplete = (entries ?? []).some((e) => e.incomplete);

  const onCopy = async (meal: string) => {
    const n = await copyFromYesterday(date, meal);
    toast(n ? `Copied ${n} item(s) from yesterday's ${mealLabel(meal).toLowerCase()}` : `Nothing logged for ${mealLabel(meal).toLowerCase()} yesterday`);
  };
  const onDelete = async (e: FoodLogEntry) => {
    const removed = await deleteEntry(e.id);
    setEditing(null);
    toast(`Removed ${e.name}`, removed ? { label: 'Undo', onClick: () => void restoreEntry(removed) } : undefined);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Food diary" subtitle="FuelTracker" />
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <button className="flex-1 text-center" onClick={() => setDate(today)}>
          <div className="font-semibold">{relativeDayLabel(date, today)}</div>
          <div className="text-xs text-slate-500">{formatDateKey(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </button>
        <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <Card>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-slate-500">Logged intake</div>
            <div className="flex items-center gap-1 text-3xl font-bold tabular-nums" data-testid="day-kcal">
              {fmt(totals.values.energyKcal)} <span className="text-base font-medium text-slate-500">{unit}</span> <IncompleteMark show={incomplete} />
            </div>
          </div>
          <div className="text-right text-sm">
            {allowance.allowance != null ? (
              <>
                <div className="text-xs text-slate-500">Target{allowance.addedExerciseKcal ? ` (+${Math.round(allowance.addedExerciseKcal)} est. exercise)` : ''}</div>
                <div className="font-semibold tabular-nums">
                  {fmt(allowance.allowance)} {unit}
                </div>
                <div className={allowance.allowance - totals.values.energyKcal >= 0 ? 'text-xs text-slate-500' : 'text-xs text-red-600'}>
                  {allowance.allowance - totals.values.energyKcal >= 0 ? `${fmt(allowance.allowance - totals.values.energyKcal)} remaining` : `${fmt(totals.values.energyKcal - allowance.allowance)} over`}
                </div>
              </>
            ) : (
              <Link to="/settings#targets" className="text-brand-700 underline">
                Set targets
              </Link>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TargetRow label="Protein" value={totals.values.proteinG} target={target?.proteinG ?? null} unit="g" tone="lift" incomplete={totals.missing.proteinG > 0} />
          <TargetRow label="Carbohydrate" value={totals.values.carbsG} target={target?.carbsG ?? null} unit="g" tone="fuel" incomplete={totals.missing.carbsG > 0} />
          <TargetRow label="Fat" value={totals.values.fatG} target={target?.fatG ?? null} unit="g" tone="pantry" incomplete={totals.missing.fatG > 0} />
          <TargetRow label="Fibre" value={totals.values.fibreG} target={target?.fibreG ?? null} unit="g" tone="brand" incomplete={totals.missing.fibreG > 0} />
          <TargetRow label="Saturated fat" value={totals.values.satFatG} target={target?.satFatMaxG ?? null} unit="g" kind="max" incomplete={totals.missing.satFatG > 0} />
          <TargetRow label="Sodium" value={totals.values.sodiumMg} target={target?.sodiumMaxMg ?? null} unit="mg" kind="max" incomplete={totals.missing.sodiumMg > 0} />
        </div>
        {incomplete && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Some entries have unknown values, so totals are lower-bound estimates.</p>}
        <button className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" onClick={() => void setDayComplete(date, !status?.complete)}>
          {status?.complete ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5" />}
          {status?.complete ? 'Day marked as fully logged' : 'Mark day as fully logged'}
        </button>
      </Card>

      {meals.map((meal) => {
        const list = (entries ?? []).filter((e) => e.meal === meal);
        const mt = byMeal[meal];
        return (
          <Card key={meal} className="p-0">
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <div>
                <h2 className="font-semibold">{mealLabel(meal)}</h2>
                {mt && (
                  <div className="text-xs tabular-nums text-slate-500">
                    {fmt(mt.values.energyKcal)} {unit} · P {Math.round(mt.values.proteinG)} g
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                {list.length === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => void onCopy(meal)} title="Copy yesterday's meal">
                    <Copy className="h-4 w-4" /> Yesterday
                  </Button>
                )}
                {list.length > 0 && <SaveMealButton entries={list} meal={meal} />}
                <Link to={`/food/add?date=${date}&meal=${meal}`}>
                  <Button size="sm" aria-label={`Add to ${mealLabel(meal)}`}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </Link>
              </div>
            </div>
            {list.length > 0 && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {list.map((e) => (
                  <li key={e.id}>
                    <button className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setEditing(e)}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{e.name}</div>
                        <div className="truncate text-xs text-slate-500">{e.description}</div>
                      </div>
                      <MacroLine n={e.nutrients} incomplete={e.incomplete} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      <EntryEditor entry={editing} onClose={() => setEditing(null)} onDelete={onDelete} meals={meals} />
    </div>
  );
}

function SaveMealButton({ entries, meal }: { entries: FoodLogEntry[]; meal: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const toast = useToast();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Save as a reusable meal" aria-label="Save as meal">
        <Save className="h-4 w-4" />
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Save as meal"
        footer={
          <Button
            className="w-full"
            disabled={!name.trim()}
            onClick={async () => {
              await saveMealFromEntries(name.trim(), entries);
              setOpen(false);
              toast(`Saved "${name.trim()}"`);
            }}
          >
            Save meal
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-500">Saves these {entries.length} item(s) from {mealLabel(meal).toLowerCase()} so you can log them again in one tap.</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Usual breakfast" aria-label="Meal name" />
      </Sheet>
    </>
  );
}

function EntryEditor({ entry, onClose, onDelete, meals }: { entry: FoodLogEntry | null; onClose: () => void; onDelete: (e: FoodLogEntry) => void; meals: string[] }) {
  const [qty, setQty] = useState<number | null>(null);
  const [meal, setMeal] = useState<string>('');
  const current = entry ? entryQuantity(entry) : 1;
  const value = qty ?? current;
  const isFood = entry?.origin.type === 'food';
  const step = isFood ? 10 : 0.5;
  const unitLabel = entry?.origin.type === 'food' ? entry.origin.unit : entry?.origin.type === 'recipe' ? 'servings' : '×';
  const ratio = value / current;
  const close = () => {
    setQty(null);
    setMeal('');
    onClose();
  };
  if (!entry) return null;
  return (
    <Sheet
      open={!!entry}
      onClose={close}
      title={entry.name}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => onDelete(entry)} aria-label="Delete entry">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            className="flex-1"
            disabled={!(value > 0)}
            onClick={async () => {
              if (value !== current) await updatePortion(entry.id, value);
              if (meal && meal !== entry.meal) await moveEntry(entry.id, { meal });
              close();
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <QualityBadge quality={entry.quality} />
          {entry.origin.type === 'recipe' && <span className="text-slate-500">Logged from recipe version {entry.origin.versionNumber}. Later recipe edits don't change this entry.</span>}
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Portion ({unitLabel})</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Decrease portion" onClick={() => setQty(Math.max(step, Math.round((value - step) * 100) / 100))}>
              <Minus className="h-4 w-4" />
            </Button>
            <NumberInput value={value} onChange={(v) => setQty(v)} step={step} min={0} className="text-center text-lg" aria-label="Portion" />
            <Button variant="outline" size="icon" aria-label="Increase portion" onClick={() => setQty(Math.round((value + step) * 100) / 100)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Meal</div>
          <Select value={meal || entry.meal} onChange={(e) => setMeal(e.target.value)} aria-label="Meal">
            {meals.map((m) => (
              <option key={m} value={m}>
                {mealLabel(m)}
              </option>
            ))}
          </Select>
        </div>
        <Notice>
          New totals: {formatNutrient('energyKcal', entry.nutrients.energyKcal != null ? entry.nutrients.energyKcal * ratio : null)} kcal · protein {formatNutrient('proteinG', entry.nutrients.proteinG != null ? entry.nutrients.proteinG * ratio : null)}
        </Notice>
      </div>
    </Sheet>
  );
}
