import { z } from 'zod';
import type { DateKey } from '../../lib/dates';

export const NutritionTargetSchema = z.object({
  id: z.string(),
  /** target applies from this date until superseded — preserves historical adherence */
  effectiveFrom: z.string(),
  energyKcal: z.number().positive().nullable(),
  energyMinKcal: z.number().positive().nullable().default(null),
  energyMaxKcal: z.number().positive().nullable().default(null),
  proteinG: z.number().nonnegative().nullable(),
  carbsG: z.number().nonnegative().nullable(),
  fatG: z.number().nonnegative().nullable(),
  fibreG: z.number().nonnegative().nullable(),
  satFatMaxG: z.number().nonnegative().nullable(),
  sodiumMaxMg: z.number().nonnegative().nullable(),
  basis: z.enum(['manual', 'estimator']),
  notes: z.string().default(''),
  createdAt: z.string()
});
export type NutritionTarget = z.infer<typeof NutritionTargetSchema>;

/** Returns the target in force on `date` (latest effectiveFrom <= date). */
export function targetOn(targets: NutritionTarget[], date: DateKey): NutritionTarget | null {
  let best: NutritionTarget | null = null;
  for (const t of targets) if (t.effectiveFrom <= date && (!best || t.effectiveFrom > best.effectiveFrom || (t.effectiveFrom === best.effectiveFrom && t.createdAt > best.createdAt))) best = t;
  return best;
}

/* ---------------- Energy-requirement estimation ---------------- */

export type Sex = 'male' | 'female';
export const ACTIVITY_LEVELS = {
  sedentary: { factor: 1.2, label: 'Sedentary — desk job, little structured exercise' },
  light: { factor: 1.375, label: 'Lightly active — exercise 1–3 days/week' },
  moderate: { factor: 1.55, label: 'Moderately active — exercise 3–5 days/week' },
  very: { factor: 1.725, label: 'Very active — hard exercise 6–7 days/week' }
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;

export interface EnergyInputs {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
}

/** Mifflin–St Jeor (1990) resting energy expenditure estimate, kcal/day. */
export function mifflinStJeor({ sex, ageYears, heightCm, weightKg }: Omit<EnergyInputs, 'activity'>): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161);
}

export const MAX_DEFICIT_FRACTION = 0.25;

export interface EnergyEstimate {
  bmr: number;
  maintenance: number;
  suggested: number;
  deficitKcal: number;
  warnings: string[];
  /** activity is already included in maintenance via the activity factor */
  includesActivity: true;
}

/**
 * Estimates maintenance energy and an optional goal intake. The deficit is capped at 25 % of
 * maintenance and never drops below the estimated BMR, to avoid extreme automatic deficits.
 * This is an estimate, not a prescription.
 */
export function estimateEnergy(inputs: EnergyInputs, deficitFraction = 0): EnergyEstimate {
  const warnings: string[] = [];
  if (inputs.ageYears < 18) warnings.push('These equations are intended for adults.');
  const bmr = mifflinStJeor(inputs);
  const maintenance = bmr * ACTIVITY_LEVELS[inputs.activity].factor;
  let frac = Math.max(0, deficitFraction);
  if (frac > MAX_DEFICIT_FRACTION) {
    warnings.push(`Deficit limited to ${MAX_DEFICIT_FRACTION * 100}% of estimated maintenance.`);
    frac = MAX_DEFICIT_FRACTION;
  }
  let suggested = maintenance * (1 - frac);
  if (suggested < bmr) {
    warnings.push('Suggestion raised to the estimated resting energy expenditure.');
    suggested = bmr;
  }
  return { bmr: Math.round(bmr), maintenance: Math.round(maintenance), suggested: Math.round(suggested / 10) * 10, deficitKcal: Math.round(maintenance - suggested), warnings, includesActivity: true };
}

/**
 * Daily energy allowance. Exercise energy is only added when the user opted in, and is never
 * added when the target itself came from an estimate that already includes activity.
 */
export function energyAllowance(target: NutritionTarget | null, exerciseKcal: number, addExercise: boolean): { allowance: number | null; addedExerciseKcal: number } {
  if (!target?.energyKcal) return { allowance: null, addedExerciseKcal: 0 };
  const add = addExercise && target.basis === 'manual' ? Math.max(0, exerciseKcal) : 0;
  return { allowance: target.energyKcal + add, addedExerciseKcal: add };
}
