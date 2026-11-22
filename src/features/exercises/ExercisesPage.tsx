import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Search, Trophy } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select, Textarea, Checkbox, NumberInput, Notice, EmptyState } from '../../components/ui';
import { useToast } from '../../components/toast';
import { TrendLine, InsufficientData, SERIES, shortDate } from '../../components/charts';
import { findAlternatives } from '../../domain/workouts/alternatives';
import { computeRecords, exerciseProgress, E1RM_MAX_REPS } from '../../domain/workouts/records';
import { sessionComparisonKey } from '../../domain/workouts/session';
import { ExerciseSchema, LOAD_TYPES, MOVEMENT_PATTERNS, MUSCLES, TRACKING_METHODS, type Exercise, type Muscle } from '../../domain/workouts/types';
import { newId } from '../../lib/id';
import { formatDateKey, isoToDateKey } from '../../lib/dates';

export function ExercisesPage() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<'' | Muscle>('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const eqMap = useMemo(() => new Map((equipment ?? []).map((e) => [e.id, e])), [equipment]);
  const list = (exercises ?? []).filter((e) => {
    if (e.archived) return false;
    if (muscle && !e.primaryMuscles.includes(muscle) && !e.secondaryMuscles.includes(muscle)) return false;
    if (onlyAvailable && !e.equipmentIds.every((id) => eqMap.get(id)?.available !== false)) return false;
    return !q || `${e.name} ${e.aliases.join(' ')}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Exercise library" subtitle={`${exercises?.length ?? 0} exercises`} actions={<Link to="/exercises/new"><Button><Plus className="h-4 w-4" /> Custom</Button></Link>} />
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" aria-label="Search exercises" />
        </div>
        <Select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} aria-label="Muscle">
          <option value="">All muscles</option>
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      <Checkbox checked={onlyAvailable} onChange={setOnlyAvailable} label="Only exercises with equipment I have (configure in Settings)" />
      <Card className="p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((e) => {
            const unavailable = e.equipmentIds.filter((id) => eqMap.get(id)?.available === false);
            return (
              <li key={e.id}>
                <Link to={`/exercises/${e.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.name}</div>
                    <div className="truncate text-xs capitalize text-slate-500">
                      {e.primaryMuscles.join(', ')} · {e.equipmentIds.map((id) => eqMap.get(id)?.name ?? id).join(', ')}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {e.custom && <Badge tone="indigo">custom</Badge>}
                    {unavailable.length > 0 && <Badge tone="amber">no equipment</Badge>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export function ExerciseDetailPage() {
  const { id } = useParams();
  const ex = useLiveQuery(() => db.exercises.get(id!), [id]);
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const gyms = useLiveQuery(() => db.gyms.toArray(), []);
  const history = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const eqMap = useMemo(() => new Map((equipment ?? []).map((e) => [e.id, e])), [equipment]);
  const keys = useMemo(() => {
    const set = new Map<string, { key: string; label: string }>();
    for (const s of history ?? [])
      for (const es of s.exercises)
        if (es.exerciseId === id) {
          const k = sessionComparisonKey(s, es);
          const gym = gyms?.find((g) => g.id === s.gymId)?.name;
          set.set(k, { key: k, label: [es.loadType === 'machine' || es.loadType === 'cable' ? gym ?? 'Unknown gym' : 'All locations', es.variant].filter(Boolean).join(' · ') });
        }
    return [...set.values()];
  }, [history, id, gyms]);
  const [keyIdx, setKeyIdx] = useState(0);
  const key = keys[keyIdx]?.key;
  const progress = useMemo(() => (key && history ? exerciseProgress(history, key) : []), [history, key]);
  const records = useMemo(() => (key && history ? computeRecords(history).byKey.get(key) ?? [] : []), [history, key]);
  if (!ex) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const alternatives = all ? findAlternatives(ex, all, eqMap, 6) : [];
  const weightBased = ex.tracking === 'weight_reps';

  return (
    <div className="space-y-4">
      <PageHeader
        title={ex.name}
        subtitle={<span className="capitalize">{[...ex.primaryMuscles, ...ex.secondaryMuscles.map((m) => `${m} (secondary)`)].join(', ')}</span>}
        back={<Link to="/exercises" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Library</Link>}
        actions={<Link to={`/exercises/${ex.id}/edit`}><Button variant="outline">Edit</Button></Link>}
      />
      <Card>
        <CardTitle>How to</CardTitle>
        {ex.instructions.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {ex.instructions.map((i, n) => (
              <li key={n}>{i}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">No instructions recorded.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1 text-xs">
          {ex.equipmentIds.map((eid) => (
            <Badge key={eid} tone={eqMap.get(eid)?.available === false ? 'amber' : 'slate'}>
              {eqMap.get(eid)?.name ?? eid}
            </Badge>
          ))}
          <Badge tone="blue">{ex.movementPattern}</Badge>
          <Badge>{ex.tracking.replace('_', ' + ')}</Badge>
        </div>
        {ex.mediaUrl && (
          <a href={ex.mediaUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-brand-700 underline">
            Reference media
          </a>
        )}
        <p className="mt-3 text-xs text-slate-500">The app records what you log; it cannot assess technique.</p>
      </Card>

      <Card>
        <CardTitle>Progress</CardTitle>
        {keys.length > 1 && (
          <Select value={keyIdx} onChange={(e) => setKeyIdx(Number(e.target.value))} className="mb-3" aria-label="Equipment context">
            {keys.map((k, i) => (
              <option key={k.key} value={i}>
                {k.label}
              </option>
            ))}
          </Select>
        )}
        {progress.length >= 2 ? (
          <TrendLine
            data={progress.map((p) => ({ date: shortDate(isoToDateKey(p.date)), top: p.topWeightKg, e1rm: p.e1rmKg, reps: p.totalReps }))}
            xKey="date"
            series={weightBased ? [{ key: 'top', label: 'Top set (kg)', color: SERIES.primary, dots: true }, { key: 'e1rm', label: `Est. 1RM (kg, ≤${E1RM_MAX_REPS} reps)`, color: SERIES.secondary, dashed: true }] : [{ key: 'reps', label: 'Total reps', color: SERIES.primary, dots: true }]}
          />
        ) : (
          <InsufficientData>{progress.length === 1 ? 'One session logged — a trend needs at least two.' : 'No sessions logged for this exercise yet.'}</InsufficientData>
        )}
        {records.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {records.map((r) => (
              <li key={r.kind} className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> {r.label} <span className="text-xs text-slate-500">({formatDateKey(isoToDateKey(r.date))})</span>
              </li>
            ))}
          </ul>
        )}
        {keys.length > 1 && <p className="mt-2 text-xs text-slate-500">Machine and cable numbers are shown separately per gym and variant because resistance differs between machines.</p>}
      </Card>

      {progress.length > 0 && (
        <Card>
          <CardTitle>Recent sessions</CardTitle>
          <ul className="space-y-1 text-sm">
            {[...progress]
              .reverse()
              .slice(0, 8)
              .map((p) => (
                <li key={p.sessionId}>
                  <Link to={`/workouts/history/${p.sessionId}`} className="flex justify-between">
                    <span>{formatDateKey(isoToDateKey(p.date))}</span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">
                      {p.topWeightKg != null ? `${p.topWeightKg} kg top · ` : ''}
                      {p.totalReps} reps
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>Alternatives</CardTitle>
        <ul className="space-y-1">
          {alternatives.map((a) => (
            <li key={a.exercise.id}>
              <Link to={`/exercises/${a.exercise.id}`} className="flex items-center justify-between text-sm">
                <span>{a.exercise.name}</span>
                <span className="text-xs text-slate-500">{a.available ? a.reasons[0] : 'equipment unavailable'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function ExerciseEditorPage() {
  const { id } = useParams();
  const existing = useLiveQuery(() => (id && id !== 'new' ? db.exercises.get(id) : undefined), [id]);
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const navigate = useNavigate();
  const toast = useToast();
  const blank: Exercise = { id: newId('ex'), name: '', aliases: [], primaryMuscles: [], secondaryMuscles: [], equipmentIds: [], movementPattern: 'other', type: 'strength', tracking: 'weight_reps', loadType: 'machine', instructions: [], mediaUrl: null, alternativeIds: [], incrementKg: null, custom: true, archived: false };
  const [ex, setEx] = useState<Exercise>(blank);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (existing && !loaded) {
      setEx(existing);
      setLoaded(true);
    }
  }, [existing, loaded]);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-4">
      <PageHeader title={existing ? 'Edit exercise' : 'Custom exercise'} back={<Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>} />
      <Card className="space-y-3">
        <Field label="Name">{(fid) => <Input id={fid} value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} />}</Field>
        <Field label="Aliases (comma separated)">{(fid) => <Input id={fid} value={ex.aliases.join(', ')} onChange={(e) => setEx({ ...ex, aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tracking">
            {(fid) => (
              <Select id={fid} value={ex.tracking} onChange={(e) => setEx({ ...ex, tracking: e.target.value as Exercise['tracking'] })}>
                {TRACKING_METHODS.map((t) => (
                  <option key={t} value={t}>
                    {{ weight_reps: 'Weight × reps', bodyweight_reps: 'Bodyweight (+ added load)', assisted_bodyweight: 'Assisted bodyweight', reps: 'Reps only', duration: 'Duration', distance_duration: 'Distance + time' }[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Load type" hint="Machines/cables are only compared within one gym">
            {(fid) => (
              <Select id={fid} value={ex.loadType} onChange={(e) => setEx({ ...ex, loadType: e.target.value as Exercise['loadType'] })}>
                {LOAD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Movement pattern">
            {(fid) => (
              <Select id={fid} value={ex.movementPattern} onChange={(e) => setEx({ ...ex, movementPattern: e.target.value as Exercise['movementPattern'] })}>
                {MOVEMENT_PATTERNS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Weight increment (kg)">{(fid) => <NumberInput id={fid} value={ex.incrementKg} onChange={(v) => setEx({ ...ex, incrementKg: v })} step={0.5} min={0} placeholder="equipment default" />}</Field>
        </div>
        <Field label="Type">
          {(fid) => (
            <Select id={fid} value={ex.type} onChange={(e) => setEx({ ...ex, type: e.target.value as Exercise['type'] })}>
              <option value="strength">Strength</option>
              <option value="cardio">Cardio</option>
              <option value="mobility">Mobility</option>
            </Select>
          )}
        </Field>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Primary muscles</h2>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m) => (
            <button key={m} onClick={() => setEx({ ...ex, primaryMuscles: toggle(ex.primaryMuscles, m) })} className={`rounded-full border px-3 py-1 text-sm capitalize ${ex.primaryMuscles.includes(m) ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-300 dark:border-slate-700'}`} aria-pressed={ex.primaryMuscles.includes(m)}>
              {m}
            </button>
          ))}
        </div>
        <h2 className="pt-2 font-semibold">Equipment</h2>
        <div className="flex flex-wrap gap-2">
          {(equipment ?? []).map((eq) => (
            <button key={eq.id} onClick={() => setEx({ ...ex, equipmentIds: toggle(ex.equipmentIds, eq.id) })} className={`rounded-full border px-3 py-1 text-sm ${ex.equipmentIds.includes(eq.id) ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-300 dark:border-slate-700'}`} aria-pressed={ex.equipmentIds.includes(eq.id)}>
              {eq.name}
            </button>
          ))}
        </div>
      </Card>
      <Card className="space-y-2">
        <Field label="Instructions (one step per line)">{(fid) => <Textarea id={fid} value={ex.instructions.join('\n')} onChange={(e) => setEx({ ...ex, instructions: e.target.value.split('\n') })} />}</Field>
        <Field label="Media link (optional)">{(fid) => <Input id={fid} value={ex.mediaUrl ?? ''} onChange={(e) => setEx({ ...ex, mediaUrl: e.target.value || null })} placeholder="https://" />}</Field>
      </Card>
      {!ex.primaryMuscles.length && <Notice tone="warn">Choose at least one primary muscle.</Notice>}
      {!existing && !ex.name && <EmptyState title="Name your exercise to save it" />}
      <Button
        size="lg"
        className="w-full"
        disabled={!ex.name.trim() || !ex.primaryMuscles.length}
        onClick={async () => {
          const parsed = ExerciseSchema.parse({ ...ex, name: ex.name.trim(), instructions: ex.instructions.filter((l) => l.trim()) });
          await db.exercises.put(parsed);
          toast('Exercise saved');
          navigate(`/exercises/${parsed.id}`);
        }}
      >
        Save exercise
      </Button>
    </div>
  );
}
