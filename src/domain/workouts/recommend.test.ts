import { describe, expect, it } from 'vitest';
import { estimateMinutes, fitToTime, muscleLastTrained, recommendTraining, type RecoveryPreferences } from './recommend';
import { completeSession, startSession, toggleSetComplete, updateSet } from './session';
import { exampleProgrammes, SEED_EQUIPMENT, seedExercises } from '../../data/exercises';
import type { Equipment, WorkoutSession } from './types';

const exercises = new Map(seedExercises().map((e) => [e.id, e]));
const equipment = new Map(SEED_EQUIPMENT.map((e) => [e.id, e]));
const incs = new Map(SEED_EQUIPMENT.map((e) => [e.id, e.incrementKg]));
const { templates, programmes } = exampleProgrammes('2026-01-01T00:00:00.000Z');
const recovery: RecoveryPreferences = { defaultHours: 48, overrides: {} };
const upper = templates.find((t) => t.id === 'tpl_upper')!;
const lower = templates.find((t) => t.id === 'tpl_lower')!;

function done(templateId: string, at: string): WorkoutSession {
  const t = templates.find((x) => x.id === templateId)!;
  let s = startSession({ template: t, exercises, history: [], gymId: 'g', equipmentIncrements: incs, now: at });
  for (const es of s.exercises) for (const set of es.sets) {
    s = updateSet(s, es.id, set.id, { weightKg: 20, reps: 10 });
    s = toggleSetComplete(s, es.id, set.id, at);
  }
  return completeSession(s, at);
}

const base = { templates: [upper, lower], programmes: [{ ...programmes.find((p) => p.id === 'prog_upper_lower')!, active: true }], exercises, equipment, recovery, weekStart: '2026-01-05', weeklyTarget: 4 };

describe('training recommendations', () => {
  it('recommends the next programme workout when muscles are recovered', () => {
    const r = recommendTraining({ ...base, history: [], availableMin: null, now: new Date('2026-01-05T08:00:00Z') });
    expect(r.kind).toBe('workout');
    expect(r.best!.template.id).toBe('tpl_upper');
    expect(r.best!.reasons.join(' ')).toMatch(/active programme/);
  });

  it('flags muscles inside the recovery window and prefers a different split', () => {
    const history = [done('tpl_upper', '2026-01-05T08:00:00Z')];
    const r = recommendTraining({ ...base, history, availableMin: null, now: new Date('2026-01-06T08:00:00Z') });
    expect(r.best!.template.id).toBe('tpl_lower');
    const upperA = [r.best!, ...r.alternatives].find((a) => a.template.id === 'tpl_upper')!;
    expect(upperA.warnings.join(' ')).toMatch(/chest \(24 h ago, preference 48 h\)/);
  });

  it('suggests rest or light cardio when every template conflicts with recovery', () => {
    const history = [done('tpl_upper', '2026-01-05T08:00:00Z'), done('tpl_lower', '2026-01-05T09:00:00Z')];
    const r = recommendTraining({ ...base, history, availableMin: null, now: new Date('2026-01-06T08:00:00Z') });
    expect(r.kind).toBe('rest-or-cardio');
    expect(r.summary.join(' ')).toMatch(/recovery window is your own setting/);
  });

  it('respects per-muscle recovery overrides', () => {
    const history = [done('tpl_upper', '2026-01-05T08:00:00Z'), done('tpl_lower', '2026-01-05T09:00:00Z')];
    const r = recommendTraining({ ...base, recovery: { defaultHours: 12, overrides: {} }, history, availableMin: null, now: new Date('2026-01-06T08:00:00Z') });
    expect(r.kind).toBe('workout');
  });

  it('swaps exercises whose equipment is unavailable', () => {
    const eq = new Map<string, Equipment>(equipment);
    eq.set('eq_lat_pulldown', { ...eq.get('eq_lat_pulldown')!, available: false });
    const r = recommendTraining({ ...base, equipment: eq, history: [], availableMin: null, now: new Date('2026-01-05T08:00:00Z') });
    const swap = r.best!.plan.find((p) => p.exerciseId === 'ex_lat_pulldown')!;
    expect(swap.action).toBe('swap');
    expect(swap.useExerciseId).toBe('ex_pull_up');
  });

  it('trims sets and then accessories to fit available time', () => {
    const r = recommendTraining({ ...base, history: [], availableMin: 30, now: new Date('2026-01-05T08:00:00Z') });
    const a = r.best!;
    expect(a.originalMinutes).toBeGreaterThan(30);
    expect(a.estimatedMinutes).toBeLessThanOrEqual(30);
    expect(a.plan[0]!.action).not.toBe('drop');
    expect(a.plan[0]!.sets).toBeGreaterThanOrEqual(2);
    expect(a.reasons.join(' ')).toMatch(/Shortened from/);
  });

  it('estimates duration from sets, rest and overhead', () => {
    expect(estimateMinutes([{ sets: 3, restSec: 60 }])).toBe(Math.round((3 * 45 + 2 * 60 + 90) / 60 + 5));
    expect(estimateMinutes([])).toBe(0);
  });

  it('fitToTime never drops the first exercise', () => {
    const plan = upper.exercises.map((te) => ({ templateExerciseId: te.id, exerciseId: te.exerciseId, useExerciseId: te.exerciseId, sets: te.sets, originalSets: te.sets, action: 'keep' as const, reason: null }));
    const out = fitToTime(plan, () => 120, 5);
    expect(out[0]!.action).not.toBe('drop');
    expect(out.slice(1).every((p) => p.action === 'drop')).toBe(true);
  });

  it('computes last-trained hours per primary muscle', () => {
    const m = muscleLastTrained([done('tpl_lower', '2026-01-05T08:00:00Z')], exercises, new Date('2026-01-05T20:00:00Z').getTime());
    expect(m.get('quads')).toBeCloseTo(12);
    expect(m.has('chest')).toBe(false);
  });

  it('handles no templates', () => {
    expect(recommendTraining({ ...base, templates: [], history: [], availableMin: null }).kind).toBe('no-templates');
  });
});
