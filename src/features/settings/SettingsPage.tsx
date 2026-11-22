import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Upload, ShieldCheck, Trash2, Plus, Bell } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Checkbox, Field, Input, NumberInput, PageHeader, Select, Notice } from '../../components/ui';
import { useToast } from '../../components/toast';
import { updatePrefs, usePrefs, useToday, useTargetOn } from '../../hooks/data';
import { ACTIVITY_LEVELS, estimateEnergy, MAX_DEFICIT_FRACTION, type ActivityLevel } from '../../domain/nutrition/targets';
import { APPLIANCE_LABEL, APPLIANCES } from '../../domain/recipes/types';
import { FITNESS_GOAL_LABEL, type Preferences } from '../../domain/shared/preferences';
import { downloadJson, downloadText, exportBackup, foodDiaryCsv, restoreBackup, validateBackup, workoutsCsv } from '../../db/backup';
import { latestBodyweightKg } from '../../db/workoutService';
import { requestNotificationPermission } from '../workouts/restTimer';
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';
import { formatDateKey, isoToDateKey } from '../../lib/dates';
import { kgToLb, lbToKg } from '../../lib/units';

export function SettingsPage() {
  const prefs = usePrefs();
  if (!prefs) return null;
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="All data stays on this device unless you export it." />
      <TargetsSection />
      <EstimatorSection prefs={prefs} />
      <GoalsSection prefs={prefs} />
      <FoodPrefsSection prefs={prefs} />
      <TrainingSection prefs={prefs} />
      <RemindersSection prefs={prefs} />
      <DataSection />
    </div>
  );
}

function TargetsSection() {
  const today = useToday();
  const current = useTargetOn(today);
  const history = useLiveQuery(() => db.targets.orderBy('effectiveFrom').reverse().toArray(), []);
  const toast = useToast();
  const [t, setT] = useState({ energyKcal: null as number | null, energyMinKcal: null as number | null, energyMaxKcal: null as number | null, proteinG: null as number | null, carbsG: null as number | null, fatG: null as number | null, fibreG: null as number | null, satFatMaxG: null as number | null, sodiumMaxMg: null as number | null });
  const [from, setFrom] = useState(today);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (current && !loaded) {
      setT({ energyKcal: current.energyKcal, energyMinKcal: current.energyMinKcal, energyMaxKcal: current.energyMaxKcal, proteinG: current.proteinG, carbsG: current.carbsG, fatG: current.fatG, fibreG: current.fibreG, satFatMaxG: current.satFatMaxG, sodiumMaxMg: current.sodiumMaxMg });
      setLoaded(true);
    }
  }, [current, loaded]);
  const f = (k: keyof typeof t, label: string, step = 1) => <Field label={label}>{(id) => <NumberInput id={id} value={t[k]} onChange={(v) => setT({ ...t, [k]: v })} step={step} min={0} placeholder="none" />}</Field>;
  return (
    <Card id="targets" className="space-y-3">
      <CardTitle>Daily nutrition targets</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {f('energyKcal', 'Energy (kcal)', 10)}
        {f('energyMinKcal', 'Range min (kcal)', 10)}
        {f('energyMaxKcal', 'Range max (kcal)', 10)}
        {f('proteinG', 'Protein (g)')}
        {f('carbsG', 'Carbohydrate (g)')}
        {f('fatG', 'Fat (g)')}
        {f('fibreG', 'Fibre (g)')}
        {f('satFatMaxG', 'Saturated fat max (g)')}
        {f('sodiumMaxMg', 'Sodium max (mg)', 50)}
      </div>
      <Field label="Effective from" hint="Earlier days keep their previous target, so past adherence isn't rewritten.">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
      <Button
        onClick={async () => {
          await db.targets.add({ id: newId('tgt'), effectiveFrom: from, ...t, basis: 'manual', notes: '', createdAt: nowIso() });
          toast('Targets saved');
        }}
      >
        Save targets
      </Button>
      {(history ?? []).length > 0 && (
        <details className="text-xs text-slate-500">
          <summary>Target history ({history!.length})</summary>
          <ul className="mt-1 space-y-1">
            {history!.map((h) => (
              <li key={h.id}>
                From {formatDateKey(h.effectiveFrom)}: {h.energyKcal ?? '—'} kcal, {h.proteinG ?? '—'} g protein ({h.basis})
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function EstimatorSection({ prefs }: { prefs: Preferences }) {
  const today = useToday();
  const toast = useToast();
  const [bw, setBw] = useState<number | null>(null);
  const p = prefs.energyProfile;
  const [sex, setSex] = useState<'male' | 'female'>(p?.sex ?? 'female');
  const [birthYear, setBirthYear] = useState<number | null>(p?.birthYear ?? null);
  const [height, setHeight] = useState<number | null>(p?.heightCm ?? null);
  const [activity, setActivity] = useState<ActivityLevel>(p?.activity ?? 'light');
  const [deficit, setDeficit] = useState(0);
  useEffect(() => void latestBodyweightKg().then(setBw), []);
  const age = birthYear ? new Date().getFullYear() - birthYear : null;
  const est = age && height && bw ? estimateEnergy({ sex, ageYears: age, heightCm: height, weightKg: bw, activity }, deficit / 100) : null;
  return (
    <Card className="space-y-3">
      <CardTitle>Energy requirement estimator</CardTitle>
      <Notice className="text-xs">Uses the Mifflin–St Jeor equation × an activity factor. It is a population estimate (often ±10–20% for individuals), not a prescription. Activity is already included, so exercise energy is not added on top for estimator-based targets.</Notice>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Sex (for the equation)">
          {(id) => (
            <Select id={id} value={sex} onChange={(e) => setSex(e.target.value as 'male' | 'female')}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </Select>
          )}
        </Field>
        <Field label="Birth year">{(id) => <NumberInput id={id} value={birthYear} onChange={setBirthYear} min={1900} />}</Field>
        <Field label="Height (cm)">{(id) => <NumberInput id={id} value={height} onChange={setHeight} min={50} />}</Field>
        <Field label="Weight (kg)" hint="From your latest weigh-in">{(id) => <NumberInput id={id} value={bw} onChange={setBw} step={0.1} min={20} />}</Field>
      </div>
      <Field label="Activity level">
        {(id) => (
          <Select id={id} value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} (×{v.factor})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={`Deficit: ${deficit}% (max ${MAX_DEFICIT_FRACTION * 100}%)`}>{(id) => <input id={id} type="range" min={0} max={MAX_DEFICIT_FRACTION * 100} step={5} value={deficit} onChange={(e) => setDeficit(Number(e.target.value))} className="w-full accent-brand-700" />}</Field>
      {est ? (
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <div>
            Estimated resting energy: <strong>{est.bmr} kcal</strong> · maintenance: <strong>{est.maintenance} kcal</strong>
          </div>
          <div>
            Suggested intake: <strong>{est.suggested} kcal</strong> {est.deficitKcal > 0 && `(≈${est.deficitKcal} kcal below estimated maintenance)`}
          </div>
          {est.warnings.map((w) => (
            <div key={w} className="text-amber-700">
              {w}
            </div>
          ))}
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              await updatePrefs({ energyProfile: { sex, birthYear: birthYear!, heightCm: height!, activity } });
              const cur = await db.targets.orderBy('effectiveFrom').last();
              await db.targets.add({ id: newId('tgt'), effectiveFrom: today, energyKcal: est.suggested, energyMinKcal: null, energyMaxKcal: null, proteinG: cur?.proteinG ?? null, carbsG: cur?.carbsG ?? null, fatG: cur?.fatG ?? null, fibreG: cur?.fibreG ?? null, satFatMaxG: cur?.satFatMaxG ?? null, sodiumMaxMg: cur?.sodiumMaxMg ?? null, basis: 'estimator', notes: `Mifflin–St Jeor, ${activity}, ${deficit}% deficit`, createdAt: nowIso() });
              toast('Energy target set from estimate');
            }}
          >
            Use as my energy target
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Enter birth year, height and weight to calculate. Nothing is pre-filled.</p>
      )}
    </Card>
  );
}

function GoalsSection({ prefs }: { prefs: Preferences }) {
  const unit = prefs.massUnit;
  return (
    <Card className="space-y-3">
      <CardTitle>Fitness goals</CardTitle>
      {prefs.goals.map((g, i) => (
        <div key={g.id} className="flex items-center gap-3">
          <Checkbox checked={g.enabled} onChange={(v) => void updatePrefs({ goals: prefs.goals.map((x, j) => (j === i ? { ...x, enabled: v } : x)) })} label={FITNESS_GOAL_LABEL[g.id]} className="flex-1" />
          {g.id === 'consistency' && <NumberInput value={g.target} onChange={(v) => void updatePrefs({ goals: prefs.goals.map((x, j) => (j === i ? { ...x, target: v } : x)) })} className="h-8 w-20" aria-label="Sessions per week" />}
          {g.id === 'consistency' && <span className="text-xs text-slate-500">sessions/wk</span>}
        </div>
      ))}
      <Field label={`Goal body weight (${unit}, optional)`}>{(id) => <NumberInput id={id} value={prefs.goalWeightKg != null ? Math.round((unit === 'kg' ? prefs.goalWeightKg : kgToLb(prefs.goalWeightKg)) * 10) / 10 : null} onChange={(v) => void updatePrefs({ goalWeightKg: v == null ? null : unit === 'kg' ? v : lbToKg(v) })} step={0.5} min={0} />}</Field>
    </Card>
  );
}

const COMMON_EXCLUSIONS = ['seafood', 'green-lentil', 'brown-lentil', 'red-meat', 'poultry', 'dairy', 'gluten', 'egg', 'soy', 'chilli', 'mushroom'];

function FoodPrefsSection({ prefs }: { prefs: Preferences }) {
  const [custom, setCustom] = useState('');
  return (
    <Card className="space-y-3">
      <CardTitle>Food & cooking preferences</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Energy unit">
          {(id) => (
            <Select id={id} value={prefs.energyUnit} onChange={(e) => void updatePrefs({ energyUnit: e.target.value as 'kcal' | 'kJ' })}>
              <option value="kcal">kcal</option>
              <option value="kJ">kJ</option>
            </Select>
          )}
        </Field>
        <Field label="Body weight unit">
          {(id) => (
            <Select id={id} value={prefs.massUnit} onChange={(e) => void updatePrefs({ massUnit: e.target.value as 'kg' | 'lb' })}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </Select>
          )}
        </Field>
        <Field label="Week starts">
          {(id) => (
            <Select id={id} value={prefs.weekStartsOn} onChange={(e) => void updatePrefs({ weekStartsOn: Number(e.target.value) })}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
              <option value={6}>Saturday</option>
            </Select>
          )}
        </Field>
        <Field label="Default servings">{(id) => <NumberInput id={id} value={prefs.defaultServings} onChange={(v) => v && void updatePrefs({ defaultServings: v })} min={1} />}</Field>
        <Field label="Meat per 4 servings (g)">{(id) => <NumberInput id={id} value={prefs.meatGramsPerFourServings} onChange={(v) => v && void updatePrefs({ meatGramsPerFourServings: v })} step={50} min={0} />}</Field>
        <Field label="Max cooking time (min)">{(id) => <NumberInput id={id} value={prefs.maxCookMinutes} onChange={(v) => void updatePrefs({ maxCookMinutes: v })} min={0} placeholder="any" />}</Field>
        <Field label="Weekly food budget (NZ$)">{(id) => <NumberInput id={id} value={prefs.weeklyFoodBudgetNZD} onChange={(v) => void updatePrefs({ weeklyFoodBudgetNZD: v })} min={0} placeholder="none" />}</Field>
        <Field label="Max cost per serving (NZ$)">{(id) => <NumberInput id={id} value={prefs.maxCostPerServingNZD} onChange={(v) => void updatePrefs({ maxCostPerServingNZD: v })} step={0.5} min={0} placeholder="none" />}</Field>
        <Field label="Min protein per serving (g)">{(id) => <NumberInput id={id} value={prefs.minProteinPerServingG} onChange={(v) => void updatePrefs({ minProteinPerServingG: v })} min={0} placeholder="none" />}</Field>
        <Field label="Max sat fat per serving (g)">{(id) => <NumberInput id={id} value={prefs.maxSatFatPerServingG} onChange={(v) => void updatePrefs({ maxSatFatPerServingG: v })} min={0} placeholder="none" />}</Field>
      </div>
      <Checkbox checked={prefs.lactoseFree} onChange={(v) => void updatePrefs({ lactoseFree: v })} label="Prefer lactose-free dairy" />
      <Checkbox checked={prefs.addExerciseEnergy} onChange={(v) => void updatePrefs({ addExerciseEnergy: v })} label="Add estimated exercise energy to my daily allowance (manual targets only)" />
      <div>
        <div className="mb-1 text-sm font-medium">Excluded ingredients / attributes</div>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...COMMON_EXCLUSIONS, ...prefs.excludedTags])].map((t) => {
            const on = prefs.excludedTags.includes(t);
            return (
              <button key={t} onClick={() => void updatePrefs({ excludedTags: on ? prefs.excludedTags.filter((x) => x !== t) : [...prefs.excludedTags, t] })} className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'border-slate-300 dark:border-slate-700'}`} aria-pressed={on}>
                {on ? '✕ ' : ''}
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add tag (matches ingredient tags)" aria-label="Custom exclusion" />
          <Button variant="outline" disabled={!custom.trim()} onClick={() => { void updatePrefs({ excludedTags: [...prefs.excludedTags, custom.trim().toLowerCase()] }); setCustom(''); }}>
            Add
          </Button>
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-medium">Appliances I have</div>
        <div className="grid grid-cols-2 gap-2">
          {APPLIANCES.map((a) => (
            <Checkbox key={a} checked={prefs.appliances.includes(a)} onChange={(v) => void updatePrefs({ appliances: v ? [...prefs.appliances, a] : prefs.appliances.filter((x) => x !== a) })} label={APPLIANCE_LABEL[a]} />
          ))}
        </div>
      </div>
      <ApplianceProfiles />
    </Card>
  );
}

function ApplianceProfiles() {
  const profiles = useLiveQuery(() => db.applianceProfiles.toArray(), []);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">Appliance profiles (capacity & liquid rules)</summary>
      <div className="mt-2 space-y-2">
        {(profiles ?? [])
          .filter((p) => p.capacityLitres != null || p.minLiquidMl != null || p.id === 'pressure-cooker' || p.id === 'slow-cooker')
          .map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <Field label="Capacity (L)">{(id) => <NumberInput id={id} value={p.capacityLitres} onChange={(v) => void db.applianceProfiles.update(p.id, { capacityLitres: v })} step={0.1} />}</Field>
                <Field label="Max fill">{(id) => <NumberInput id={id} value={p.maxFillFraction != null ? Math.round(p.maxFillFraction * 100) : null} onChange={(v) => void db.applianceProfiles.update(p.id, { maxFillFraction: v ? v / 100 : null })} step={5} />}</Field>
                <Field label="Min liquid (ml)">{(id) => <NumberInput id={id} value={p.minLiquidMl} onChange={(v) => void db.applianceProfiles.update(p.id, { minLiquidMl: v })} step={10} />}</Field>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.notes} {p.sourceReference}</p>
            </div>
          ))}
      </div>
    </details>
  );
}

function TrainingSection({ prefs }: { prefs: Preferences }) {
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const gyms = useLiveQuery(() => db.gyms.toArray(), []);
  const [gymName, setGymName] = useState('');
  return (
    <Card id="training" className="space-y-3">
      <CardTitle>Training</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default rest (s)">{(id) => <NumberInput id={id} value={prefs.defaultRestSec} onChange={(v) => void updatePrefs({ defaultRestSec: v ?? 90 })} step={15} min={0} />}</Field>
        <Field label="Default gym">
          {(id) => (
            <Select id={id} value={prefs.defaultGymId ?? ''} onChange={(e) => void updatePrefs({ defaultGymId: e.target.value || null })}>
              {(gyms ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <RecoverySettings prefs={prefs} />
      <Checkbox checked={prefs.restTimerSound} onChange={(v) => void updatePrefs({ restTimerSound: v })} label="Rest timer sound & vibration" />
      <Checkbox
        checked={prefs.restTimerNotifications}
        onChange={async (v) => {
          if (v && (await requestNotificationPermission()) !== 'granted') return alert('Notifications are blocked or unsupported in this browser.');
          await updatePrefs({ restTimerNotifications: v });
        }}
        label="Rest timer notification when the app is in the background (best effort)"
      />
      <div>
        <div className="mb-1 text-sm font-medium">Gyms</div>
        <p className="mb-2 text-xs text-slate-500">Machine and cable weights are only compared within the same gym.</p>
        {(gyms ?? []).map((g) => (
          <div key={g.id} className="mb-1 flex gap-2">
            <Input defaultValue={g.name} onBlur={(e) => void db.gyms.update(g.id, { name: e.target.value || g.name })} aria-label="Gym name" />
          </div>
        ))}
        <div className="flex gap-2">
          <Input value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Add another gym" aria-label="New gym" />
          <Button variant="outline" disabled={!gymName.trim()} onClick={() => { void db.gyms.add({ id: newId('gym'), name: gymName.trim(), notes: '' }); setGymName(''); }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <details open>
        <summary className="cursor-pointer text-sm font-medium">Available equipment</summary>
        <p className="my-2 text-xs text-slate-500">Exercise alternatives prefer equipment marked available. Increments are used for progression suggestions.</p>
        <div className="space-y-1">
          {(equipment ?? []).map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <Checkbox checked={e.available} onChange={(v) => void db.equipment.update(e.id, { available: v })} label={e.name} className="flex-1" />
              {e.incrementKg != null && (
                <>
                  <NumberInput value={e.incrementKg} onChange={(v) => void db.equipment.update(e.id, { incrementKg: v })} step={0.5} min={0.5} className="h-8 w-20" aria-label={`${e.name} increment`} />
                  <span className="w-6 text-xs text-slate-500">kg</span>
                </>
              )}
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

const RECOVERY_MUSCLES = ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];

function RecoverySettings({ prefs }: { prefs: Preferences }) {
  const setOverride = (m: string, v: number | null) => {
    const next = { ...prefs.recoveryOverrides };
    if (v == null) delete next[m];
    else next[m] = v;
    void updatePrefs({ recoveryOverrides: next });
  };
  return (
    <div className="space-y-2">
      <Field label="Recovery preference (hours before training a muscle again)" hint="Used by 'Recommended today'. It's your own rule of thumb, not a measurement of recovery.">
        {(id) => <NumberInput id={id} value={prefs.recoveryDefaultHours} onChange={(v) => void updatePrefs({ recoveryDefaultHours: v ?? 48 })} step={6} min={0} />}
      </Field>
      <details>
        <summary className="cursor-pointer text-sm">Per-muscle overrides ({Object.keys(prefs.recoveryOverrides).length})</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RECOVERY_MUSCLES.map((m) => (
            <Field key={m} label={m}>{(id) => <NumberInput id={id} value={prefs.recoveryOverrides[m] ?? null} onChange={(v) => setOverride(m, v)} step={6} min={0} placeholder={`${prefs.recoveryDefaultHours}`} />}</Field>
          ))}
        </div>
      </details>
    </div>
  );
}

const REMINDER_LABEL: Record<string, string> = { workout: 'Planned workout', 'food-log': 'Log food', 'meal-plan': 'Plan meals for the week', groceries: 'Prepare grocery list', 'weigh-in': 'Weigh-in', 'recipe-feedback': 'Recipe feedback after cooking' };
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function RemindersSection({ prefs }: { prefs: Preferences }) {
  const [perm, setPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const patch = (i: number, p: Partial<Preferences['reminders'][number]>) => void updatePrefs({ reminders: prefs.reminders.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <Card className="space-y-3">
      <CardTitle>Reminders</CardTitle>
      <Notice tone="warn" className="text-xs">
        Reminders are checked locally while FormLab is open or recently backgrounded. Without a push server, browsers can't guarantee delivery when the app is closed — this hasn't been verified on every device.
      </Notice>
      <div className="flex items-center gap-2 text-sm">
        <Bell className="h-4 w-4" /> Notification permission: <Badge>{perm}</Badge>
        {perm === 'default' && (
          <Button size="sm" variant="outline" onClick={async () => setPerm(await requestNotificationPermission())}>
            Allow
          </Button>
        )}
      </div>
      {prefs.reminders.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2">
          <Checkbox checked={r.enabled} onChange={(v) => patch(i, { enabled: v })} label={REMINDER_LABEL[r.id]} className="min-w-[12rem] flex-1" />
          <Input type="time" value={r.time} onChange={(e) => patch(i, { time: e.target.value })} className="h-8 w-28" aria-label={`${REMINDER_LABEL[r.id]} time`} />
          <div className="flex gap-0.5">
            {DAYS.map((d, wd) => (
              <button key={wd} onClick={() => patch(i, { days: r.days.includes(wd) ? r.days.filter((x) => x !== wd) : [...r.days, wd] })} className={`h-7 w-7 rounded text-xs ${r.days.includes(wd) ? 'bg-brand-700 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} aria-pressed={r.days.includes(wd)} aria-label={`Weekday ${wd}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

function DataSection() {
  const toast = useToast();
  const imports = useLiveQuery(() => db.importRecords.orderBy('at').reverse().limit(5).toArray(), []);
  const [usage, setUsage] = useState<string>('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ raw: unknown; name: string; counts: Record<string, number>; errors: string[]; ok: boolean } | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB used`));
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Card className="space-y-3">
      <CardTitle>Data, backup & privacy</CardTitle>
      <p className="text-sm text-slate-600 dark:text-slate-300">Everything is stored in this browser's IndexedDB on this device. There's no account and nothing is uploaded. Clearing site data or uninstalling the browser deletes it — export backups regularly.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4" /> Persistent storage: <Badge tone={persisted ? 'green' : 'amber'}>{persisted == null ? 'unknown' : persisted ? 'granted' : 'not granted'}</Badge> {usage && <span className="text-slate-500">{usage}</span>}
        {!persisted && (
          <Button size="sm" variant="outline" onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}>
            Request
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            downloadJson(await exportBackup(), `formlab-backup-${stamp}.json`);
            await db.meta.put({ key: 'lastBackupAt', value: nowIso() });
            toast('Backup downloaded');
          }}
        >
          <Download className="h-4 w-4" /> Export full backup (JSON)
        </Button>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium dark:border-slate-700">
          <Upload className="h-4 w-4" /> Restore from backup
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const raw = JSON.parse(await file.text());
                const { report } = validateBackup(raw);
                setPending({ raw, name: file.name, ...report });
              } catch {
                toast('That file is not valid JSON');
              }
              e.target.value = '';
            }}
          />
        </label>
        <Button variant="outline" onClick={async () => downloadText(await foodDiaryCsv(), `formlab-food-diary-${stamp}.csv`, 'text/csv')}>
          Food diary CSV
        </Button>
        <Button variant="outline" onClick={async () => downloadText(await workoutsCsv(), `formlab-workouts-${stamp}.csv`, 'text/csv')}>
          Workouts CSV
        </Button>
      </div>
      {pending && (
        <Notice tone={pending.ok ? 'warn' : 'danger'}>
          <div className="font-medium">{pending.ok ? `Restore "${pending.name}"?` : 'This backup failed validation'}</div>
          <div className="mt-1 text-xs">
            {Object.entries(pending.counts)
              .filter(([, n]) => n > 0)
              .map(([t, n]) => `${t}: ${n}`)
              .join(', ')}
          </div>
          {pending.errors.length > 0 && <div className="mt-1 max-h-24 overflow-y-auto text-xs">{pending.errors.slice(0, 10).join('; ')}</div>}
          {pending.ok && <div className="mt-1 text-xs">This replaces ALL current data. A safety copy of your current data will be downloaded first.</div>}
          <div className="mt-2 flex gap-2">
            {pending.ok && (
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const { previous } = await restoreBackup(pending.raw, pending.name);
                  downloadJson(previous, `formlab-pre-restore-${stamp}.json`);
                  setPending(null);
                  toast('Backup restored');
                }}
              >
                Replace my data
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </Notice>
      )}
      {(imports ?? []).length > 0 && (
        <div className="text-xs text-slate-500">
          Recent imports:{' '}
          {imports!.map((i) => `${i.kind} ${formatDateKey(isoToDateKey(i.at))} (${i.fileName})`).join(' · ')}
        </div>
      )}
      <Button
        variant="ghost"
        className="text-red-600"
        onClick={async () => {
          if (!confirm('Delete ALL FormLab data on this device? Export a backup first. This cannot be undone.')) return;
          if (prompt('Type DELETE to confirm') !== 'DELETE') return;
          await db.delete();
          location.reload();
        }}
      >
        <Trash2 className="h-4 w-4" /> Delete all data
      </Button>
    </Card>
  );
}
