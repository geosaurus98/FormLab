import { findAlternatives } from './alternatives';
import { nextTemplateInProgramme } from './session';
import type { Equipment, Exercise, WorkoutProgramme, WorkoutSession, WorkoutTemplate } from './types';

/**
 * Rule-based, explainable training recommendations.
 *
 * Considers: the scheduled/next programme workout, recent training history per muscle group against
 * the user's own recovery preference, equipment availability (swaps), and available time (trims sets
 * and accessories). It never measures readiness or claims a workout is medically appropriate — it only
 * applies the user's stated preferences to what has been logged.
 */

export interface RecoveryPreferences {
  /** default minimum hours before training the same primary muscle again */
  defaultHours: number;
  /** per-muscle overrides */
  overrides: Record<string, number>;
}

export interface TimingAssumptions {
  /** seconds of work per set */
  secondsPerSet: number;
  /** fixed overhead per exercise (setup, walking to equipment), seconds */
  secondsPerExercise: number;
  /** warm-up / general overhead per session, minutes */
  sessionOverheadMin: number;
}

export const DEFAULT_TIMING: TimingAssumptions = { secondsPerSet: 45, secondsPerExercise: 90, sessionOverheadMin: 5 };

export type PlanAction = 'keep' | 'trim' | 'swap' | 'drop';

export interface PlannedExercise {
  templateExerciseId: string;
  exerciseId: string;
  /** exercise actually recommended (differs from exerciseId when swapped) */
  useExerciseId: string;
  sets: number;
  originalSets: number;
  action: PlanAction;
  reason: string | null;
}

export interface MuscleRecovery {
  muscle: string;
  hoursSince: number | null;
  requiredHours: number;
  recovered: boolean;
}

export interface TemplateAssessment {
  template: WorkoutTemplate;
  source: 'programme' | 'other-template';
  when: string | null;
  score: number;
  reasons: string[];
  warnings: string[];
  recovery: MuscleRecovery[];
  plan: PlannedExercise[];
  estimatedMinutes: number;
  originalMinutes: number;
}

export interface TrainingRecommendation {
  kind: 'workout' | 'rest-or-cardio' | 'no-templates';
  best: TemplateAssessment | null;
  alternatives: TemplateAssessment[];
  summary: string[];
  sessionsThisWeek: number;
  weeklyTarget: number | null;
}

export function estimateMinutes(items: { sets: number; restSec: number }[], t: TimingAssumptions = DEFAULT_TIMING): number {
  const sec = items.reduce((s, e) => s + e.sets * t.secondsPerSet + Math.max(0, e.sets - 1) * e.restSec + t.secondsPerExercise, 0);
  return Math.round(sec / 60 + (items.length ? t.sessionOverheadMin : 0));
}

/** Hours since each primary muscle last had a completed non-warm-up set. */
export function muscleLastTrained(history: WorkoutSession[], exercises: Map<string, Exercise>, now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of history) {
    if (s.status !== 'completed') continue;
    for (const es of s.exercises) {
      const done = es.sets.filter((x) => x.completed && x.type !== 'warmup');
      if (!done.length) continue;
      const t = Math.max(...done.map((x) => (x.completedAt ? new Date(x.completedAt).getTime() : new Date(s.endedAt ?? s.startedAt).getTime())));
      const hours = (now - t) / 3_600_000;
      for (const m of exercises.get(es.exerciseId)?.primaryMuscles ?? []) {
        if (m === 'cardio') continue;
        const cur = out.get(m);
        if (cur == null || hours < cur) out.set(m, hours);
      }
    }
  }
  return out;
}

/**
 * Trims a plan to fit `availableMin`: first reduces sets on later exercises (never below 2 for the
 * first two exercises, 1 for the rest), then drops exercises from the end. Earlier exercises are
 * assumed to be the main lifts, matching how templates are normally ordered.
 */
export function fitToTime(plan: PlannedExercise[], restSecOf: (p: PlannedExercise) => number, availableMin: number, t: TimingAssumptions = DEFAULT_TIMING): PlannedExercise[] {
  const items = plan.map((p) => ({ ...p }));
  const minutes = () => estimateMinutes(items.filter((p) => p.action !== 'drop').map((p) => ({ sets: p.sets, restSec: restSecOf(p) })), t);
  const floor = (i: number) => (i < 2 ? 2 : 1);
  // pass 1: remove one set at a time, from the last exercise backwards
  let changed = true;
  while (minutes() > availableMin && changed) {
    changed = false;
    for (let i = items.length - 1; i >= 0 && minutes() > availableMin; i--) {
      const p = items[i]!;
      if (p.action === 'drop' || p.sets <= floor(i)) continue;
      p.sets -= 1;
      changed = true;
    }
  }
  // pass 2: drop accessories from the end (keep at least one exercise)
  for (let i = items.length - 1; i >= 1 && minutes() > availableMin; i--) {
    if (items[i]!.action !== 'drop') items[i]!.action = 'drop';
  }
  for (const p of items) {
    if (p.action === 'drop') p.reason = `Dropped to fit ${availableMin} min`;
    else if (p.sets < p.originalSets && p.action !== 'swap') {
      p.action = 'trim';
      p.reason = `${p.originalSets} → ${p.sets} sets to fit ${availableMin} min`;
    } else if (p.sets < p.originalSets) p.reason = `${p.reason ?? ''}; ${p.originalSets} → ${p.sets} sets to fit time`.replace(/^; /, '');
  }
  return items;
}

export function assessTemplate(params: {
  template: WorkoutTemplate;
  source: TemplateAssessment['source'];
  when: string | null;
  exercises: Map<string, Exercise>;
  equipment: Map<string, Equipment>;
  lastTrained: Map<string, number>;
  recovery: RecoveryPreferences;
  availableMin: number | null;
  timing?: TimingAssumptions;
}): TemplateAssessment {
  const { template, exercises, equipment, lastTrained, recovery } = params;
  const timing = params.timing ?? DEFAULT_TIMING;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = params.source === 'programme' ? 40 : 10;
  if (params.source === 'programme') reasons.push(`${params.when ?? 'Next'} in your active programme`);

  const isAvailable = (ex: Exercise) => ex.equipmentIds.every((id) => equipment.get(id)?.available !== false);
  const allExercises = [...exercises.values()];
  let plan: PlannedExercise[] = template.exercises.map((te) => {
    const ex = exercises.get(te.exerciseId);
    const base: PlannedExercise = { templateExerciseId: te.id, exerciseId: te.exerciseId, useExerciseId: te.exerciseId, sets: te.sets, originalSets: te.sets, action: 'keep', reason: null };
    if (!ex) return { ...base, action: 'drop', reason: 'Exercise no longer exists' };
    if (isAvailable(ex)) return base;
    const alt = findAlternatives(ex, allExercises, equipment, 5).find((a) => a.available);
    if (alt) return { ...base, useExerciseId: alt.exercise.id, action: 'swap', reason: `${ex.name} needs equipment marked unavailable → ${alt.exercise.name} (${alt.reasons.slice(0, 2).join(', ')})` };
    return { ...base, action: 'drop', reason: `${ex.name}: equipment unavailable and no available alternative` };
  });
  const swaps = plan.filter((p) => p.action === 'swap').length;
  const unavailable = plan.filter((p) => p.action === 'drop').length;
  if (swaps) reasons.push(`${swaps} exercise(s) swapped for available equipment`);
  if (unavailable) {
    warnings.push(`${unavailable} exercise(s) can't be done with your available equipment`);
    score -= 10 * unavailable;
  }

  // Recovery, by primary muscles of exercises that will be performed
  const muscles = new Set<string>();
  for (const p of plan) if (p.action !== 'drop') for (const m of exercises.get(p.useExerciseId)?.primaryMuscles ?? []) if (m !== 'cardio') muscles.add(m);
  const rec: MuscleRecovery[] = [...muscles].map((m) => {
    const hoursSince = lastTrained.get(m) ?? null;
    const requiredHours = recovery.overrides[m] ?? recovery.defaultHours;
    return { muscle: m, hoursSince, requiredHours, recovered: hoursSince == null || hoursSince >= requiredHours };
  });
  const notRecovered = rec.filter((r) => !r.recovered);
  if (rec.length && !notRecovered.length) {
    score += 25;
    reasons.push('All target muscles are past your recovery preference');
  }
  if (notRecovered.length) {
    score -= 15 * notRecovered.length;
    warnings.push(`Within your recovery window: ${notRecovered.map((r) => `${r.muscle} (${Math.round(r.hoursSince!)} h ago, preference ${r.requiredHours} h)`).join(', ')}`);
  }

  const restOf = (p: PlannedExercise) => template.exercises.find((te) => te.id === p.templateExerciseId)?.restSec ?? 90;
  const originalMinutes = estimateMinutes(template.exercises.map((te) => ({ sets: te.sets, restSec: te.restSec })), timing);
  if (params.availableMin != null && originalMinutes > params.availableMin) {
    plan = fitToTime(plan, restOf, params.availableMin, timing);
    const dropped = plan.filter((p) => p.action === 'drop' && p.reason?.startsWith('Dropped to fit')).length;
    reasons.push(`Shortened from ~${originalMinutes} min to fit ${params.availableMin} min${dropped ? ` (${dropped} accessory exercise(s) dropped)` : ''}`);
    score -= 5;
  }
  const estimatedMinutes = estimateMinutes(plan.filter((p) => p.action !== 'drop').map((p) => ({ sets: p.sets, restSec: restOf(p) })), timing);
  if (!plan.some((p) => p.action !== 'drop')) {
    warnings.push('Nothing in this template can be done right now');
    score -= 100;
  }
  return { template, source: params.source, when: params.when, score, reasons, warnings, recovery: rec, plan, estimatedMinutes, originalMinutes };
}

export function recommendTraining(params: {
  templates: WorkoutTemplate[];
  programmes: WorkoutProgramme[];
  history: WorkoutSession[];
  exercises: Map<string, Exercise>;
  equipment: Map<string, Equipment>;
  recovery: RecoveryPreferences;
  availableMin: number | null;
  now?: Date;
  weekStart: string;
  weeklyTarget: number | null;
  timing?: TimingAssumptions;
}): TrainingRecommendation {
  const now = params.now ?? new Date();
  const active = params.templates.filter((t) => !t.archived && t.exercises.length);
  const completed = params.history.filter((s) => s.status === 'completed');
  const sessionsThisWeek = completed.filter((s) => s.startedAt.slice(0, 10) >= params.weekStart).length;
  const summary: string[] = [];
  if (!active.length) return { kind: 'no-templates', best: null, alternatives: [], summary: ['Create a workout template to get recommendations.'], sessionsThisWeek, weeklyTarget: params.weeklyTarget };

  const lastTrained = muscleLastTrained(completed, params.exercises, now.getTime());
  const programmeNext = new Map<string, string>();
  for (const p of params.programmes.filter((x) => x.active)) {
    const n = nextTemplateInProgramme(p, completed, now);
    if (n && !programmeNext.has(n.templateId)) programmeNext.set(n.templateId, n.when);
  }
  const assessments = active
    .map((t) =>
      assessTemplate({
        template: t,
        source: programmeNext.has(t.id) ? 'programme' : 'other-template',
        when: programmeNext.get(t.id) ?? null,
        exercises: params.exercises,
        equipment: params.equipment,
        lastTrained,
        recovery: params.recovery,
        availableMin: params.availableMin,
        timing: params.timing
      })
    )
    .sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name));

  const last = [...completed].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (last) {
    const days = Math.floor((now.getTime() - new Date(last.startedAt).getTime()) / 86_400_000);
    summary.push(days === 0 ? 'You already trained today.' : `Last workout ${days} day${days === 1 ? '' : 's'} ago (${last.name}).`);
  } else summary.push('No workouts logged yet — recommendations use your templates and settings only.');
  if (params.weeklyTarget) summary.push(sessionsThisWeek >= params.weeklyTarget ? `Weekly target of ${params.weeklyTarget} sessions already reached (${sessionsThisWeek}).` : `${sessionsThisWeek} of ${params.weeklyTarget} sessions done this week.`);

  const best = assessments[0]!;
  const allBlocked = assessments.every((a) => a.recovery.some((r) => !r.recovered) || !a.plan.some((p) => p.action !== 'drop'));
  if (allBlocked) {
    summary.push('Every template trains a muscle group that is still inside your recovery window. Consider a rest day, a walk or other light cardio — or train anyway if you feel ready; the recovery window is your own setting.');
    return { kind: 'rest-or-cardio', best, alternatives: assessments.slice(1, 3), summary, sessionsThisWeek, weeklyTarget: params.weeklyTarget };
  }
  return { kind: 'workout', best, alternatives: assessments.slice(1, 3), summary, sessionsThisWeek, weeklyTarget: params.weeklyTarget };
}
