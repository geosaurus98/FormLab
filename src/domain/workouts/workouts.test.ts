import { describe, expect, it } from 'vitest';
import { addSet, comparisonKey, completeSession, editCompletedSession, nextTemplateInProgramme, previousPerformances, replaceExercise, startSession, toggleSetComplete, updateSet, buildExerciseSession, DEFAULT_PROGRESSION } from './session';
import { suggestNext } from './progression';
import { computeRecords, estimateOneRepMax, exerciseProgress, summariseSession } from './records';
import { extendTimer, pauseTimer, remainingMs, resumeTimer, startTimer } from './timer';
import { findAlternatives } from './alternatives';
import { estimateCardioKcal, isLikelyDuplicate } from './cardio';
import { exampleProgrammes, SEED_EQUIPMENT, seedExercises } from '../../data/exercises';
import type { ExerciseSession, WorkoutSession } from './types';

const exercises = new Map(seedExercises().map((e) => [e.id, e]));
const equipment = new Map(SEED_EQUIPMENT.map((e) => [e.id, e]));
const incs = new Map(SEED_EQUIPMENT.map((e) => [e.id, e.incrementKg]));
const { templates, programmes } = exampleProgrammes('2026-01-01T00:00:00.000Z');
const fullBody = templates.find((t) => t.id === 'tpl_fb_beginner')!;

function doWorkout(start: string, gymId: string, history: WorkoutSession[], perform: (es: ExerciseSession) => { w: number; r: number }[]): WorkoutSession {
  let s = startSession({ template: fullBody, exercises, history, gymId, equipmentIncrements: incs, now: start });
  for (const es of s.exercises) {
    const plan = perform(es);
    es.sets.forEach((set, i) => {
      const p = plan[i];
      if (!p) return;
      s = updateSet(s, es.id, set.id, { weightKg: p.w, reps: p.r });
      s = toggleSetComplete(s, es.id, set.id, start);
    });
  }
  return completeSession(s, new Date(new Date(start).getTime() + 3_600_000).toISOString());
}

describe('starting and logging workouts', () => {
  it('creates an active session populated from the template', () => {
    const s = startSession({ template: fullBody, exercises, history: [], gymId: 'g1', equipmentIncrements: incs });
    expect(s.status).toBe('active');
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(fullBody.exercises.map((e) => e.exerciseId));
    expect(s.exercises[1]!.sets).toHaveLength(3);
    expect(s.exercises[1]!.target?.repMax).toBe(12);
  });

  it('logs sets with one-tap completion and adds sets copying the previous one', () => {
    let s = startSession({ template: fullBody, exercises, history: [], gymId: 'g1', equipmentIncrements: incs });
    const es = s.exercises[1]!;
    s = updateSet(s, es.id, es.sets[0]!.id, { weightKg: 40, reps: 10 });
    s = toggleSetComplete(s, es.id, es.sets[0]!.id);
    expect(s.exercises[1]!.sets[0]).toMatchObject({ completed: true, weightKg: 40, reps: 10 });
    s = addSet(s, es.id);
    expect(s.exercises[1]!.sets[3]).toMatchObject({ weightKg: null, completed: false });
    s = toggleSetComplete(s, es.id, es.sets[0]!.id);
    expect(s.exercises[1]!.sets[0]!.completed).toBe(false);
  });

  it('prepopulates from previous performance and suggests progression', () => {
    const first = doWorkout('2026-01-05T08:00:00.000Z', 'g1', [], () => [{ w: 40, r: 12 }, { w: 40, r: 12 }, { w: 40, r: 12 }]);
    const second = startSession({ template: fullBody, exercises, history: [first], gymId: 'g1', equipmentIncrements: incs });
    const chest = second.exercises.find((e) => e.exerciseId === 'ex_chest_press')!;
    expect(chest.sets[0]!.weightKg).toBe(45); // +5 kg machine increment
    expect(chest.sets[0]!.reps).toBe(8);
    const prev = previousPerformances([first], comparisonKey('ex_chest_press', 'machine', 'g1'));
    expect(prev[0]!.exercise.sets[0]!.weightKg).toBe(40);
  });

  it('does not compare machine performance across gyms', () => {
    const first = doWorkout('2026-01-05T08:00:00.000Z', 'g1', [], () => [{ w: 40, r: 12 }, { w: 40, r: 12 }, { w: 40, r: 12 }]);
    const otherGym = startSession({ template: fullBody, exercises, history: [first], gymId: 'g2', equipmentIncrements: incs });
    expect(otherGym.exercises.find((e) => e.exerciseId === 'ex_chest_press')!.sets[0]!.weightKg).toBeNull();
    expect(comparisonKey('ex_db_bench_press', 'free-weight', 'g1')).toBe(comparisonKey('ex_db_bench_press', 'free-weight', 'g2'));
  });

  it('replacing an exercise keeps the target scheme but records the substitution', () => {
    const s = startSession({ template: fullBody, exercises, history: [], gymId: 'g1', equipmentIncrements: incs });
    const old = s.exercises[1]!;
    const block = buildExerciseSession({ exercise: exercises.get('ex_db_bench_press')!, templateExercise: null, history: [], gymId: 'g1', equipmentIncrements: incs }).exerciseSession;
    const r = replaceExercise(s, old.id, block);
    const replaced = r.exercises.find((e) => e.exerciseId === 'ex_db_bench_press')!;
    expect(replaced.replacedExerciseId).toBe('ex_chest_press');
    expect(replaced.target?.repMax).toBe(old.target?.repMax);
  });

  it('editing a completed workout bumps revision and recomputes records', () => {
    const w = doWorkout('2026-01-05T08:00:00.000Z', 'g1', [], () => [{ w: 40, r: 10 }, { w: 40, r: 10 }, { w: 40, r: 10 }]);
    const chest = w.exercises.find((e) => e.exerciseId === 'ex_chest_press')!;
    const edited = editCompletedSession(w, (s) => updateSet(s, chest.id, chest.sets[0]!.id, { weightKg: 50 }));
    expect(edited.revision).toBe(1);
    expect(edited.status).toBe('completed');
    const recs = computeRecords([edited]).byKey.get(comparisonKey('ex_chest_press', 'machine', 'g1'))!;
    expect(recs.find((r) => r.kind === 'max-weight')!.value).toBe(50);
    expect(w.exercises.find((e) => e.exerciseId === 'ex_chest_press')!.sets[0]!.weightKg).toBe(40);
  });
});

describe('progression rules', () => {
  const target = { sets: 3, repMin: 8, repMax: 12 };
  const prev = (reps: number[], w = 40, rpe: number | null = null): ExerciseSession => ({ id: 'e', exerciseId: 'x', exerciseName: 'x', tracking: 'weight_reps', loadType: 'machine', target: null, notes: '', replacedExerciseId: null, variant: '', sets: reps.map((r, i) => ({ id: String(i), type: 'working', weightKg: w, reps: r, addedKg: null, assistanceKg: null, durationSec: null, distanceM: null, rpe, rir: null, completed: true, completedAt: null })) });

  it('double progression increases only when all sets hit the top of the range', () => {
    expect(suggestNext({ previous: prev([12, 12, 12]), target, rule: DEFAULT_PROGRESSION, defaultIncrementKg: 5 })).toMatchObject({ weightKg: 45, reps: 8, kind: 'increase' });
    expect(suggestNext({ previous: prev([12, 11, 10]), target, rule: DEFAULT_PROGRESSION, defaultIncrementKg: 5 })).toMatchObject({ weightKg: 40, reps: 11, kind: 'hold' });
  });
  it('respects an effort ceiling', () => {
    expect(suggestNext({ previous: prev([12, 12, 12], 40, 10), target, rule: { ...DEFAULT_PROGRESSION, maxRpeToProgress: 9 }, defaultIncrementKg: 5 }).kind).toBe('hold');
  });
  it('does not increase when performance declined', () => {
    const s = suggestNext({ previous: prev([12, 12, 12]), previousToPrevious: prev([12, 12, 12, 12]), target, rule: DEFAULT_PROGRESSION, defaultIncrementKg: 5 });
    expect(s.kind).toBe('hold');
    expect(s.weightKg).toBe(40);
  });
  it('supports fixed, reps, time and manual methods', () => {
    expect(suggestNext({ previous: prev([8, 8, 8]), target, rule: { ...DEFAULT_PROGRESSION, method: 'fixed', incrementKg: 2.5 }, defaultIncrementKg: 5 }).weightKg).toBe(42.5);
    expect(suggestNext({ previous: prev([10, 10, 10]), target, rule: { ...DEFAULT_PROGRESSION, method: 'reps' }, defaultIncrementKg: 5 }).reps).toBe(11);
    const timed = prev([0]);
    timed.sets[0]!.durationSec = 30;
    expect(suggestNext({ previous: timed, target, rule: { ...DEFAULT_PROGRESSION, method: 'time' }, defaultIncrementKg: 5 }).durationSec).toBe(60);
    expect(suggestNext({ previous: prev([9, 9, 9]), target, rule: { ...DEFAULT_PROGRESSION, method: 'manual' }, defaultIncrementKg: 5 })).toMatchObject({ weightKg: 40, reps: 9 });
  });
});

describe('records and analytics', () => {
  it('estimates 1RM only for applicable rep ranges', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimateOneRepMax(100, 15)).toBeNull();
  });
  it('detects records set after the first session and summarises', () => {
    const w1 = doWorkout('2026-01-05T08:00:00.000Z', 'g1', [], () => [{ w: 40, r: 10 }, { w: 40, r: 10 }, { w: 40, r: 10 }]);
    const w2 = doWorkout('2026-01-08T08:00:00.000Z', 'g1', [w1], () => [{ w: 45, r: 8 }, { w: 45, r: 8 }, { w: 45, r: 8 }]);
    const { newInSession } = computeRecords([w1, w2]);
    expect(newInSession.get(w1.id)).toBeUndefined();
    const kinds = newInSession.get(w2.id)!.filter((r) => r.exerciseId === 'ex_chest_press').map((r) => r.kind);
    expect(kinds).toContain('max-weight');
    const summary = summariseSession(w2, [w1]);
    expect(summary.durationMs).toBe(3_600_000);
    expect(summary.comparison?.previousSessionId).toBe(w1.id);
    expect(summary.records.length).toBeGreaterThan(0);
    const progress = exerciseProgress([w1, w2], comparisonKey('ex_chest_press', 'machine', 'g1'));
    expect(progress.map((p) => p.topWeightKg)).toEqual([40, 45]);
  });
  it('does not treat a session at a different gym as a record on the same machine', () => {
    const w1 = doWorkout('2026-01-05T08:00:00.000Z', 'g1', [], () => [{ w: 40, r: 10 }, { w: 40, r: 10 }, { w: 40, r: 10 }]);
    const w2 = doWorkout('2026-01-08T08:00:00.000Z', 'g2', [w1], () => [{ w: 80, r: 10 }, { w: 80, r: 10 }, { w: 80, r: 10 }]);
    const recs = computeRecords([w1, w2]).newInSession.get(w2.id) ?? [];
    expect(recs.some((r) => r.exerciseId === 'ex_chest_press')).toBe(false);
  });
});

describe('rest timer', () => {
  it('is timestamp based with pause, resume, extend and skip', () => {
    const t0 = 1_000_000;
    let t = startTimer(90, 'es', t0);
    expect(remainingMs(t, t0 + 30_000)).toBe(60_000);
    t = pauseTimer(t, t0 + 30_000);
    expect(remainingMs(t, t0 + 999_999)).toBe(60_000);
    t = resumeTimer(t, t0 + 100_000);
    expect(remainingMs(t, t0 + 110_000)).toBe(50_000);
    t = extendTimer(t, 30, t0 + 110_000);
    expect(remainingMs(t, t0 + 110_000)).toBe(80_000);
    expect(remainingMs(t, t0 + 10_000_000)).toBe(0);
  });
});

describe('programmes and alternatives', () => {
  it('rotates templates and schedules weekdays', () => {
    const ul = programmes.find((p) => p.id === 'prog_upper_lower')!;
    expect(nextTemplateInProgramme(ul, [])!.templateId).toBe('tpl_upper');
    const done = { ...startSession({ template: templates.find((t) => t.id === 'tpl_upper')!, exercises, history: [], gymId: null, equipmentIncrements: incs }), status: 'completed' as const };
    expect(nextTemplateInProgramme(ul, [done])!.templateId).toBe('tpl_lower');
    const three = programmes.find((p) => p.id === 'prog_3day_fb')!;
    expect(nextTemplateInProgramme(three, [], new Date(2026, 10, 24))!.templateId).toBe('tpl_3d_b'); // Tue → Wed
  });
  it('ranks alternatives by movement similarity and equipment availability', () => {
    const alts = findAlternatives(exercises.get('ex_chest_press')!, [...exercises.values()], equipment);
    expect(alts.slice(0, 2).map((a) => a.exercise.id).sort()).toEqual(['ex_bench_press', 'ex_db_bench_press']);
    const noRack = new Map(equipment);
    noRack.set('eq_rack', { ...equipment.get('eq_rack')!, available: false });
    expect(findAlternatives(exercises.get('ex_chest_press')!, [...exercises.values()], noRack)[0]!.exercise.id).toBe('ex_db_bench_press');
    expect(alts.every((a) => a.exercise.type === 'strength')).toBe(true);
  });
});

describe('cardio', () => {
  it('estimates energy only with a body weight, labelled as an estimate', () => {
    expect(estimateCardioKcal('walk', 60, null)).toBeNull();
    expect(estimateCardioKcal('walk', 60, 80)).toMatchObject({ kcal: 200, quality: 'estimate' });
  });
  it('detects duplicates between imported and manual activities', () => {
    const a = { type: 'walk' as const, date: '2026-01-01', startedAt: '2026-01-01T07:00:00Z', durationMin: 30, source: { kind: 'manual' as const } };
    expect(isLikelyDuplicate(a, { ...a, startedAt: '2026-01-01T07:05:00Z', durationMin: 32, source: { kind: 'import', externalId: 'x' } })).toBe(true);
    expect(isLikelyDuplicate(a, { ...a, startedAt: '2026-01-01T12:00:00Z', source: { kind: 'import' } })).toBe(false);
  });
});
