import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { Card, CardTitle, PageHeader, Select, Notice, Badge } from '../../components/ui';
import { Bars, BarsWithLine, InsufficientData, SERIES, shortDate } from '../../components/charts';
import { usePrefs, useToday } from '../../hooks/data';
import { aggregateDays, averageOf, compareGroups, describeCorrelation, kcalAdherence, nutritionDays, pearson, proteinAdherence, sessionsPerWeek, topFoods, weeklyIntakeVsWeight } from '../../domain/insights/insights';
import { dailyWeights, weightTrend } from '../../domain/body/body';
import { exerciseProgress } from '../../domain/workouts/records';
import { sessionComparisonKey } from '../../domain/workouts/session';
import { addDays, isoToDateKey } from '../../lib/dates';

/**
 * Cross-domain analysis. Every figure shows its sample size; comparisons need a minimum number of
 * days in each group; correlations are described as associations, never causes.
 */
export function InsightsPage() {
  const today = useToday();
  const prefs = usePrefs();
  const [days, setDays] = useState(28);
  const start = addDays(today, -days + 1);
  const entries = useLiveQuery(() => db.foodLog.where('date').between(start, today, true, true).toArray(), [start, today]);
  const workouts = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const cardio = useLiveQuery(() => db.cardio.toArray(), []);
  const body = useLiveQuery(() => db.body.toArray(), []);
  const targets = useLiveQuery(() => db.targets.toArray(), []);
  const status = useLiveQuery(() => db.dayStatus.toArray(), []);

  const data = useMemo(() => {
    if (!entries || !workouts || !cardio || !body || !targets || !status) return null;
    const weights = dailyWeights(body);
    const all = aggregateDays({ start, end: today, entries, workouts, cardio, weights, targets, completeDays: new Set(status.filter((s) => s.complete).map((s) => s.date)) });
    const { days: nDays, basis } = nutritionDays(all);
    return { all, nDays, basis, weights };
  }, [entries, workouts, cardio, body, targets, status, start, today]);

  const improving = useMemoImproving(workouts ?? [], start);
  if (!data || !workouts || !entries) return null;
  const { all, nDays, basis, weights } = data;
  const logged = nDays.length;
  const kcal = averageOf(nDays, 'kcal', days);
  const protein = averageOf(nDays, 'proteinG', days);
  const pAdh = proteinAdherence(nDays);
  const kAdh = kcalAdherence(nDays);
  const trainVsRest = compareGroups(nDays, (d) => d.trained, (d) => d.kcal, ['Training days', 'Rest days']);
  const trainVsRestP = compareGroups(nDays, (d) => d.trained, (d) => d.proteinG, ['Training days', 'Rest days']);
  const prepVsNot = compareGroups(nDays.filter((d) => d.proteinTarget), (d) => d.recipeMeals > 0, (d) => (d.proteinG != null && d.proteinTarget ? (d.proteinG >= d.proteinTarget * 0.95 ? 1 : 0) : null), ['Days with a home-cooked recipe', 'Days without'], 4);
  const weekly = weeklyIntakeVsWeight(all, prefs?.weekStartsOn ?? 1);
  const weeksWithBoth = weekly.filter((w) => w.kcalDays >= 4 && w.weighDays >= 2);
  const weightChanges = weeksWithBoth.slice(1).map((w, i) => ({ kcal: weeksWithBoth[i]!.avgKcal!, change: w.avgWeight! - weeksWithBoth[i]!.avgWeight! }));
  const corr = pearson(weightChanges.map((x) => x.kcal), weightChanges.map((x) => x.change));
  const inRangeW = workouts.filter((w) => isoToDateKey(w.startedAt) >= start);
  const perWeek = sessionsPerWeek(workouts, start, today, prefs?.weekStartsOn ?? 1, cardio ?? []);
  const avgPerWeek = perWeek.length ? perWeek.reduce((s, w) => s + w.sessions, 0) / perWeek.length : 0;
  const trend = weightTrend(weights.filter((w) => w.date >= start));
  const durations = inRangeW.filter((w) => w.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((w) => (new Date(w.endedAt!).getTime() - new Date(w.startedAt).getTime()) / 60000);
  const half = Math.floor(durations.length / 2);
  const durFirst = half >= 2 ? durations.slice(0, half).reduce((a, b) => a + b, 0) / half : null;
  const durSecond = half >= 2 ? durations.slice(half).reduce((a, b) => a + b, 0) / (durations.length - half) : null;


  return (
    <div className="space-y-4">
      <PageHeader
        title="Insights"
        subtitle="Patterns across food, training and body weight"
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36" aria-label="Period">
            <option value={14}>Last 14 days</option>
            <option value={28}>Last 4 weeks</option>
            <option value={56}>Last 8 weeks</option>
            <option value={91}>Last 13 weeks</option>
          </Select>
        }
      />
      <Notice className="text-xs">
        Based on {logged} logged day{logged === 1 ? '' : 's'} out of {days} ({basis === 'marked-complete' ? 'only days you marked as fully logged' : 'any day with entries — mark days complete in the diary for more reliable figures'}). Associations are not proof of cause and effect.
      </Notice>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Am I reaching my protein target?</CardTitle>
          {pAdh.n >= 3 ? (
            <p className="text-sm">
              Target reached (≥95%) on <strong>{pAdh.hit}</strong> of {pAdh.n} days (<strong>{Math.round((pAdh.rate ?? 0) * 100)}%</strong>). Average {Math.round(protein.value ?? 0)} g/day.
            </p>
          ) : (
            <InsufficientData height={80}>{targets?.length ? 'Needs at least 3 logged days with a protein target.' : 'Set a protein target in Settings.'}</InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>Average energy intake</CardTitle>
          {kcal.n >= 3 ? (
            <p className="text-sm">
              <strong>{Math.round(kcal.value!)} kcal/day</strong> over {kcal.n} logged days. {kAdh.n > 0 && `Within ±10% of target on ${kAdh.within}/${kAdh.n} days (${kAdh.over} over, ${kAdh.under} under).`}
            </p>
          ) : (
            <InsufficientData height={80}>Needs at least 3 logged days.</InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>How often do I train?</CardTitle>
          {inRangeW.length ? (
            <p className="text-sm">
              <strong>{inRangeW.length}</strong> gym sessions — about <strong>{avgPerWeek.toFixed(1)}</strong> per week across {perWeek.length} weeks.
            </p>
          ) : (
            <InsufficientData height={80}>No workouts in this period.</InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>How has my weight trend changed?</CardTitle>
          {trend ? (
            <p className="text-sm">
              Trend <strong>{trend.slopeKgPerWeek > 0 ? '+' : ''}{trend.slopeKgPerWeek.toFixed(2)} kg/week</strong> ({trend.n} weigh-ins over {trend.spanDays} days). Weight only — not body composition.
            </p>
          ) : (
            <InsufficientData height={80}>Needs ≥6 weigh-ins spanning ≥14 days.</InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>Do I eat differently on training days?</CardTitle>
          {trainVsRest.enoughData ? (
            <p className="text-sm">
              Training days: <strong>{Math.round(trainVsRest.aMean!)} kcal</strong>, {Math.round(trainVsRestP.aMean ?? 0)} g protein (n={trainVsRest.aN}). Rest days: <strong>{Math.round(trainVsRest.bMean!)} kcal</strong>, {Math.round(trainVsRestP.bMean ?? 0)} g protein (n={trainVsRest.bN}).
            </p>
          ) : (
            <InsufficientData height={80}>
              Needs ≥4 logged training days and ≥4 logged rest days (have {trainVsRest.aN} and {trainVsRest.bN}).
            </InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>Are workouts getting longer or shorter?</CardTitle>
          {durFirst != null && durSecond != null ? (
            <p className="text-sm">
              Earlier half of period: <strong>{Math.round(durFirst)} min</strong> average; later half: <strong>{Math.round(durSecond)} min</strong> (n={durations.length}).
            </p>
          ) : (
            <InsufficientData height={80}>Needs at least 4 workouts.</InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>Which exercises are improving?</CardTitle>
          {improving.length ? (
            <ul className="space-y-1 text-sm">
              {improving.slice(0, 6).map((x) => (
                <li key={x.key} className="flex justify-between">
                  <span>{x.name}</span>
                  <Badge tone={x.change > 0 ? 'green' : x.change < 0 ? 'amber' : 'slate'}>
                    {x.change > 0 ? '+' : ''}
                    {x.change.toFixed(1)} kg est. 1RM · n={x.n}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <InsufficientData height={80}>Needs an exercise performed at least 3 times in this period.</InsufficientData>
          )}
        </Card>
        <Card>
          <CardTitle>Do home-cooked recipes help me hit protein?</CardTitle>
          {prepVsNot.enoughData ? (
            <p className="text-sm">
              Protein target reached on <strong>{Math.round(prepVsNot.aMean! * 100)}%</strong> of days with a logged recipe (n={prepVsNot.aN}) vs <strong>{Math.round(prepVsNot.bMean! * 100)}%</strong> without (n={prepVsNot.bN}).
            </p>
          ) : (
            <InsufficientData height={80}>Needs ≥4 days in each group with a protein target.</InsufficientData>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Daily energy and protein</CardTitle>
        {logged >= 3 ? (
          <BarsWithLine data={all.map((d) => ({ date: shortDate(d.date), kcal: d.kcal != null ? Math.round(d.kcal) : null, protein: d.proteinG != null ? Math.round(d.proteinG) : null }))} xKey="date" bar={{ key: 'kcal', label: 'Energy (kcal)', color: SERIES.tertiary }} line={{ key: 'protein', label: 'Protein (g)', color: SERIES.secondary }} />
        ) : (
          <InsufficientData>Log food on at least 3 days.</InsufficientData>
        )}
      </Card>

      <Card>
        <CardTitle>Energy intake vs weight change (weekly)</CardTitle>
        {weeksWithBoth.length >= 2 ? (
          <>
            <BarsWithLine data={weeksWithBoth.map((w) => ({ week: shortDate(w.week), kcal: Math.round(w.avgKcal!), weight: Math.round(w.avgWeight! * 10) / 10 }))} xKey="week" bar={{ key: 'kcal', label: 'Avg kcal/day', color: SERIES.tertiary }} line={{ key: 'weight', label: 'Avg weight (kg)', color: SERIES.primary }} />
            <p className="mt-2 text-sm">{corr ? `Across ${corr.n} week-to-week changes there is ${describeCorrelation(corr.r)} (r = ${corr.r.toFixed(2)}) between intake and the following change in average weight.` : 'Need at least 4 weeks with ≥4 logged days and ≥2 weigh-ins to describe an association.'}</p>
          </>
        ) : (
          <InsufficientData>Needs ≥2 weeks with ≥4 logged days and ≥2 weigh-ins each.</InsufficientData>
        )}
      </Card>

      <Card>
        <CardTitle>Most frequently eaten</CardTitle>
        {entries.length ? <Bars data={topFoods(entries, 8).map((f) => ({ name: f.name.length > 18 ? f.name.slice(0, 17) + '…' : f.name, times: f.count }))} xKey="name" series={[{ key: 'times', label: 'Times logged', color: SERIES.primary }]} height={220} /> : <InsufficientData>No food logged in this period.</InsufficientData>}
      </Card>
    </div>
  );
}

function useMemoImproving(workouts: import('../../domain/workouts/types').WorkoutSession[], start: string) {
  return useMemo(() => {
    const keys = new Map<string, string>();
    for (const s of workouts) for (const es of s.exercises) if (es.tracking === 'weight_reps' && isoToDateKey(s.startedAt) >= start) keys.set(sessionComparisonKey(s, es), es.exerciseName);
    const out: { key: string; name: string; change: number; n: number }[] = [];
    for (const [key, name] of keys) {
      const p = exerciseProgress(workouts, key).filter((x) => isoToDateKey(x.date) >= start && x.e1rmKg != null);
      if (p.length < 3) continue;
      out.push({ key, name, change: p[p.length - 1]!.e1rmKg! - p[0]!.e1rmKg!, n: p.length });
    }
    return out.sort((a, b) => b.change - a.change);
  }, [workouts, start]);
}
