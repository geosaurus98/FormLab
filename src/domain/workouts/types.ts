import { z } from 'zod';

export const MUSCLES = ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'cardio'] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MOVEMENT_PATTERNS = ['horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull', 'squat', 'hinge', 'lunge', 'knee-extension', 'knee-flexion', 'elbow-flexion', 'elbow-extension', 'shoulder-isolation', 'chest-isolation', 'core', 'calf', 'hip', 'carry', 'locomotion', 'cycling', 'rowing', 'other'] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

/** How a set is recorded. Bodyweight variants keep added/assistance load separate from external load. */
export const TRACKING_METHODS = ['weight_reps', 'bodyweight_reps', 'assisted_bodyweight', 'reps', 'duration', 'distance_duration'] as const;
export type TrackingMethod = (typeof TRACKING_METHODS)[number];

/** Load type determines whether numbers are comparable across gyms. */
export const LOAD_TYPES = ['free-weight', 'machine', 'cable', 'bodyweight', 'none'] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export const EquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['free-weight', 'machine', 'cable', 'bodyweight', 'cardio', 'accessory']),
  available: z.boolean(),
  /** smallest load step for this equipment, kg */
  incrementKg: z.number().positive().nullable()
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  primaryMuscles: z.array(z.enum(MUSCLES)),
  secondaryMuscles: z.array(z.enum(MUSCLES)).default([]),
  equipmentIds: z.array(z.string()),
  movementPattern: z.enum(MOVEMENT_PATTERNS),
  type: z.enum(['strength', 'cardio', 'mobility']),
  tracking: z.enum(TRACKING_METHODS),
  loadType: z.enum(LOAD_TYPES),
  instructions: z.array(z.string()).default([]),
  mediaUrl: z.string().nullable().default(null),
  alternativeIds: z.array(z.string()).default([]),
  /** default load step override, kg (else from equipment) */
  incrementKg: z.number().positive().nullable().default(null),
  custom: z.boolean().default(false),
  archived: z.boolean().default(false)
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const GymSchema = z.object({ id: z.string(), name: z.string(), notes: z.string().default('') });
export type Gym = z.infer<typeof GymSchema>;

export const ProgressionRuleSchema = z.object({
  method: z.enum(['double', 'fixed', 'reps', 'time', 'manual']),
  /** kg step for double/fixed progression; null = use exercise/equipment increment */
  incrementKg: z.number().positive().nullable().default(null),
  /** max acceptable RPE on the top set to progress (optional) */
  maxRpeToProgress: z.number().min(1).max(10).nullable().default(null),
  repStep: z.number().int().positive().default(1),
  timeStepSec: z.number().int().positive().default(30)
});
export type ProgressionRule = z.infer<typeof ProgressionRuleSchema>;

export const TemplateExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  sets: z.number().int().positive(),
  repMin: z.number().int().nonnegative(),
  repMax: z.number().int().nonnegative(),
  targetWeightKg: z.number().nonnegative().nullable().default(null),
  targetDurationSec: z.number().int().positive().nullable().default(null),
  restSec: z.number().int().nonnegative(),
  warmupSets: z.number().int().nonnegative().default(0),
  rpe: z.number().min(1).max(10).nullable().default(null),
  rir: z.number().min(0).max(10).nullable().default(null),
  notes: z.string().default(''),
  progression: ProgressionRuleSchema
});
export type TemplateExercise = z.infer<typeof TemplateExerciseSchema>;

export const WorkoutTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  exercises: z.array(TemplateExerciseSchema),
  notes: z.string().default(''),
  archived: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type WorkoutTemplate = z.infer<typeof WorkoutTemplateSchema>;

export const ProgrammeScheduleSchema = z.discriminatedUnion('type', [
  /** do templates in order, whenever you train */
  z.object({ type: z.literal('rotation') }),
  /** fixed weekdays (0 = Sunday) */
  z.object({ type: z.literal('weekdays'), days: z.array(z.object({ weekday: z.number().int().min(0).max(6), templateId: z.string() })) })
]);
export type ProgrammeSchedule = z.infer<typeof ProgrammeScheduleSchema>;

export const WorkoutProgrammeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  templateIds: z.array(z.string()),
  schedule: ProgrammeScheduleSchema,
  targetSessionsPerWeek: z.number().int().positive().nullable().default(null),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type WorkoutProgramme = z.infer<typeof WorkoutProgrammeSchema>;

export const SET_TYPES = ['warmup', 'working', 'drop', 'failure', 'other'] as const;
export type SetType = (typeof SET_TYPES)[number];
export const SET_TYPE_LABEL: Record<SetType, string> = { warmup: 'Warm-up', working: 'Working', drop: 'Drop', failure: 'Failure', other: 'Other' };

export const ExerciseSetSchema = z.object({
  id: z.string(),
  type: z.enum(SET_TYPES),
  /** external load (free weight / machine / cable), kg */
  weightKg: z.number().nonnegative().nullable(),
  reps: z.number().int().nonnegative().nullable(),
  /** for bodyweight exercises: extra load (belt, vest) */
  addedKg: z.number().nonnegative().nullable().default(null),
  /** for assisted bodyweight exercises: assistance (counter-weight) */
  assistanceKg: z.number().nonnegative().nullable().default(null),
  durationSec: z.number().nonnegative().nullable().default(null),
  distanceM: z.number().nonnegative().nullable().default(null),
  rpe: z.number().min(1).max(10).nullable().default(null),
  rir: z.number().min(0).max(10).nullable().default(null),
  completed: z.boolean(),
  completedAt: z.string().nullable()
});
export type ExerciseSet = z.infer<typeof ExerciseSetSchema>;

/** A performed exercise inside a session — holds its own snapshot of targets, independent of the template. */
export const ExerciseSessionSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  tracking: z.enum(TRACKING_METHODS),
  loadType: z.enum(LOAD_TYPES),
  target: z
    .object({ sets: z.number(), repMin: z.number(), repMax: z.number(), restSec: z.number(), progression: ProgressionRuleSchema, targetDurationSec: z.number().nullable().default(null) })
    .nullable(),
  sets: z.array(ExerciseSetSchema),
  notes: z.string().default(''),
  replacedExerciseId: z.string().nullable().default(null),
  /** a free note on machine/variant, e.g. "Hammer Strength plate-loaded" */
  variant: z.string().default('')
});
export type ExerciseSession = z.infer<typeof ExerciseSessionSchema>;

export const RestTimerSchema = z.object({
  /** epoch ms when rest ends (running) */
  endsAt: z.number().nullable(),
  /** remaining ms when paused */
  pausedRemainingMs: z.number().nullable(),
  durationMs: z.number(),
  exerciseSessionId: z.string().nullable()
});
export type RestTimer = z.infer<typeof RestTimerSchema>;

export const WorkoutSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateId: z.string().nullable(),
  programmeId: z.string().nullable(),
  gymId: z.string().nullable(),
  status: z.enum(['active', 'completed', 'discarded']),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  exercises: z.array(ExerciseSessionSchema),
  notes: z.string().default(''),
  bodyweightKg: z.number().positive().nullable().default(null),
  restTimer: RestTimerSchema.nullable().default(null),
  /** increments every time a completed session is edited */
  revision: z.number().int().nonnegative().default(0),
  editedAt: z.string().nullable().default(null),
  updatedAt: z.string()
});
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;

export const CARDIO_TYPES = ['walk', 'hike', 'cycle', 'treadmill', 'exercise-bike', 'rower', 'elliptical', 'run', 'other'] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];
export const CARDIO_LABEL: Record<CardioType, string> = { walk: 'Walking', hike: 'Hiking', cycle: 'Cycling', treadmill: 'Treadmill', 'exercise-bike': 'Exercise bike', rower: 'Rowing machine', elliptical: 'Elliptical', run: 'Running', other: 'Other cardio' };

export const CardioActivitySchema = z.object({
  id: z.string(),
  type: z.enum(CARDIO_TYPES),
  date: z.string(),
  startedAt: z.string().nullable(),
  durationMin: z.number().positive(),
  distanceKm: z.number().nonnegative().nullable(),
  elevationGainM: z.number().nonnegative().nullable(),
  avgHeartRate: z.number().positive().nullable(),
  notes: z.string().default(''),
  energyEstimate: z.object({ kcal: z.number().nonnegative(), method: z.string(), quality: z.literal('estimate') }).nullable(),
  source: z.object({ kind: z.enum(['manual', 'import']), provider: z.string().optional(), externalId: z.string().optional() }),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CardioActivity = z.infer<typeof CardioActivitySchema>;
