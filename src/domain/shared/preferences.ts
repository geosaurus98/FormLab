import { z } from 'zod';
import { ApplianceIdSchema } from '../recipes/types';

export const FITNESS_GOALS = ['fat-loss', 'strength', 'muscle', 'cardio-fitness', 'general-activity', 'consistency'] as const;
export const FITNESS_GOAL_LABEL: Record<(typeof FITNESS_GOALS)[number], string> = {
  'fat-loss': 'Fat loss',
  strength: 'Strength improvement',
  muscle: 'Muscle retention / development',
  'cardio-fitness': 'Cardiovascular fitness',
  'general-activity': 'General activity',
  consistency: 'Training consistency'
};

export const FitnessGoalSchema = z.object({
  id: z.enum(FITNESS_GOALS),
  enabled: z.boolean(),
  /** optional numeric target, e.g. sessions/week for consistency, kg for body-weight goal */
  target: z.number().nullable().default(null),
  notes: z.string().default('')
});
export type FitnessGoal = z.infer<typeof FitnessGoalSchema>;

export const ReminderSchema = z.object({
  id: z.enum(['workout', 'food-log', 'meal-plan', 'groceries', 'weigh-in', 'recipe-feedback']),
  enabled: z.boolean(),
  /** HH:MM local */
  time: z.string(),
  /** 0–6 weekdays it applies to */
  days: z.array(z.number().int().min(0).max(6))
});
export type Reminder = z.infer<typeof ReminderSchema>;

export const PreferencesSchema = z.object({
  id: z.literal('prefs'),
  currency: z.literal('NZD'),
  massUnit: z.enum(['kg', 'lb']),
  energyUnit: z.enum(['kcal', 'kJ']),
  temperatureUnit: z.literal('C'),
  weekStartsOn: z.number().int().min(0).max(6),
  defaultServings: z.number().int().positive(),
  meatGramsPerFourServings: z.number().positive(),
  excludedTags: z.array(z.string()),
  dietaryNotes: z.string(),
  lactoseFree: z.boolean(),
  appliances: z.array(ApplianceIdSchema),
  maxCookMinutes: z.number().positive().nullable(),
  weeklyFoodBudgetNZD: z.number().positive().nullable(),
  maxCostPerServingNZD: z.number().positive().nullable(),
  minProteinPerServingG: z.number().nonnegative().nullable(),
  maxSatFatPerServingG: z.number().nonnegative().nullable(),
  addExerciseEnergy: z.boolean(),
  defaultRestSec: z.number().int().nonnegative(),
  /** minimum hours before training the same primary muscle again (user preference, not a physiological measurement) */
  recoveryDefaultHours: z.number().nonnegative(),
  recoveryOverrides: z.record(z.string(), z.number().nonnegative()),
  defaultGymId: z.string().nullable(),
  restTimerSound: z.boolean(),
  restTimerNotifications: z.boolean(),
  goals: z.array(FitnessGoalSchema),
  goalWeightKg: z.number().positive().nullable(),
  reminders: z.array(ReminderSchema),
  /** personal inputs for the energy estimator — never pre-filled */
  energyProfile: z
    .object({ sex: z.enum(['male', 'female']), birthYear: z.number().int(), heightCm: z.number().positive(), activity: z.enum(['sedentary', 'light', 'moderate', 'very']) })
    .nullable(),
  onboarded: z.boolean(),
  updatedAt: z.string()
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export function defaultPreferences(now: string): Preferences {
  return {
    id: 'prefs',
    currency: 'NZD',
    massUnit: 'kg',
    energyUnit: 'kcal',
    temperatureUnit: 'C',
    weekStartsOn: 1,
    defaultServings: 4,
    meatGramsPerFourServings: 500,
    excludedTags: ['seafood', 'green-lentil', 'brown-lentil'],
    dietaryNotes: 'Lactose-free dairy. High-protein, affordable, relatively low saturated fat.',
    lactoseFree: true,
    appliances: ['stovetop', 'oven', 'rice-cooker', 'slow-cooker', 'pressure-cooker', 'air-fryer'],
    maxCookMinutes: null,
    weeklyFoodBudgetNZD: null,
    maxCostPerServingNZD: null,
    minProteinPerServingG: 30,
    maxSatFatPerServingG: 8,
    addExerciseEnergy: false,
    defaultRestSec: 90,
    recoveryDefaultHours: 48,
    recoveryOverrides: {},
    defaultGymId: null,
    restTimerSound: true,
    restTimerNotifications: false,
    goals: [
      { id: 'fat-loss', enabled: false, target: null, notes: '' },
      { id: 'strength', enabled: false, target: null, notes: '' },
      { id: 'muscle', enabled: false, target: null, notes: '' },
      { id: 'cardio-fitness', enabled: false, target: null, notes: '' },
      { id: 'general-activity', enabled: false, target: null, notes: '' },
      { id: 'consistency', enabled: false, target: 3, notes: 'Sessions per week' }
    ],
    goalWeightKg: null,
    reminders: [
      { id: 'workout', enabled: false, time: '17:30', days: [1, 3, 5] },
      { id: 'food-log', enabled: false, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'meal-plan', enabled: false, time: '10:00', days: [0] },
      { id: 'groceries', enabled: false, time: '11:00', days: [0] },
      { id: 'weigh-in', enabled: false, time: '07:00', days: [1, 4] },
      { id: 'recipe-feedback', enabled: false, time: '20:30', days: [0, 1, 2, 3, 4, 5, 6] }
    ],
    energyProfile: null,
    onboarded: false,
    updatedAt: now
  };
}
