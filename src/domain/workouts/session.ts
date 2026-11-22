import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';
import { suggestNext, type Suggestion } from './progression';
import type { Exercise, ExerciseSession, ExerciseSet, ProgressionRule, SetType, WorkoutSession, WorkoutTemplate, TemplateExercise } from './types';

export const DEFAULT_PROGRESSION: ProgressionRule = { method: 'double', incrementKg: null, maxRpeToProgress: null, repStep: 1, timeStepSec: 30 };

/**
 * Performances are only directly comparable when the resistance system is the same.
 * Machines and cables differ between gyms, so their key includes the gym; free weights and
 * bodyweight are comparable everywhere. A recorded variant (e.g. a different machine) also splits the key.
 */
export function comparisonKey(exerciseId: string, loadType: ExerciseSession['loadType'], gymId: string | null, variant = ''): string {
  const gymPart = loadType === 'machine' || loadType === 'cable' ? `@${gymId ?? 'unknown'}` : '';
  return `${exerciseId}${gymPart}${variant.trim() ? `#${variant.trim().toLowerCase()}` : ''}`;
}

export function sessionComparisonKey(s: WorkoutSession, es: ExerciseSession): string {
  return comparisonKey(es.exerciseId, es.loadType, s.gymId, es.variant);
}

export interface PreviousPerformance {
  session: WorkoutSession;
  exercise: ExerciseSession;
}

/** Most recent completed performances of a comparable exercise, newest first. */
export function previousPerformances(history: WorkoutSession[], key: string, excludeSessionId?: string, limit = 2): PreviousPerformance[] {
  const out: PreviousPerformance[] = [];
  const sorted = history.filter((s) => s.status === 'completed' && s.id !== excludeSessionId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const s of sorted) {
    for (const es of s.exercises) {
      if (sessionComparisonKey(s, es) === key && es.sets.some((x) => x.completed)) {
        out.push({ session: s, exercise: es });
        break;
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function emptySet(type: SetType = 'working', weightKg: number | null = null, reps: number | null = null): ExerciseSet {
  return { id: newId('set'), type, weightKg, reps, addedKg: null, assistanceKg: null, durationSec: null, distanceM: null, rpe: null, rir: null, completed: false, completedAt: null };
}

export function defaultIncrement(ex: Exercise, equipmentIncrements: Map<string, number | null>): number {
  if (ex.incrementKg) return ex.incrementKg;
  for (const id of ex.equipmentIds) {
    const inc = equipmentIncrements.get(id);
    if (inc) return inc;
  }
  return ex.loadType === 'free-weight' ? 2.5 : 5;
}

/** Builds an exercise block with sets prepopulated from the progression suggestion or last performance. */
export function buildExerciseSession(params: {
  exercise: Exercise;
  templateExercise: TemplateExercise | null;
  history: WorkoutSession[];
  gymId: string | null;
  equipmentIncrements: Map<string, number | null>;
}): { exerciseSession: ExerciseSession; suggestion: Suggestion | null } {
  const { exercise, templateExercise: te, history, gymId } = params;
  const key = comparisonKey(exercise.id, exercise.loadType, gymId);
  const prev = previousPerformances(history, key, undefined, 2);
  const target = te
    ? { sets: te.sets, repMin: te.repMin, repMax: te.repMax, restSec: te.restSec, progression: te.progression, targetDurationSec: te.targetDurationSec ?? null }
    : { sets: 3, repMin: 8, repMax: 12, restSec: 90, progression: DEFAULT_PROGRESSION, targetDurationSec: null };
  const suggestion =
    exercise.type === 'strength' || target.progression.method === 'time'
      ? suggestNext({
          previous: prev[0]?.exercise ?? null,
          previousToPrevious: prev[1]?.exercise ?? null,
          target: { ...target, targetWeightKg: te?.targetWeightKg ?? null },
          rule: target.progression,
          defaultIncrementKg: defaultIncrement(exercise, params.equipmentIncrements)
        })
      : null;
  const sets: ExerciseSet[] = [];
  const lastWarmups = prev[0]?.exercise.sets.filter((s) => s.type === 'warmup') ?? [];
  const warmups = te?.warmupSets ?? 0;
  for (let i = 0; i < warmups; i++) {
    const w = lastWarmups[i];
    sets.push(emptySet('warmup', w?.weightKg ?? null, w?.reps ?? null));
  }
  const lastWorking = prev[0]?.exercise.sets.filter((s) => s.type !== 'warmup') ?? [];
  for (let i = 0; i < target.sets; i++) {
    const s = emptySet('working', suggestion?.weightKg ?? lastWorking[i]?.weightKg ?? null, suggestion?.reps ?? lastWorking[i]?.reps ?? (target.repMin || null));
    if (exercise.tracking === 'bodyweight_reps') {
      s.weightKg = null;
      s.addedKg = lastWorking[i]?.addedKg ?? null;
    }
    if (exercise.tracking === 'assisted_bodyweight') {
      s.weightKg = null;
      s.assistanceKg = lastWorking[i]?.assistanceKg ?? null;
    }
    if (exercise.tracking === 'duration' || exercise.tracking === 'distance_duration') {
      s.weightKg = null;
      s.reps = null;
      s.durationSec = suggestion?.durationSec ?? lastWorking[i]?.durationSec ?? target.targetDurationSec ?? null;
      s.distanceM = lastWorking[i]?.distanceM ?? null;
    }
    sets.push(s);
  }
  return {
    exerciseSession: { id: newId('es'), exerciseId: exercise.id, exerciseName: exercise.name, tracking: exercise.tracking, loadType: exercise.loadType, target, sets, notes: '', replacedExerciseId: null, variant: '' },
    suggestion
  };
}

export function startSession(params: {
  template: WorkoutTemplate | null;
  programmeId?: string | null;
  exercises: Map<string, Exercise>;
  history: WorkoutSession[];
  gymId: string | null;
  equipmentIncrements: Map<string, number | null>;
  bodyweightKg?: number | null;
  now?: string;
}): WorkoutSession {
  const now = params.now ?? nowIso();
  const blocks: ExerciseSession[] = [];
  for (const te of params.template?.exercises ?? []) {
    const ex = params.exercises.get(te.exerciseId);
    if (!ex) continue;
    blocks.push(buildExerciseSession({ exercise: ex, templateExercise: te, history: params.history, gymId: params.gymId, equipmentIncrements: params.equipmentIncrements }).exerciseSession);
  }
  return {
    id: newId('ws'),
    name: params.template?.name ?? 'Quick workout',
    templateId: params.template?.id ?? null,
    programmeId: params.programmeId ?? null,
    gymId: params.gymId,
    status: 'active',
    startedAt: now,
    endedAt: null,
    exercises: blocks,
    notes: '',
    bodyweightKg: params.bodyweightKg ?? null,
    restTimer: null,
    revision: 0,
    editedAt: null,
    updatedAt: now
  };
}

/* ------------ pure session mutations (return new objects) ------------ */

const touch = (s: WorkoutSession): WorkoutSession => ({ ...s, updatedAt: nowIso() });

export function updateSet(s: WorkoutSession, esId: string, setId: string, patch: Partial<ExerciseSet>): WorkoutSession {
  return touch({ ...s, exercises: s.exercises.map((es) => (es.id !== esId ? es : { ...es, sets: es.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) })) });
}

export function toggleSetComplete(s: WorkoutSession, esId: string, setId: string, at = nowIso()): WorkoutSession {
  const es = s.exercises.find((e) => e.id === esId);
  const set = es?.sets.find((x) => x.id === setId);
  if (!set) return s;
  return updateSet(s, esId, setId, set.completed ? { completed: false, completedAt: null } : { completed: true, completedAt: at });
}

export function addSet(s: WorkoutSession, esId: string): WorkoutSession {
  return touch({
    ...s,
    exercises: s.exercises.map((es) => {
      if (es.id !== esId) return es;
      const last = es.sets[es.sets.length - 1];
      const n = emptySet(last?.type === 'warmup' ? 'working' : last?.type ?? 'working', last?.weightKg ?? null, last?.reps ?? null);
      n.addedKg = last?.addedKg ?? null;
      n.assistanceKg = last?.assistanceKg ?? null;
      n.durationSec = last?.durationSec ?? null;
      return { ...es, sets: [...es.sets, n] };
    })
  });
}

export function removeSet(s: WorkoutSession, esId: string, setId: string): WorkoutSession {
  return touch({ ...s, exercises: s.exercises.map((es) => (es.id !== esId ? es : { ...es, sets: es.sets.filter((x) => x.id !== setId) })) });
}

export function addExerciseToSession(s: WorkoutSession, es: ExerciseSession): WorkoutSession {
  return touch({ ...s, exercises: [...s.exercises, es] });
}

export function removeExerciseFromSession(s: WorkoutSession, esId: string): WorkoutSession {
  return touch({ ...s, exercises: s.exercises.filter((e) => e.id !== esId) });
}

export function moveExercise(s: WorkoutSession, esId: string, dir: -1 | 1): WorkoutSession {
  const i = s.exercises.findIndex((e) => e.id === esId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.exercises.length) return s;
  const list = [...s.exercises];
  [list[i], list[j]] = [list[j]!, list[i]!];
  return touch({ ...s, exercises: list });
}

/** Replaces an exercise, keeping the target scheme but not the previous exercise's loads (they aren't comparable). */
export function replaceExercise(s: WorkoutSession, esId: string, replacement: ExerciseSession): WorkoutSession {
  return touch({ ...s, exercises: s.exercises.map((es) => (es.id !== esId ? es : { ...replacement, target: es.target ?? replacement.target, replacedExerciseId: es.exerciseId })) });
}

export function completeSession(s: WorkoutSession, at = nowIso()): WorkoutSession {
  return { ...s, status: 'completed', endedAt: at, restTimer: null, updatedAt: at };
}

/** Edits a completed session; bumps revision so history views can show it was edited. */
export function editCompletedSession(s: WorkoutSession, change: (s: WorkoutSession) => WorkoutSession): WorkoutSession {
  if (s.status !== 'completed') throw new Error('Only completed sessions can be edited this way');
  const edited = change(s);
  return { ...edited, status: 'completed', id: s.id, startedAt: edited.startedAt, revision: s.revision + 1, editedAt: nowIso() };
}

/* ------------ next workout from a programme ------------ */

export function nextTemplateInProgramme(programme: { templateIds: string[]; schedule: { type: 'rotation' } | { type: 'weekdays'; days: { weekday: number; templateId: string }[] } }, history: WorkoutSession[], today: Date = new Date()): { templateId: string; when: string } | null {
  if (!programme.templateIds.length) return null;
  if (programme.schedule.type === 'rotation') {
    const last = history
      .filter((s) => s.status === 'completed' && s.templateId && programme.templateIds.includes(s.templateId))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const idx = last ? (programme.templateIds.indexOf(last.templateId!) + 1) % programme.templateIds.length : 0;
    return { templateId: programme.templateIds[idx]!, when: 'Next in rotation' };
  }
  const days = programme.schedule.days;
  if (!days.length) return null;
  for (let offset = 0; offset < 7; offset++) {
    const wd = (today.getDay() + offset) % 7;
    const d = days.find((x) => x.weekday === wd);
    if (d) return { templateId: d.templateId, when: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd]! };
  }
  return null;
}
