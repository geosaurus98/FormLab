import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Scale, Trash2, Trophy } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Field, Input, NumberInput, PageHeader, Select, Sheet, Stat, Tabs, Textarea, Notice } from '../../components/ui';
import { Bars, InsufficientData, SERIES, TrendLine, shortDate } from '../../components/charts';
import { useToast } from '../../components/toast';
import { usePrefs, useToday } from '../../hooks/data';
import { changeOverRange, dailyWeights, goalProgress, rollingAverage, weightTrend } from '../../domain/body/body';
import { computeRecords, exerciseProgress, muscleSetDistribution, sessionVolume } from '../../domain/workouts/records';
import { sessionsPerWeek } from '../../domain/insights/insights';
import { sessionComparisonKey } from '../../domain/workouts/session';
import { addDays, formatDateKey, isoToDateKey } from '../../lib/dates';
import { kgToLb, lbToKg } from '../../lib/units';
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';
import { CARDIO_LABEL } from '../../domain/workouts/types';

const RANGES = { '30': 30, '90': 90, '180': 180, '365': 365 } as const;
type Range = keyof typeof RANGES;

export function ProgressPage() {
  const [tab, setTab] = useState<'body' | 'strength' | 'activity'>('body');
  const [range, setRange] = useState<Range>('90');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Progress"
        actions={
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-36" aria-label="Date range">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last year</option>
          </Select>
        }
      />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'body', label: 'Body weight' }, { value: 'strength', label: 'Strength' }, { value: 'activity', label: 'Training & activity' }]} />
      {tab === 'body' && <BodyTab days={RANGES[range]} />}
      {tab === 'strength' && <StrengthTab days={RANGES[range]} />}
      {tab === 'activity' && <ActivityTab days={RANGES[range]} />}
    </div>
  );
}

export function useMassUnit() {
  const prefs = usePrefs();
  const unit = prefs?.massUnit ?? 'kg';
  return { unit, toDisplay: (kg: number) => (unit === 'kg' ? kg : kgToLb(kg)), fromDisplay: (v: number) => (unit === 'kg' ? v : lbToKg(v)) };
}

export function WeightEntrySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = useToday();
  const { unit, fromDisplay } = useMassUnit();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [weight, setWeight] = useState<number | null>(null);
  const [waist, setWaist] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const toast = useToast();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Record body weight"
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={!weight && !waist}
          onClick={async () => {
            await db.body.add({ id: newId('body'), date, time, weightKg: weight ? Math.round(fromDisplay(weight) * 100) / 100 : null, waistCm: waist, measurements: {}, notes, quality: 'measured', createdAt: nowIso() });
            toast('Recorded');
            setWeight(null);
            setWaist(null);
            setNotes('');
            onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label={`Weight (${unit})`}>{(fid) => <NumberInput id={fid} value={weight} onChange={setWeight} step={0.1} min={0} className="text-2xl" autoFocus />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">{(fid) => <Input id={fid} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Time">{(fid) => <Input id={fid} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
        </div>
        <Field label="Waist (cm, optional)">{(fid) => <NumberInput id={fid} value={waist} onChange={setWaist} step={0.5} min={0} />}</Field>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
        <p className="text-xs text-slate-500">Tip: weigh at a consistent time (e.g. morning, after the bathroom). Daily changes are mostly water and food volume.</p>
      </div>
    </Sheet>
  );
}

function BodyTab({ days }: { days: number }) {
  const today = useToday();
  const body = useLiveQuery(() => db.body.orderBy('date').toArray(), []);
  const prefs = usePrefs();
  const { unit, toDisplay } = useMassUnit();
  const [open, setOpen] = useState(false);
  const start = addDays(today, -days + 1);
  const daily = useMemo(() => dailyWeights(body ?? []), [body]);
  const inRange = daily.filter((d) => d.date >= start);
  const series = useMemo(() => rollingAverage(daily, 7, 3, { start: addDays(start, 0), end: today }).filter((p) => p.weightKg != null || p.avgKg != null), [daily, start, today]);
  const trend = weightTrend(inRange);
  const change = changeOverRange(daily, start, today);
  const latestAvg = [...series].reverse().find((p) => p.avgKg != null)?.avgKg ?? null;
  const goal = prefs?.goalWeightKg ?? null;
  const gp = goal && inRange.length && latestAvg ? goalProgress(inRange[0]!.weightKg, latestAvg, goal) : null;
  const waist = (body ?? []).filter((b) => b.waistCm != null && b.date >= start);
  const r1 = (v: number) => Math.round(toDisplay(v) * 10) / 10;

  return (
    <div className="space-y-4">
      <Button size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Scale className="h-5 w-5" /> Record weight
      </Button>
      <Card>
        <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="7-day average" value={latestAvg ? `${r1(latestAvg)} ${unit}` : '—'} sub={latestAvg ? undefined : 'needs ≥3 weigh-ins in 7 days'} />
          <Stat label="Trend" value={trend ? `${trend.slopeKgPerWeek > 0 ? '+' : ''}${r1(trend.slopeKgPerWeek)} ${unit}/wk` : '—'} sub={trend ? `${trend.n} weigh-ins over ${trend.spanDays} days` : 'needs ≥6 weigh-ins over ≥14 days'} />
          <Stat label="Change in range" value={change ? `${change.change > 0 ? '+' : ''}${r1(change.change)} ${unit}` : '—'} sub="averaged ±3 days at each end" />
          <Stat label="Goal" value={goal ? `${r1(goal)} ${unit}` : '—'} sub={gp != null ? `${Math.round(gp * 100)}% of the way` : goal ? 'not enough data' : <Link to="/settings" className="underline">set a goal</Link>} />
        </div>
        {series.length >= 2 ? (
          <TrendLine
            data={series.map((p) => ({ date: shortDate(p.date), weight: p.weightKg != null ? r1(p.weightKg) : null, avg: p.avgKg != null ? r1(p.avgKg) : null }))}
            xKey="date"
            series={[{ key: 'weight', label: `Daily (${unit})`, color: SERIES.muted, dots: true }, { key: 'avg', label: '7-day average', color: SERIES.primary }]}
            refY={goal ? r1(goal) : null}
            refLabel="goal"
          />
        ) : (
          <InsufficientData>Record at least two weigh-ins to see a chart.</InsufficientData>
        )}
        <p className="mt-2 text-xs text-slate-500">Scale weight reflects water, food, glycogen and body tissue. It can't tell fat from muscle — these figures describe weight only.</p>
      </Card>
      {waist.length >= 2 && (
        <Card>
          <CardTitle>Waist</CardTitle>
          <TrendLine data={waist.map((w) => ({ date: shortDate(w.date), waist: w.waistCm }))} xKey="date" series={[{ key: 'waist', label: 'Waist (cm)', color: SERIES.secondary, dots: true }]} height={160} />
        </Card>
      )}
      <Card className="p-0">
        <div className="px-4 pt-3 text-xs font-semibold uppercase text-slate-500">Entries</div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...(body ?? [])]
            .reverse()
            .slice(0, 30)
            .map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {formatDateKey(b.date)} {b.time && <span className="text-slate-500">{b.time}</span>}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {b.weightKg != null && `${r1(b.weightKg)} ${unit}`}
                  {b.waistCm != null && <Badge>waist {b.waistCm} cm</Badge>}
                  <Button variant="ghost" size="icon" aria-label="Delete entry" onClick={() => void db.body.delete(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
        </ul>
      </Card>
      <WeightEntrySheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function StrengthTab({ days }: { days: number }) {
  const today = useToday();
  const history = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const start = addDays(today, -days + 1);
  const inRange = useMemo(() => (history ?? []).filter((s) => isoToDateKey(s.startedAt) >= start), [history, start]);
  const keys = useMemo(() => {
    const m = new Map<string, { key: string; name: string; sessions: number }>();
    for (const s of inRange)
      for (const es of s.exercises) {
        if (es.tracking !== 'weight_reps') continue;
        const k = sessionComparisonKey(s, es);
        const cur = m.get(k) ?? { key: k, name: es.exerciseName + (es.variant ? ` (${es.variant})` : ''), sessions: 0 };
        cur.sessions++;
        m.set(k, cur);
      }
    return [...m.values()].sort((a, b) => b.sessions - a.sessions);
  }, [inRange]);
  const [selected, setSelected] = useState<string>('');
  const key = selected || keys[0]?.key;
  const progress = key ? exerciseProgress(inRange, key) : [];
  const records = useMemo(() => [...computeRecords(history ?? []).newInSession.values()].flat().filter((r) => isoToDateKey(r.date) >= start).sort((a, b) => b.date.localeCompare(a.date)), [history, start]);
  const muscles = useMemo(() => muscleSetDistribution(inRange, (id) => exercises?.find((e) => e.id === id)?.primaryMuscles ?? []), [inRange, exercises]);

  if (!history) return null;
  if (!history.length) return <InsufficientData>Complete a workout to start tracking strength.</InsufficientData>;
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Exercise progression</CardTitle>
        {keys.length ? (
          <>
            <Select value={key} onChange={(e) => setSelected(e.target.value)} className="mb-3" aria-label="Exercise">
              {keys.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.name} — {k.sessions} session{k.sessions === 1 ? '' : 's'}
                </option>
              ))}
            </Select>
            {progress.length >= 2 ? (
              <TrendLine data={progress.map((p) => ({ date: shortDate(isoToDateKey(p.date)), top: p.topWeightKg, e1rm: p.e1rmKg }))} xKey="date" series={[{ key: 'top', label: 'Top set kg', color: SERIES.primary, dots: true }, { key: 'e1rm', label: 'Est. 1RM kg (estimate)', color: SERIES.secondary, dashed: true }]} />
            ) : (
              <InsufficientData>Need at least two sessions of this exercise in the range.</InsufficientData>
            )}
            <p className="mt-2 text-xs text-slate-500">Estimated 1RM uses the Epley formula on sets of ≤10 reps and is an estimate only. Machine exercises are tracked per gym.</p>
          </>
        ) : (
          <InsufficientData>No weighted exercises in this range.</InsufficientData>
        )}
      </Card>
      <Card>
        <CardTitle>Personal records in range</CardTitle>
        {records.length ? (
          <ul className="space-y-1 text-sm">
            {records.slice(0, 15).map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="font-medium">{r.exerciseName}</span>
                <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
                <span className="ml-auto text-xs text-slate-500">{formatDateKey(isoToDateKey(r.date))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No new records in this range. Records need a previous comparable session to beat.</p>
        )}
      </Card>
      <Card>
        <CardTitle>Working sets by muscle group</CardTitle>
        {Object.keys(muscles).length ? <Bars data={Object.entries(muscles).sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ muscle: m, sets: n }))} xKey="muscle" series={[{ key: 'sets', label: 'Sets', color: SERIES.secondary }]} /> : <InsufficientData>No sets in range.</InsufficientData>}
        <p className="mt-2 text-xs text-slate-500">Counts sets where the muscle is a primary mover.</p>
      </Card>
    </div>
  );
}

function ActivityTab({ days }: { days: number }) {
  const today = useToday();
  const prefs = usePrefs();
  const workouts = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const cardio = useLiveQuery(() => db.cardio.toArray(), []);
  const start = addDays(today, -days + 1);
  const weeks = useMemo(() => sessionsPerWeek(workouts ?? [], start, today, prefs?.weekStartsOn ?? 1, cardio ?? []), [workouts, cardio, start, today, prefs]);
  const inRange = (workouts ?? []).filter((w) => isoToDateKey(w.startedAt) >= start).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const cardioIn = (cardio ?? []).filter((c) => c.date >= start);
  const goal = prefs?.goals.find((g) => g.id === 'consistency');
  const byType = cardioIn.reduce<Record<string, { n: number; min: number; km: number }>>((m, c) => {
    const cur = (m[c.type] ??= { n: 0, min: 0, km: 0 });
    cur.n++;
    cur.min += c.durationMin;
    cur.km += c.distanceKm ?? 0;
    return m;
  }, {});
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Sessions per week</CardTitle>
        {inRange.length || cardioIn.length ? (
          <Bars data={weeks.map((w) => ({ week: shortDate(w.week), Gym: w.sessions, Cardio: w.cardio }))} xKey="week" series={[{ key: 'Gym', label: 'Gym workouts', color: SERIES.secondary }, { key: 'Cardio', label: 'Cardio/walks', color: SERIES.tertiary }]} stacked refY={goal?.enabled ? goal.target : null} refLabel="goal" />
        ) : (
          <InsufficientData>No training logged in this range.</InsufficientData>
        )}
      </Card>
      <Card>
        <CardTitle>Workout duration and volume</CardTitle>
        {inRange.length >= 2 ? (
          <TrendLine data={inRange.map((w) => ({ date: shortDate(isoToDateKey(w.startedAt)), minutes: w.endedAt ? Math.round((new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 60000) : null, volume: Math.round(sessionVolume(w) / 100) / 10 }))} xKey="date" series={[{ key: 'minutes', label: 'Duration (min)', color: SERIES.primary, dots: true }, { key: 'volume', label: 'Volume (tonnes)', color: SERIES.tertiary, dashed: true }]} />
        ) : (
          <InsufficientData>Need at least two workouts.</InsufficientData>
        )}
      </Card>
      <Card>
        <CardTitle>Cardio & outdoor activity</CardTitle>
        {cardioIn.length ? (
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(byType).map(([t, v]) => (
                <tr key={t} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1">{CARDIO_LABEL[t as keyof typeof CARDIO_LABEL]}</td>
                  <td className="text-right tabular-nums">{v.n}×</td>
                  <td className="text-right tabular-nums">{Math.round(v.min)} min</td>
                  <td className="text-right tabular-nums">{v.km.toFixed(1)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">
            No activities in range. <Link to="/workouts/cardio/new" className="text-brand-700 underline">Log one</Link>.
          </p>
        )}
      </Card>
      {!prefs?.goals.some((g) => g.enabled) && <Notice className="text-xs">Set fitness goals in Settings to show targets on these charts.</Notice>}
      <Link to="/workouts/cardio/new">
        <Button variant="outline">
          <Plus className="h-4 w-4" /> Log activity
        </Button>
      </Link>
    </div>
  );
}
