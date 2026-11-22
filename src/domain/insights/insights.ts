import { addDays, dateRange, isoToDateKey, startOfWeek, type DateKey } from '../../lib/dates';
import { dailyTotals, type FoodLogEntry } from '../nutrition/diary';
import { targetOn, type NutritionTarget } from '../nutrition/targets';
import type { CardioActivity, WorkoutSession } from '../workouts/types';
import type { DailyWeight } from '../body/body';

export interface DayAggregate {
  date: DateKey;
  logged: boolean;
  /** user marked the diary day complete */
  markedComplete: boolean;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  satFatG: number | null;
  fibreG: number | null;
  incomplete: boolean;
  trained: boolean;
  workoutMinutes: number;
  cardioMinutes: number;
  recipeMeals: number;
  weightKg: number | null;
  kcalTarget: number | null;
  proteinTarget: number | null;
}

export function aggregateDays(params: { start: DateKey; end: DateKey; entries: FoodLogEntry[]; workouts: WorkoutSession[]; cardio: CardioActivity[]; weights: DailyWeight[]; targets: NutritionTarget[]; completeDays: Set<string> }): DayAggregate[] {
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const e of params.entries) (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
  const wByDate = new Map<string, WorkoutSession[]>();
  for (const w of params.workouts) if (w.status === 'completed') {
    const d = isoToDateKey(w.startedAt);
    (wByDate.get(d) ?? wByDate.set(d, []).get(d)!).push(w);
  }
  const cByDate = new Map<string, number>();
  for (const c of params.cardio) cByDate.set(c.date, (cByDate.get(c.date) ?? 0) + c.durationMin);
  const weight = new Map(params.weights.map((w) => [w.date, w.weightKg]));

  return dateRange(params.start, params.end).map((date) => {
    const list = byDate.get(date) ?? [];
    const t = dailyTotals(list);
    const logged = list.length > 0;
    const ws = wByDate.get(date) ?? [];
    const target = targetOn(params.targets, date);
    const v = (k: keyof typeof t.values) => (logged ? t.values[k] : null);
    return {
      date,
      logged,
      markedComplete: params.completeDays.has(date),
      kcal: v('energyKcal'),
      proteinG: v('proteinG'),
      carbsG: v('carbsG'),
      fatG: v('fatG'),
      satFatG: v('satFatG'),
      fibreG: v('fibreG'),
      incomplete: list.some((e) => e.incomplete) || t.missing.energyKcal > 0,
      trained: ws.length > 0,
      workoutMinutes: ws.reduce((m, w) => m + (w.endedAt ? (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 60000 : 0), 0),
      cardioMinutes: cByDate.get(date) ?? 0,
      recipeMeals: list.filter((e) => e.origin.type === 'recipe').length,
      weightKg: weight.get(date) ?? null,
      kcalTarget: target?.energyKcal ?? null,
      proteinTarget: target?.proteinG ?? null
    };
  });
}

/** Days counted for nutrition statistics: user-marked complete if any are marked, else any logged day. */
export function nutritionDays(days: DayAggregate[]): { days: DayAggregate[]; basis: 'marked-complete' | 'any-logged' } {
  const marked = days.filter((d) => d.markedComplete && d.logged);
  if (marked.length >= 3) return { days: marked, basis: 'marked-complete' };
  return { days: days.filter((d) => d.logged), basis: 'any-logged' };
}

export interface Stat {
  value: number | null;
  n: number;
  of: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function averageOf(days: DayAggregate[], key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'satFatG' | 'fibreG', totalDays: number): Stat {
  const vals = days.map((d) => d[key]).filter((x): x is number => x != null);
  return { value: avg(vals), n: vals.length, of: totalDays };
}

export function proteinAdherence(days: DayAggregate[]): { hit: number; n: number; rate: number | null } {
  const eligible = days.filter((d) => d.proteinG != null && d.proteinTarget != null);
  const hit = eligible.filter((d) => d.proteinG! >= d.proteinTarget! * 0.95).length;
  return { hit, n: eligible.length, rate: eligible.length ? hit / eligible.length : null };
}

export function kcalAdherence(days: DayAggregate[], tolerance = 0.1): { within: number; over: number; under: number; n: number } {
  const eligible = days.filter((d) => d.kcal != null && d.kcalTarget != null);
  let within = 0, over = 0, under = 0;
  for (const d of eligible) {
    const r = d.kcal! / d.kcalTarget!;
    if (r > 1 + tolerance) over++;
    else if (r < 1 - tolerance) under++;
    else within++;
  }
  return { within, over, under, n: eligible.length };
}

export function sessionsPerWeek(workouts: WorkoutSession[], start: DateKey, end: DateKey, weekStartsOn = 1, cardio: CardioActivity[] = []): { week: DateKey; sessions: number; cardio: number }[] {
  const weeks = new Map<string, { sessions: number; cardio: number }>();
  for (let w = startOfWeek(start, weekStartsOn); w <= end; w = addDays(w, 7)) weeks.set(w, { sessions: 0, cardio: 0 });
  for (const s of workouts) {
    if (s.status !== 'completed') continue;
    const d = isoToDateKey(s.startedAt);
    if (d < start || d > end) continue;
    const wk = startOfWeek(d, weekStartsOn);
    const cur = weeks.get(wk) ?? { sessions: 0, cardio: 0 };
    cur.sessions++;
    weeks.set(wk, cur);
  }
  for (const c of cardio) {
    if (c.date < start || c.date > end) continue;
    const wk = startOfWeek(c.date, weekStartsOn);
    const cur = weeks.get(wk) ?? { sessions: 0, cardio: 0 };
    cur.cardio++;
    weeks.set(wk, cur);
  }
  return [...weeks.entries()].map(([week, v]) => ({ week, ...v })).sort((a, b) => a.week.localeCompare(b.week));
}


/** Pearson correlation with sample size. Returns null if n < 3 or no variance. */
export function pearson(xs: number[], ys: number[]): { r: number; n: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

export function describeCorrelation(r: number): string {
  const a = Math.abs(r);
  const strength = a < 0.1 ? 'no meaningful' : a < 0.3 ? 'a weak' : a < 0.5 ? 'a moderate' : 'a strong';
  return `${strength} ${r >= 0 ? 'positive' : 'negative'} association`;
}

export interface GroupComparison {
  aLabel: string;
  bLabel: string;
  aMean: number | null;
  bMean: number | null;
  aN: number;
  bN: number;
  enoughData: boolean;
}

/** Compares a metric between two groups of days (e.g. training vs rest days). */
export function compareGroups(days: DayAggregate[], predicate: (d: DayAggregate) => boolean, metric: (d: DayAggregate) => number | null, labels: [string, string], minN = 4): GroupComparison {
  const a: number[] = [];
  const b: number[] = [];
  for (const d of days) {
    const v = metric(d);
    if (v == null) continue;
    (predicate(d) ? a : b).push(v);
  }
  return { aLabel: labels[0], bLabel: labels[1], aMean: avg(a), bMean: avg(b), aN: a.length, bN: b.length, enoughData: a.length >= minN && b.length >= minN };
}

/** Weekly mean intake vs. weekly change in average weight — for "calories vs weight trend". */
export function weeklyIntakeVsWeight(days: DayAggregate[], weekStartsOn = 1): { week: DateKey; avgKcal: number | null; kcalDays: number; avgWeight: number | null; weighDays: number }[] {
  const by = new Map<string, DayAggregate[]>();
  for (const d of days) {
    const w = startOfWeek(d.date, weekStartsOn);
    (by.get(w) ?? by.set(w, []).get(w)!).push(d);
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, list]) => {
      const k = list.map((d) => d.kcal).filter((x): x is number => x != null);
      const w = list.map((d) => d.weightKg).filter((x): x is number => x != null);
      return { week, avgKcal: avg(k), kcalDays: k.length, avgWeight: avg(w), weighDays: w.length };
    });
}

export function topFoods(entries: FoodLogEntry[], limit = 10): { name: string; count: number; kcal: number }[] {
  const m = new Map<string, { name: string; count: number; kcal: number }>();
  for (const e of entries) {
    const key = e.name.toLowerCase();
    const cur = m.get(key) ?? { name: e.name, count: 0, kcal: 0 };
    cur.count++;
    cur.kcal += e.nutrients.energyKcal ?? 0;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
