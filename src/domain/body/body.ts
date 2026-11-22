import { z } from 'zod';
import { addDays, dateRange, daysBetween, type DateKey } from '../../lib/dates';
import { DataQualitySchema } from '../shared/provenance';

export const BodyMeasurementSchema = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string().nullable(),
  /** always stored in kg */
  weightKg: z.number().positive().nullable(),
  waistCm: z.number().positive().nullable(),
  measurements: z.record(z.string(), z.number().positive()).default({}),
  notes: z.string().default(''),
  quality: DataQualitySchema.default('measured'),
  createdAt: z.string()
});
export type BodyMeasurement = z.infer<typeof BodyMeasurementSchema>;

export interface DailyWeight {
  date: DateKey;
  weightKg: number;
  count: number;
}

/** Collapses multiple weigh-ins on one day to their mean. */
export function dailyWeights(entries: BodyMeasurement[]): DailyWeight[] {
  const by = new Map<string, number[]>();
  for (const e of entries) if (e.weightKg != null) (by.get(e.date) ?? by.set(e.date, []).get(e.date)!).push(e.weightKg);
  return [...by.entries()].map(([date, ws]) => ({ date, weightKg: ws.reduce((a, b) => a + b, 0) / ws.length, count: ws.length })).sort((a, b) => a.date.localeCompare(b.date));
}

export interface RollingPoint {
  date: DateKey;
  weightKg: number | null;
  avgKg: number | null;
  /** number of weigh-in days inside the window */
  n: number;
}

/**
 * Trailing rolling average over `window` calendar days. Missing days are skipped (not
 * interpolated); the average is only reported when at least `minPoints` days have data.
 */
export function rollingAverage(daily: DailyWeight[], window = 7, minPoints = 3, range?: { start: DateKey; end: DateKey }): RollingPoint[] {
  if (!daily.length) return [];
  const start = range?.start ?? daily[0]!.date;
  const end = range?.end ?? daily[daily.length - 1]!.date;
  const map = new Map(daily.map((d) => [d.date, d.weightKg]));
  return dateRange(start, end).map((date) => {
    const vals: number[] = [];
    for (let i = 0; i < window; i++) {
      const v = map.get(addDays(date, -i));
      if (v != null) vals.push(v);
    }
    return { date, weightKg: map.get(date) ?? null, avgKg: vals.length >= minPoints ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  });
}

export interface Trend {
  slopeKgPerWeek: number;
  n: number;
  spanDays: number;
  startAvg: number;
  endAvg: number;
}

/** Least-squares slope over daily weights. Requires ≥ 6 weigh-in days spanning ≥ 14 days. */
export function weightTrend(daily: DailyWeight[], minPoints = 6, minSpanDays = 14): Trend | null {
  if (daily.length < minPoints) return null;
  const first = daily[0]!.date;
  const span = daysBetween(first, daily[daily.length - 1]!.date);
  if (span < minSpanDays) return null;
  const xs = daily.map((d) => daysBetween(first, d.date));
  const ys = daily.map((d) => d.weightKg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slopeKgPerWeek: slope * 7, n, spanDays: span, startAvg: my + slope * (0 - mx), endAvg: my + slope * (span - mx) };
}

export function changeOverRange(daily: DailyWeight[], start: DateKey, end: DateKey): { fromAvg: number; toAvg: number; change: number } | null {
  const win = (d: DateKey) => daily.filter((x) => Math.abs(daysBetween(d, x.date)) <= 3);
  const a = win(start);
  const b = win(end);
  if (a.length < 2 || b.length < 2) return null;
  const avg = (l: DailyWeight[]) => l.reduce((s, x) => s + x.weightKg, 0) / l.length;
  return { fromAvg: avg(a), toAvg: avg(b), change: avg(b) - avg(a) };
}

export function goalProgress(startKg: number, currentAvgKg: number, goalKg: number): number | null {
  const total = goalKg - startKg;
  if (Math.abs(total) < 1e-9) return null;
  return Math.max(0, Math.min(1, (currentAvgKg - startKg) / total));
}
