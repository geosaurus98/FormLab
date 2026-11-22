import type { ExerciseSession, ExerciseSet, WorkoutSession } from './types';
import { sessionComparisonKey } from './session';

/** Epley estimate. Only applied to 1–10 rep sets with external load; always labelled an estimate. */
export const E1RM_MAX_REPS = 10;
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps >= 1) || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function e1rmApplicable(es: Pick<ExerciseSession, 'tracking' | 'loadType'>): boolean {
  return es.tracking === 'weight_reps' && es.loadType !== 'bodyweight' && es.loadType !== 'none';
}

const countsForRecords = (s: ExerciseSet) => s.completed && s.type !== 'warmup' && s.reps != null && s.reps > 0;

/** Volume = Σ weight × reps of completed non-warm-up sets; only meaningful for externally loaded exercises. */
export function exerciseVolume(es: ExerciseSession): number | null {
  if (es.tracking !== 'weight_reps') return null;
  return es.sets.filter(countsForRecords).reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
}

export function sessionVolume(s: WorkoutSession): number {
  return s.exercises.reduce((sum, es) => sum + (exerciseVolume(es) ?? 0), 0);
}

export type RecordKind = 'max-weight' | 'max-reps-at-weight' | 'e1rm' | 'max-volume' | 'max-reps';

export interface PersonalRecord {
  kind: RecordKind;
  key: string;
  exerciseId: string;
  exerciseName: string;
  value: number;
  /** for reps-at-weight records */
  atWeightKg?: number;
  sessionId: string;
  date: string;
  estimate: boolean;
  label: string;
}

interface Best {
  maxWeight?: PersonalRecord;
  e1rm?: PersonalRecord;
  volume?: PersonalRecord;
  maxReps?: PersonalRecord;
  repsAtWeight: Map<number, PersonalRecord>;
}

function evaluate(session: WorkoutSession, es: ExerciseSession, best: Best, key: string, onNew: (r: PersonalRecord) => void) {
  const date = session.startedAt;
  const mk = (kind: RecordKind, value: number, label: string, extra: Partial<PersonalRecord> = {}): PersonalRecord => ({ kind, key, exerciseId: es.exerciseId, exerciseName: es.exerciseName, value, sessionId: session.id, date, estimate: kind === 'e1rm', label, ...extra });
  const sets = es.sets.filter(countsForRecords);
  if (!sets.length) return;
  if (es.tracking === 'weight_reps') {
    const top = Math.max(...sets.map((s) => s.weightKg ?? 0));
    if (top > 0 && (!best.maxWeight || top > best.maxWeight.value)) {
      best.maxWeight = mk('max-weight', top, `Heaviest weight: ${top} kg`);
      onNew(best.maxWeight);
    }
    for (const s of sets) {
      const w = s.weightKg ?? 0;
      if (w <= 0) continue;
      const cur = best.repsAtWeight.get(w);
      if (!cur || (s.reps ?? 0) > cur.value) {
        const r = mk('max-reps-at-weight', s.reps ?? 0, `Most reps at ${w} kg: ${s.reps}`, { atWeightKg: w });
        best.repsAtWeight.set(w, r);
        // Only announce if it beats or matches a heavier weight's rep count (a genuine improvement)
        if (cur) onNew(r);
      }
    }
    if (e1rmApplicable(es)) {
      const e = Math.max(0, ...sets.map((s) => estimateOneRepMax(s.weightKg ?? 0, s.reps ?? 0) ?? 0));
      if (e > 0 && (!best.e1rm || e > best.e1rm.value + 1e-9)) {
        best.e1rm = mk('e1rm', Math.round(e * 10) / 10, `Estimated 1RM: ${Math.round(e * 10) / 10} kg (Epley, estimate)`);
        onNew(best.e1rm);
      }
    }
    const vol = exerciseVolume(es) ?? 0;
    if (vol > 0 && (!best.volume || vol > best.volume.value)) {
      best.volume = mk('max-volume', vol, `Session volume: ${Math.round(vol)} kg`);
      onNew(best.volume);
    }
  } else if (es.tracking === 'bodyweight_reps' || es.tracking === 'reps' || es.tracking === 'assisted_bodyweight') {
    // For assisted exercises, less assistance is harder: only compare reps at the same assistance level.
    const r = Math.max(...sets.map((s) => s.reps ?? 0));
    const assistance = es.tracking === 'assisted_bodyweight' ? Math.min(...sets.map((s) => s.assistanceKg ?? 0)) : undefined;
    const bodyKey = assistance != null ? -assistance - 1 : -1;
    const cur = best.repsAtWeight.get(bodyKey);
    if (!cur || r > cur.value) {
      const rec = mk('max-reps', r, assistance != null ? `Most reps with ${assistance} kg assistance: ${r}` : `Most reps: ${r}`);
      best.repsAtWeight.set(bodyKey, rec);
      if (!best.maxReps || r > best.maxReps.value) best.maxReps = rec;
      onNew(rec);
    }
  }
}

/**
 * Computes records per comparison key from history (derived, never stored as mutable truth), so
 * editing a completed workout can't leave stale records behind. Also returns the records first set
 * in each session (useful for "PRs this session"), excluding a key's first-ever session.
 */
export function computeRecords(history: WorkoutSession[]): { byKey: Map<string, PersonalRecord[]>; newInSession: Map<string, PersonalRecord[]> } {
  const sessions = history.filter((s) => s.status === 'completed').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const bests = new Map<string, Best>();
  const seen = new Set<string>();
  const newInSession = new Map<string, PersonalRecord[]>();
  for (const s of sessions) {
    for (const es of s.exercises) {
      const key = sessionComparisonKey(s, es);
      const best = bests.get(key) ?? { repsAtWeight: new Map() };
      bests.set(key, best);
      const first = !seen.has(key);
      evaluate(s, es, best, key, (r) => {
        if (first) return;
        (newInSession.get(s.id) ?? newInSession.set(s.id, []).get(s.id)!).push(r);
      });
      if (es.sets.some(countsForRecords)) seen.add(key);
    }
  }
  const byKey = new Map<string, PersonalRecord[]>();
  for (const [key, b] of bests) {
    const list = [b.maxWeight, b.e1rm, b.volume, b.maxReps].filter((x): x is PersonalRecord => !!x);
    byKey.set(key, list);
  }
  return { byKey, newInSession };
}

export interface ProgressPoint {
  date: string;
  sessionId: string;
  topWeightKg: number | null;
  e1rmKg: number | null;
  totalReps: number;
  volumeKg: number | null;
}

/** Per-session progression for one comparison key. */
export function exerciseProgress(history: WorkoutSession[], key: string): ProgressPoint[] {
  return history
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((s) =>
      s.exercises
        .filter((es) => sessionComparisonKey(s, es) === key)
        .map((es) => {
          const sets = es.sets.filter(countsForRecords);
          if (!sets.length) return null;
          const top = es.tracking === 'weight_reps' ? Math.max(...sets.map((x) => x.weightKg ?? 0)) : null;
          const e = e1rmApplicable(es) ? Math.max(0, ...sets.map((x) => estimateOneRepMax(x.weightKg ?? 0, x.reps ?? 0) ?? 0)) : 0;
          return { date: s.startedAt, sessionId: s.id, topWeightKg: top, e1rmKg: e > 0 ? Math.round(e * 10) / 10 : null, totalReps: sets.reduce((a, x) => a + (x.reps ?? 0), 0), volumeKg: exerciseVolume(es) } satisfies ProgressPoint;
        })
        .filter((p): p is ProgressPoint => p != null)
    );
}

export interface SessionSummary {
  durationMs: number;
  exercisesCompleted: number;
  setsCompleted: number;
  volumeKg: number;
  records: PersonalRecord[];
  comparison: { previousSessionId: string; previousVolumeKg: number; previousSets: number; previousDurationMs: number } | null;
}

export function summariseSession(session: WorkoutSession, history: WorkoutSession[]): SessionSummary {
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const all = [...history.filter((h) => h.id !== session.id), { ...session, status: 'completed' as const }];
  const { newInSession } = computeRecords(all);
  const prev = session.templateId
    ? history.filter((h) => h.status === 'completed' && h.templateId === session.templateId && h.id !== session.id && h.startedAt < session.startedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    : undefined;
  const setsDone = (s: WorkoutSession) => s.exercises.reduce((n, es) => n + es.sets.filter((x) => x.completed).length, 0);
  return {
    durationMs: end - new Date(session.startedAt).getTime(),
    exercisesCompleted: session.exercises.filter((es) => es.sets.some((x) => x.completed)).length,
    setsCompleted: setsDone(session),
    volumeKg: sessionVolume(session),
    records: newInSession.get(session.id) ?? [],
    comparison: prev ? { previousSessionId: prev.id, previousVolumeKg: sessionVolume(prev), previousSets: setsDone(prev), previousDurationMs: (prev.endedAt ? new Date(prev.endedAt).getTime() : 0) - new Date(prev.startedAt).getTime() } : null
  };
}

/** Sets per primary muscle across sessions (working sets only). */
export function muscleSetDistribution(sessions: WorkoutSession[], primaryMuscles: (exerciseId: string) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    for (const es of s.exercises) {
      const n = es.sets.filter((x) => x.completed && x.type !== 'warmup').length;
      for (const m of primaryMuscles(es.exerciseId)) out[m] = (out[m] ?? 0) + n;
    }
  }
  return out;
}
