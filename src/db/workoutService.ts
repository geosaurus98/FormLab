import { db } from './db';
import { buildExerciseSession, completeSession, editCompletedSession, startSession } from '../domain/workouts/session';
import { WorkoutSessionSchema, type CardioActivity, type ExerciseSession, type WorkoutSession, type WorkoutTemplate } from '../domain/workouts/types';
import { estimateCardioKcal, isLikelyDuplicate } from '../domain/workouts/cardio';
import { dailyWeights } from '../domain/body/body';
import { newId } from '../lib/id';
import { nowIso } from '../lib/utils';

export async function getActiveWorkout(): Promise<WorkoutSession | undefined> {
  return db.workouts.where('status').equals('active').first();
}

export async function completedHistory(): Promise<WorkoutSession[]> {
  return db.workouts.where('status').equals('completed').toArray();
}

async function equipmentIncrements() {
  return new Map((await db.equipment.toArray()).map((e) => [e.id, e.incrementKg]));
}

export async function latestBodyweightKg(): Promise<number | null> {
  const daily = dailyWeights(await db.body.toArray());
  return daily.length ? daily[daily.length - 1]!.weightKg : null;
}

/** Starts a workout; if one is already active it is returned instead (one active session at a time). */
export async function startWorkout(params: { templateId?: string | null; programmeId?: string | null; gymId?: string | null }): Promise<WorkoutSession> {
  const active = await getActiveWorkout();
  if (active) return active;
  const prefs = await db.preferences.get('prefs');
  const template: WorkoutTemplate | null = params.templateId ? (await db.templates.get(params.templateId)) ?? null : null;
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const session = startSession({
    template,
    programmeId: params.programmeId ?? null,
    exercises,
    history: await completedHistory(),
    gymId: params.gymId ?? prefs?.defaultGymId ?? null,
    equipmentIncrements: await equipmentIncrements(),
    bodyweightKg: await latestBodyweightKg()
  });
  await db.workouts.add(WorkoutSessionSchema.parse(session));
  return session;
}

/** Autosave: persists the whole session document. Called on every change during a workout. */
export async function saveWorkout(session: WorkoutSession): Promise<void> {
  await db.workouts.put(session);
}

export async function buildBlock(exerciseId: string, gymId: string | null): Promise<ExerciseSession> {
  const ex = await db.exercises.get(exerciseId);
  if (!ex) throw new Error('Exercise not found');
  return buildExerciseSession({ exercise: ex, templateExercise: null, history: await completedHistory(), gymId, equipmentIncrements: await equipmentIncrements() }).exerciseSession;
}

export async function finishWorkout(session: WorkoutSession): Promise<WorkoutSession> {
  // Drop empty, never-touched sets so history only contains what was done.
  const cleaned: WorkoutSession = { ...session, exercises: session.exercises.map((es) => ({ ...es, sets: es.sets.filter((s) => s.completed) })).filter((es) => es.sets.length > 0) };
  const done = completeSession(cleaned);
  await db.workouts.put(WorkoutSessionSchema.parse(done));
  return done;
}

export async function discardWorkout(sessionId: string): Promise<void> {
  await db.workouts.delete(sessionId);
}

export async function saveEditedWorkout(original: WorkoutSession, edited: WorkoutSession): Promise<WorkoutSession> {
  const next = editCompletedSession(original, () => ({ ...edited, exercises: edited.exercises.map((es) => ({ ...es, sets: es.sets.filter((s) => s.completed) })).filter((es) => es.sets.length) }));
  await db.workouts.put(WorkoutSessionSchema.parse(next));
  return next;
}

/** Saves a completed session as a new template (structure only; weights become targets only if chosen). */
export async function templateFromSession(session: WorkoutSession, name: string): Promise<WorkoutTemplate> {
  const now = nowIso();
  const t: WorkoutTemplate = {
    id: newId('tpl'),
    name,
    description: `Created from workout on ${new Date(session.startedAt).toLocaleDateString('en-NZ')}`,
    exercises: session.exercises.map((es) => ({
      id: newId('te'),
      exerciseId: es.exerciseId,
      sets: es.sets.filter((s) => s.type !== 'warmup').length || 3,
      repMin: es.target?.repMin ?? 8,
      repMax: es.target?.repMax ?? 12,
      targetWeightKg: null,
      targetDurationSec: es.target?.targetDurationSec ?? null,
      restSec: es.target?.restSec ?? 90,
      warmupSets: es.sets.filter((s) => s.type === 'warmup').length,
      rpe: null,
      rir: null,
      notes: es.notes,
      progression: es.target?.progression ?? { method: 'double', incrementKg: null, maxRpeToProgress: null, repStep: 1, timeStepSec: 30 }
    })),
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  await db.templates.add(t);
  return t;
}

export async function logCardio(input: Omit<CardioActivity, 'id' | 'createdAt' | 'updatedAt' | 'energyEstimate' | 'source'> & { estimateEnergy: boolean }): Promise<{ activity: CardioActivity; duplicateOf: CardioActivity | null }> {
  const now = nowIso();
  const { estimateEnergy, ...rest } = input;
  const bw = await latestBodyweightKg();
  const activity: CardioActivity = { ...rest, id: newId('cardio'), energyEstimate: estimateEnergy ? estimateCardioKcal(rest.type, rest.durationMin, bw) : null, source: { kind: 'manual' }, createdAt: now, updatedAt: now };
  const sameDay = await db.cardio.where('date').equals(rest.date).toArray();
  const duplicateOf = sameDay.find((c) => isLikelyDuplicate(c, activity)) ?? null;
  await db.cardio.add(activity);
  return { activity, duplicateOf };
}
