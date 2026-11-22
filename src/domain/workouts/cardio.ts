import type { CardioActivity, CardioType } from './types';

/**
 * MET values from the 2011/2024 Compendium of Physical Activities (approximate category values).
 * Energy = MET × body mass (kg) × hours. This is a coarse population estimate, not a measurement,
 * and is only computed when a body weight is available.
 */
export const MET_VALUES: Record<CardioType, { met: number; note: string }> = {
  walk: { met: 3.5, note: 'Walking ~5 km/h, level surface' },
  hike: { met: 6.0, note: 'Hiking, cross-country' },
  cycle: { met: 6.8, note: 'Cycling, general leisure ~16–19 km/h' },
  treadmill: { met: 4.3, note: 'Treadmill walking ~5.6 km/h' },
  'exercise-bike': { met: 6.8, note: 'Stationary cycling, moderate effort' },
  rower: { met: 7.0, note: 'Rowing machine, moderate effort' },
  elliptical: { met: 5.0, note: 'Elliptical trainer, moderate effort' },
  run: { met: 9.8, note: 'Running ~9.7 km/h' },
  other: { met: 4.0, note: 'Generic moderate activity' }
};

export function estimateCardioKcal(type: CardioType, durationMin: number, bodyweightKg: number | null): { kcal: number; method: string; quality: 'estimate' } | null {
  if (!bodyweightKg || durationMin <= 0) return null;
  const m = MET_VALUES[type];
  // Net of resting: subtract 1 MET so the estimate doesn't double-count resting energy already in a daily requirement.
  const kcal = Math.max(0, (m.met - 1) * bodyweightKg * (durationMin / 60));
  return { kcal: Math.round(kcal), method: `Net MET estimate (${m.met} − 1 MET, ${m.note})`, quality: 'estimate' };
}

/**
 * Duplicate detection for imports (e.g. a future Health Connect adapter): same external id, or the
 * same type with start times within 10 minutes and durations within 20 %.
 */
export function isLikelyDuplicate(a: Pick<CardioActivity, 'type' | 'date' | 'startedAt' | 'durationMin' | 'source'>, b: typeof a): boolean {
  if (a.source.externalId && a.source.externalId === b.source.externalId) return true;
  if (a.type !== b.type || a.date !== b.date) return false;
  const durClose = Math.abs(a.durationMin - b.durationMin) <= Math.max(a.durationMin, b.durationMin) * 0.2;
  if (a.startedAt && b.startedAt) return durClose && Math.abs(new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()) <= 10 * 60_000;
  return false;
}

/** Interface for future activity sources (Android Health Connect, GPX import, …). */
export interface ActivitySourceAdapter {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  fetchActivities(sinceIso: string): Promise<Omit<CardioActivity, 'id' | 'createdAt' | 'updatedAt'>[]>;
}

export function paceMinPerKm(a: Pick<CardioActivity, 'durationMin' | 'distanceKm'>): number | null {
  return a.distanceKm ? a.durationMin / a.distanceKm : null;
}
