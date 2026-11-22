import type { ExerciseSession, ExerciseSet, ProgressionRule } from './types';

export interface Suggestion {
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  /** plain-language explanation of how the suggestion was derived */
  reason: string;
  kind: 'increase' | 'hold' | 'decrease-not-applied' | 'first-time' | 'manual';
}

export const workingSets = (sets: ExerciseSet[]) => sets.filter((s) => s.completed && (s.type === 'working' || s.type === 'failure'));

const roundToIncrement = (kg: number, inc: number) => Math.round(kg / inc) * inc;

/**
 * Progression suggestion for the next session from the previous performance of the same exercise.
 * - double: when every working set reaches the top of the rep range (and effort within limit),
 *   add one increment and return to the bottom of the range; otherwise keep the load and aim for +1 rep.
 * - fixed: add one increment when all target sets were completed at ≥ repMin.
 * - reps: keep load, add repStep.
 * - time: add timeStepSec to duration.
 * - manual: repeat last performance.
 * A decline never triggers an increase.
 */
export function suggestNext(params: {
  previous: ExerciseSession | null;
  target: { sets: number; repMin: number; repMax: number; targetWeightKg?: number | null; targetDurationSec?: number | null };
  rule: ProgressionRule;
  defaultIncrementKg: number;
  previousToPrevious?: ExerciseSession | null;
}): Suggestion {
  const { previous, target, rule } = params;
  const inc = rule.incrementKg ?? params.defaultIncrementKg;
  if (!previous) {
    return { weightKg: target.targetWeightKg ?? null, reps: target.repMin || null, durationSec: target.targetDurationSec ?? null, reason: target.targetWeightKg ? 'Template target weight (no previous session recorded).' : 'No previous session — choose a comfortable starting weight.', kind: 'first-time' };
  }
  const ws = workingSets(previous.sets);
  if (!ws.length) return { weightKg: target.targetWeightKg ?? null, reps: target.repMin || null, durationSec: target.targetDurationSec ?? null, reason: 'Previous session had no completed working sets.', kind: 'hold' };

  const topWeight = Math.max(...ws.map((s) => s.weightKg ?? 0));
  const atTop = ws.filter((s) => (s.weightKg ?? 0) === topWeight);
  const minRepsAtTop = Math.min(...atTop.map((s) => s.reps ?? 0));
  const maxRpe = Math.max(...ws.map((s) => s.rpe ?? 0));
  const effortOk = rule.maxRpeToProgress == null || maxRpe === 0 || maxRpe <= rule.maxRpeToProgress;
  const enoughSets = atTop.length >= target.sets;

  // Declining performance check vs the session before, at the same load
  if (params.previousToPrevious) {
    const prevWs = workingSets(params.previousToPrevious.sets).filter((s) => (s.weightKg ?? 0) === topWeight);
    const prevTotal = prevWs.reduce((a, s) => a + (s.reps ?? 0), 0);
    const curTotal = atTop.reduce((a, s) => a + (s.reps ?? 0), 0);
    if (prevWs.length && curTotal < prevTotal) {
      return { weightKg: topWeight, reps: minRepsAtTop, durationSec: null, reason: `Reps at ${topWeight} kg dropped (${prevTotal} → ${curTotal} total). Holding the weight; no increase suggested.`, kind: 'hold' };
    }
  }

  switch (rule.method) {
    case 'double': {
      if (enoughSets && minRepsAtTop >= target.repMax && effortOk) {
        const w = roundToIncrement(topWeight + inc, inc);
        return { weightKg: w, reps: target.repMin, durationSec: null, reason: `All ${atTop.length} working sets reached ${target.repMax} reps at ${topWeight} kg${maxRpe ? ` (max RPE ${maxRpe})` : ''}. Suggest +${inc} kg and ${target.repMin} reps.`, kind: 'increase' };
      }
      if (!effortOk) return { weightKg: topWeight, reps: minRepsAtTop, durationSec: null, reason: `Top-of-range reps reached but recorded RPE ${maxRpe} is above your limit of ${rule.maxRpeToProgress}. Holding weight.`, kind: 'hold' };
      const nextReps = Math.min(target.repMax, minRepsAtTop + 1);
      return { weightKg: topWeight, reps: nextReps, durationSec: null, reason: `Keep ${topWeight} kg and aim for ${nextReps} reps on every set (range ${target.repMin}–${target.repMax}).`, kind: 'hold' };
    }
    case 'fixed': {
      if (enoughSets && minRepsAtTop >= target.repMin && effortOk) return { weightKg: roundToIncrement(topWeight + inc, inc), reps: target.repMin, durationSec: null, reason: `All target sets completed at ${topWeight} kg. Fixed increment +${inc} kg.`, kind: 'increase' };
      return { weightKg: topWeight, reps: target.repMin, durationSec: null, reason: `Not all sets reached ${target.repMin} reps. Repeat ${topWeight} kg.`, kind: 'hold' };
    }
    case 'reps':
      return { weightKg: topWeight || null, reps: minRepsAtTop + rule.repStep, durationSec: null, reason: `Repetition progression: +${rule.repStep} rep(s) from ${minRepsAtTop}.`, kind: 'increase' };
    case 'time': {
      const lastDur = Math.max(...ws.map((s) => s.durationSec ?? 0));
      return { weightKg: null, reps: null, durationSec: lastDur + rule.timeStepSec, reason: `Time progression: +${rule.timeStepSec}s from ${lastDur}s.`, kind: 'increase' };
    }
    case 'manual':
    default:
      return { weightKg: topWeight || null, reps: minRepsAtTop || null, durationSec: null, reason: 'Manual progression — repeating last performance.', kind: 'manual' };
  }
}
