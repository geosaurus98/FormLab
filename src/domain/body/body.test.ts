import { describe, expect, it } from 'vitest';
import { changeOverRange, dailyWeights, goalProgress, rollingAverage, weightTrend, type BodyMeasurement } from './body';
import { kgToLb, lbToKg, displayMass } from '../../lib/units';
import { addDays } from '../../lib/dates';
import { aggregateDays, compareGroups, pearson, proteinAdherence, sessionsPerWeek } from '../insights/insights';

const m = (date: string, kg: number): BodyMeasurement => ({ id: date + kg, date, time: null, weightKg: kg, waistCm: null, measurements: {}, notes: '', quality: 'measured', createdAt: date });

describe('body weight', () => {
  it('records multiple weigh-ins per day as their mean', () => {
    const d = dailyWeights([m('2026-01-01', 80), m('2026-01-01', 81), m('2026-01-02', 80.4)]);
    expect(d).toHaveLength(2);
    expect(d[0]!.weightKg).toBe(80.5);
  });

  it('computes a 7-day rolling average and skips missing dates', () => {
    const d = dailyWeights([m('2026-01-01', 80), m('2026-01-03', 79), m('2026-01-05', 78), m('2026-01-12', 77)]);
    const r = rollingAverage(d);
    expect(r).toHaveLength(12);
    expect(r[1]!.weightKg).toBeNull();
    expect(r[4]!.avgKg).toBeCloseTo(79);
    expect(r[11]!.avgKg).toBeNull(); // only 1 point in window → insufficient
    expect(r[11]!.n).toBe(1);
  });

  it('requires enough data before reporting a trend', () => {
    expect(weightTrend(dailyWeights([m('2026-01-01', 80), m('2026-01-02', 79)]))).toBeNull();
    const many = Array.from({ length: 10 }, (_, i) => m(addDays('2026-01-01', i * 2), 80 - i * 0.1));
    const t = weightTrend(dailyWeights(many))!;
    expect(t.slopeKgPerWeek).toBeCloseTo(-0.35, 2);
    expect(t.n).toBe(10);
  });

  it('computes change over a range and goal progress', () => {
    const many = Array.from({ length: 30 }, (_, i) => m(addDays('2026-01-01', i), 80 - i * 0.05));
    const c = changeOverRange(dailyWeights(many), '2026-01-04', '2026-01-27')!;
    expect(c.change).toBeCloseTo(-1.15, 1);
    expect(goalProgress(80, 78, 76)).toBe(0.5);
  });

  it('converts between kg and lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 1);
    expect(lbToKg(220.46)).toBeCloseTo(100, 1);
    expect(displayMass(80, 'lb')).toBe('176.4 lb');
  });
});

describe('insights', () => {
  it('computes correlation only with sufficient data', () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])!.r).toBeCloseTo(1);
  });
  it('aggregates days with sample sizes for comparisons', () => {
    const days = aggregateDays({ start: '2026-01-01', end: '2026-01-10', entries: [], workouts: [], cardio: [], weights: [], targets: [], completeDays: new Set() });
    expect(days).toHaveLength(10);
    expect(days.every((d) => d.kcal === null)).toBe(true);
    const cmp = compareGroups(days, (d) => d.trained, (d) => d.kcal, ['Training', 'Rest']);
    expect(cmp.enoughData).toBe(false);
    expect(proteinAdherence(days).rate).toBeNull();
    expect(sessionsPerWeek([], '2026-01-01', '2026-01-31').length).toBeGreaterThanOrEqual(5);
  });
});
