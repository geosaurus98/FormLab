import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, ChevronUp, Info, MoreVertical, Pause, Play, Plus, Repeat, SkipForward, Trash2, X, Search } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, Input, NumberInput, Sheet, Textarea, EmptyState, Notice } from '../../components/ui';
import { useToast } from '../../components/toast';
import { usePrefs, useNow } from '../../hooks/data';
import { addExerciseToSession, addSet, moveExercise, previousPerformances, removeExerciseFromSession, removeSet, replaceExercise, sessionComparisonKey, toggleSetComplete, updateSet } from '../../domain/workouts/session';
import { suggestNext } from '../../domain/workouts/progression';
import { extendTimer, isPaused, pauseTimer, remainingMs, resumeTimer, startTimer, timerProgress } from '../../domain/workouts/timer';
import { findAlternatives } from '../../domain/workouts/alternatives';
import { SET_TYPES, SET_TYPE_LABEL, type ExerciseSession, type ExerciseSet, type WorkoutSession } from '../../domain/workouts/types';
import { buildBlock, discardWorkout, finishWorkout, saveWorkout } from '../../db/workoutService';
import { cancelRestAlert, requestWakeLock, scheduleRestAlert } from './restTimer';
import { formatClock, formatDuration, formatDateKey, isoToDateKey } from '../../lib/dates';
import { cn } from '../../lib/utils';
import { defaultIncrement } from '../../domain/workouts/session';

export function ActiveWorkoutPage() {
  const stored = useLiveQuery(() => db.workouts.where('status').equals('active').first().then((x) => x ?? null), []);
  const history = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const prefs = usePrefs();
  const navigate = useNavigate();
  const toast = useToast();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'replace'; es: ExerciseSession } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [menu, setMenu] = useState(false);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    if (stored && (!session || stored.id !== session.id)) setSession(stored);
  }, [stored, session]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    void requestWakeLock().then((l) => (lock = l));
    return () => void lock?.release();
  }, []);

  /** Apply a pure change and persist immediately (autosave). Writes are serialised. */
  const apply = useCallback((fn: (s: WorkoutSession) => WorkoutSession) => {
    setSession((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      saveQueue.current = saveQueue.current.then(() => saveWorkout(next));
      return next;
    });
  }, []);

  const exMap = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const incs = useMemo(() => new Map((equipment ?? []).map((e) => [e.id, e.incrementKg])), [equipment]);

  if (stored === null && !session) {
    return (
      <EmptyState title="No workout in progress" action={<Link to="/workouts"><Button>Choose a workout</Button></Link>}>
        Start one from a template or as a quick workout.
      </EmptyState>
    );
  }
  if (!session || !history || !exercises) return <div className="p-8 text-center text-slate-500">Loading workout…</div>;

  const onToggle = (es: ExerciseSession, set: ExerciseSet) => {
    const completing = !set.completed;
    apply((s) => {
      let next = toggleSetComplete(s, es.id, set.id);
      if (completing) {
        const rest = es.target?.restSec ?? prefs?.defaultRestSec ?? 90;
        if (rest > 0) {
          next = { ...next, restTimer: startTimer(rest, es.id) };
          scheduleRestAlert(next.restTimer!.endsAt!, { sound: prefs?.restTimerSound ?? true, notify: prefs?.restTimerNotifications ?? false, label: `Next: ${es.exerciseName}` });
        }
      }
      return next;
    });
  };

  const doneSets = session.exercises.reduce((n, es) => n + es.sets.filter((x) => x.completed).length, 0);

  return (
    <div className="space-y-3 pb-28">
      <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="min-w-0">
          <div className="truncate font-bold">{session.name}</div>
          <Elapsed startedAt={session.startedAt} sets={doneSets} />
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Workout options" onClick={() => setMenu(true)}>
            <MoreVertical className="h-5 w-5" />
          </Button>
          <Button onClick={() => setFinishing(true)} className="bg-lift-600 hover:bg-lift-500">
            Finish
          </Button>
        </div>
      </div>

      {session.exercises.length === 0 && <EmptyState title="Empty workout">Add your first exercise.</EmptyState>}

      {session.exercises.map((es, idx) => {
        const ex = exMap.get(es.exerciseId);
        const prev = previousPerformances(history, sessionComparisonKey(session, es), session.id, 2);
        const suggestion = es.target && ex && ex.type === 'strength' ? suggestNext({ previous: prev[0]?.exercise ?? null, previousToPrevious: prev[1]?.exercise ?? null, target: es.target, rule: es.target.progression, defaultIncrementKg: defaultIncrement(ex, incs) }) : null;
        return (
          <ExerciseCard
            key={es.id}
            es={es}
            index={idx}
            count={session.exercises.length}
            previous={prev[0] ?? null}
            suggestionReason={suggestion?.reason ?? null}
            onToggle={(set) => onToggle(es, set)}
            onSetChange={(set, patch) => apply((s) => updateSet(s, es.id, set.id, patch))}
            onAddSet={() => apply((s) => addSet(s, es.id))}
            onRemoveSet={(set) => apply((s) => removeSet(s, es.id, set.id))}
            onMove={(d) => apply((s) => moveExercise(s, es.id, d))}
            onRemove={() => apply((s) => removeExerciseFromSession(s, es.id))}
            onReplace={() => setPicker({ mode: 'replace', es })}
            onNotes={(notes, variant) => apply((s) => ({ ...s, exercises: s.exercises.map((x) => (x.id === es.id ? { ...x, notes, variant } : x)) }))}
            increment={ex ? defaultIncrement(ex, incs) : 2.5}
          />
        );
      })}

      <Button variant="outline" size="lg" className="w-full" onClick={() => setPicker({ mode: 'add' })}>
        <Plus className="h-5 w-5" /> Add exercise
      </Button>

      <RestTimerBar session={session} onChange={(t) => apply((s) => ({ ...s, restTimer: t }))} soundPrefs={{ sound: prefs?.restTimerSound ?? true, notify: prefs?.restTimerNotifications ?? false }} />

      <ExercisePicker
        open={!!picker}
        title={picker?.mode === 'replace' ? `Replace ${picker.es.exerciseName}` : 'Add exercise'}
        replaceFor={picker?.mode === 'replace' ? picker.es.exerciseId : null}
        onClose={() => setPicker(null)}
        onPick={async (exerciseId) => {
          const block = await buildBlock(exerciseId, session.gymId);
          if (picker?.mode === 'replace') {
            const target = picker.es;
            apply((s) => replaceExercise(s, target.id, { ...block, sets: block.sets.slice(0, Math.max(1, target.sets.length)) }));
            toast(`Replaced with ${block.exerciseName} — its history is tracked separately`);
          } else apply((s) => addExerciseToSession(s, block));
          setPicker(null);
        }}
      />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Workout options">
        <div className="space-y-3">
          <Textarea value={session.notes} onChange={(e) => apply((s) => ({ ...s, notes: e.target.value }))} placeholder="Workout notes" aria-label="Workout notes" />
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (!confirm('Discard this workout? Logged sets will be deleted.')) return;
              cancelRestAlert();
              await saveQueue.current;
              await discardWorkout(session.id);
              navigate('/workouts');
            }}
          >
            <Trash2 className="h-4 w-4" /> Discard workout
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title="Finish workout?"
        footer={
          <Button
            className="w-full"
            size="lg"
            onClick={async () => {
              cancelRestAlert();
              await saveQueue.current;
              const done = await finishWorkout(session);
              navigate(`/workouts/history/${done.id}?summary=1`, { replace: true });
            }}
          >
            Save workout
          </Button>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{doneSets} completed set(s) will be saved. Sets not ticked as complete are discarded.</p>
        <Textarea className="mt-3" value={session.notes} onChange={(e) => apply((s) => ({ ...s, notes: e.target.value }))} placeholder="How did it go? (optional)" aria-label="Notes" />
      </Sheet>
    </div>
  );
}

function Elapsed({ startedAt, sets }: { startedAt: string; sets: number }) {
  const now = useNow(15_000);
  return (
    <div className="text-xs text-slate-500">
      {formatDuration(now - new Date(startedAt).getTime())} · {sets} set{sets === 1 ? '' : 's'} done
    </div>
  );
}

function ExerciseCard(props: {
  es: ExerciseSession;
  index: number;
  count: number;
  previous: { session: WorkoutSession; exercise: ExerciseSession } | null;
  suggestionReason: string | null;
  increment: number;
  onToggle: (s: ExerciseSet) => void;
  onSetChange: (s: ExerciseSet, patch: Partial<ExerciseSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (s: ExerciseSet) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onReplace: () => void;
  onNotes: (notes: string, variant: string) => void;
}) {
  const { es, previous } = props;
  const [showInfo, setShowInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const t = es.tracking;
  const cols = t === 'weight_reps' ? ['kg', 'Reps'] : t === 'bodyweight_reps' ? ['+kg', 'Reps'] : t === 'assisted_bodyweight' ? ['Assist kg', 'Reps'] : t === 'reps' ? ['', 'Reps'] : t === 'duration' ? ['', 'Seconds'] : ['Minutes', 'km'];
  const prevText = previous?.exercise.sets
    .filter((s) => s.completed && s.type !== 'warmup')
    .map((s) => fmtSet(t, s))
    .join(', ');
  return (
    <Card className="p-3">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{es.exerciseName}</h2>
          <div className="text-xs text-slate-500">
            {es.target ? `${es.target.sets} × ${t === 'duration' ? `${es.target.targetDurationSec ?? '?'}s` : `${es.target.repMin}–${es.target.repMax}`} · rest ${es.target.restSec}s` : 'Ad-hoc'}
            {es.variant && ` · ${es.variant}`}
            {es.replacedExerciseId && <Badge className="ml-1">substitute</Badge>}
          </div>
        </div>
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon" aria-label="Replace exercise" onClick={props.onReplace}>
            <Repeat className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Exercise options" onClick={() => setShowMenu(true)}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {prevText ? (
        <button className="mb-2 flex w-full items-start gap-1 text-left text-xs text-slate-600 dark:text-slate-300" onClick={() => setShowInfo((x) => !x)}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Last ({formatDateKey(isoToDateKey(previous!.session.startedAt))}): <span className="font-medium tabular-nums">{prevText}</span>
          </span>
        </button>
      ) : (
        <div className="mb-2 text-xs text-slate-500">No previous comparable session.</div>
      )}
      {showInfo && props.suggestionReason && <Notice className="mb-2 text-xs">{props.suggestionReason} Suggestions are optional — adjust freely.</Notice>}

      <div className="grid grid-cols-[2rem_3.2rem_1fr_1fr_3rem] items-center gap-1.5 text-center text-[11px] font-medium uppercase text-slate-500">
        <span>Set</span>
        <span>Type</span>
        <span>{cols[0]}</span>
        <span>{cols[1]}</span>
        <span>Done</span>
      </div>
      {es.sets.map((set, i) => (
        <SetRow key={set.id} n={i + 1} set={set} tracking={t} increment={props.increment} onChange={(p) => props.onSetChange(set, p)} onToggle={() => props.onToggle(set)} />
      ))}
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={props.onAddSet}>
          <Plus className="h-4 w-4" /> Add set
        </Button>
        {es.sets.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => props.onRemoveSet(es.sets[es.sets.length - 1]!)} aria-label="Remove last set">
            <X className="h-4 w-4" /> Last set
          </Button>
        )}
      </div>

      <Sheet open={showMenu} onClose={() => setShowMenu(false)} title={es.exerciseName}>
        <div className="space-y-3">
          <Input defaultValue={es.variant} placeholder="Machine / variant (e.g. plate-loaded)" aria-label="Variant" onBlur={(e) => props.onNotes(es.notes, e.target.value)} />
          <p className="text-xs text-slate-500">Recording a different machine or variant keeps its numbers separate, so records aren't compared across different equipment.</p>
          <Textarea defaultValue={es.notes} placeholder="Exercise notes (seat height, grip…)" aria-label="Exercise notes" onBlur={(e) => props.onNotes(e.target.value, es.variant)} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={props.index === 0} onClick={() => props.onMove(-1)}>
              <ChevronUp className="h-4 w-4" /> Move up
            </Button>
            <Button variant="outline" disabled={props.index === props.count - 1} onClick={() => props.onMove(1)}>
              <ChevronDown className="h-4 w-4" /> Move down
            </Button>
          </div>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              props.onRemove();
              setShowMenu(false);
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove exercise
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

function fmtSet(t: ExerciseSession['tracking'], s: ExerciseSet): string {
  switch (t) {
    case 'weight_reps':
      return `${s.weightKg ?? 0}×${s.reps ?? 0}`;
    case 'bodyweight_reps':
      return s.addedKg ? `BW+${s.addedKg}×${s.reps ?? 0}` : `BW×${s.reps ?? 0}`;
    case 'assisted_bodyweight':
      return `−${s.assistanceKg ?? 0}×${s.reps ?? 0}`;
    case 'duration':
      return `${s.durationSec ?? 0}s`;
    case 'distance_duration':
      return `${Math.round((s.durationSec ?? 0) / 60)}min${s.distanceM ? ` ${(s.distanceM / 1000).toFixed(2)}km` : ''}`;
    default:
      return `${s.reps ?? 0}`;
  }
}

function SetRow({ n, set, tracking: t, increment, onChange, onToggle }: { n: number; set: ExerciseSet; tracking: ExerciseSession['tracking']; increment: number; onChange: (p: Partial<ExerciseSet>) => void; onToggle: () => void }) {
  const cycleType = () => onChange({ type: SET_TYPES[(SET_TYPES.indexOf(set.type) + 1) % SET_TYPES.length]! });
  const typeShort = { warmup: 'W', working: '', drop: 'D', failure: 'F', other: 'O' }[set.type];
  const first =
    t === 'weight_reps' ? (
      <NumberInput value={set.weightKg} onChange={(v) => onChange({ weightKg: v })} step={increment} min={0} aria-label={`Set ${n} weight`} className="h-11 text-center text-lg font-semibold" />
    ) : t === 'bodyweight_reps' ? (
      <NumberInput value={set.addedKg} onChange={(v) => onChange({ addedKg: v })} step={increment} min={0} placeholder="0" aria-label={`Set ${n} added weight`} className="h-11 text-center text-lg" />
    ) : t === 'assisted_bodyweight' ? (
      <NumberInput value={set.assistanceKg} onChange={(v) => onChange({ assistanceKg: v })} step={increment} min={0} aria-label={`Set ${n} assistance`} className="h-11 text-center text-lg" />
    ) : t === 'distance_duration' ? (
      <NumberInput value={set.durationSec != null ? Math.round(set.durationSec / 6) / 10 : null} onChange={(v) => onChange({ durationSec: v == null ? null : Math.round(v * 60) })} step={1} min={0} aria-label={`Set ${n} minutes`} className="h-11 text-center text-lg" />
    ) : (
      <span />
    );
  const second =
    t === 'duration' ? (
      <NumberInput value={set.durationSec} onChange={(v) => onChange({ durationSec: v })} step={5} min={0} aria-label={`Set ${n} seconds`} className="h-11 text-center text-lg font-semibold" />
    ) : t === 'distance_duration' ? (
      <NumberInput value={set.distanceM != null ? set.distanceM / 1000 : null} onChange={(v) => onChange({ distanceM: v == null ? null : Math.round(v * 1000) })} step={0.1} min={0} aria-label={`Set ${n} distance km`} className="h-11 text-center text-lg" />
    ) : (
      <NumberInput value={set.reps} onChange={(v) => onChange({ reps: v == null ? null : Math.round(v) })} step={1} min={0} aria-label={`Set ${n} reps`} className="h-11 text-center text-lg font-semibold" />
    );
  return (
    <div className={cn('mt-1.5 grid grid-cols-[2rem_3.2rem_1fr_1fr_3rem] items-center gap-1.5 rounded-lg', set.completed && 'bg-green-50 dark:bg-green-950/30')}>
      <span className="text-center text-sm font-semibold tabular-nums text-slate-500">{n}</span>
      <button onClick={cycleType} className="h-11 rounded-md border border-slate-200 text-xs font-semibold dark:border-slate-700" aria-label={`Set ${n} type: ${SET_TYPE_LABEL[set.type]} (tap to change)`} title={SET_TYPE_LABEL[set.type]}>
        {typeShort || 'Work'}
      </button>
      {first}
      {second}
      <button onClick={onToggle} aria-label={set.completed ? `Mark set ${n} not done` : `Complete set ${n}`} aria-pressed={set.completed} className={cn('flex h-11 w-12 items-center justify-center rounded-lg border-2 transition-colors', set.completed ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 text-slate-400 hover:border-green-500 dark:border-slate-600')}>
        <Check className="h-6 w-6" />
      </button>
    </div>
  );
}

function RestTimerBar({ session, onChange, soundPrefs }: { session: WorkoutSession; onChange: (t: WorkoutSession['restTimer']) => void; soundPrefs: { sound: boolean; notify: boolean } }) {
  const t = session.restTimer;
  const now = useNow(250, !!t);
  // After a reload/interruption, re-arm the alert for a timer that is still running.
  const endsAt = t?.endsAt ?? null;
  useEffect(() => {
    if (endsAt && endsAt > Date.now()) scheduleRestAlert(endsAt, { ...soundPrefs, label: 'Rest complete' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  if (!t) return null;
  const remaining = remainingMs(t, now);
  const paused = isPaused(t);
  const done = remaining <= 0 && !paused;
  const reschedule = (next: NonNullable<WorkoutSession['restTimer']>) => {
    if (next.endsAt) scheduleRestAlert(next.endsAt, { ...soundPrefs, label: 'Rest complete' });
    else cancelRestAlert();
    onChange(next);
  };
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-900" role="timer" aria-live="off">
      <div className="mx-auto max-w-5xl">
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className={cn('h-full transition-all', done ? 'bg-green-500' : 'bg-lift-500')} style={{ width: `${timerProgress(t, now) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs text-slate-500">{done ? 'Rest complete' : paused ? 'Paused' : 'Rest'}</div>
            <div className={cn('text-3xl font-bold tabular-nums', done && 'text-green-600')} data-testid="rest-remaining">
              {formatClock(remaining / 1000)}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => reschedule(extendTimer(t, -15, now))} aria-label="Reduce rest by 15 seconds">
              −15
            </Button>
            <Button variant="outline" size="sm" onClick={() => reschedule(extendTimer(t, 30, now))} aria-label="Extend rest by 30 seconds">
              +30
            </Button>
            <Button variant="outline" size="icon" onClick={() => reschedule(paused ? resumeTimer(t, now) : pauseTimer(t, now))} aria-label={paused ? 'Resume rest timer' : 'Pause rest timer'}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                cancelRestAlert();
                onChange(null);
              }}
              aria-label="Skip rest"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExercisePicker({ open, title, onClose, onPick, replaceFor }: { open: boolean; title: string; onClose: () => void; onPick: (exerciseId: string) => void; replaceFor: string | null }) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const [q, setQ] = useState('');
  const eqMap = useMemo(() => new Map((equipment ?? []).map((e) => [e.id, e])), [equipment]);
  const target = replaceFor ? exercises?.find((e) => e.id === replaceFor) : undefined;
  const alternatives = target && exercises ? findAlternatives(target, exercises, eqMap) : [];
  const ql = q.toLowerCase();
  const list = (exercises ?? []).filter((e) => !e.archived && (!q || `${e.name} ${e.aliases.join(' ')} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(ql))).sort((a, b) => a.name.localeCompare(b.name));
  const available = (id: string) => (exercises?.find((e) => e.id === id)?.equipmentIds ?? []).every((x) => eqMap.get(x)?.available !== false);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises or muscles" className="pl-9" aria-label="Search exercises" />
      </div>
      {!q && alternatives.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Suggested alternatives</div>
          {alternatives.map((a) => (
            <button key={a.exercise.id} onClick={() => onPick(a.exercise.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
              <span>
                <span className="text-sm font-medium">{a.exercise.name}</span>
                <span className="block text-xs text-slate-500">{a.reasons.join(' · ')}</span>
              </span>
              {!a.available && <Badge tone="amber">check equipment</Badge>}
            </button>
          ))}
        </div>
      )}
      <div className="mb-1 text-xs font-semibold uppercase text-slate-500">All exercises</div>
      {list.map((e) => (
        <button key={e.id} onClick={() => onPick(e.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
          <span>
            <span className="text-sm font-medium">{e.name}</span>
            <span className="block text-xs capitalize text-slate-500">{e.primaryMuscles.join(', ')}</span>
          </span>
          {!available(e.id) && <Badge tone="amber">unavailable</Badge>}
        </button>
      ))}
      <Link to="/exercises/new" className="mt-2 block text-center text-sm text-brand-700 underline">
        Create a custom exercise
      </Link>
    </Sheet>
  );
}
