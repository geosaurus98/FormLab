import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, Clock, Footprints, Lightbulb, Play, Scissors, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, EmptyState, Notice } from '../../components/ui';
import { recommendTraining, type TemplateAssessment } from '../../domain/workouts/recommend';
import { startFromPlan } from '../../db/workoutService';
import { usePrefs, useToday } from '../../hooks/data';
import { startOfWeek } from '../../lib/dates';
import { cn } from '../../lib/utils';

const TIME_OPTIONS = [null, 30, 45, 60, 90] as const;
const TIME_KEY = 'formlab.availableMinutes';

function readTime(): number | null {
  try {
    const v = localStorage.getItem(TIME_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/** Explainable "what should I train today?" panel. Compact variant is used on Home. */
export function RecommendationCard({ compact = false }: { compact?: boolean }) {
  const prefs = usePrefs();
  const today = useToday();
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const history = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const active = useLiveQuery(() => db.workouts.where('status').equals('active').first(), []);
  const [minutes, setMinutes] = useState<number | null>(readTime);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();

  const rec = useMemo(() => {
    if (!prefs || !templates || !programmes || !history || !exercises || !equipment) return null;
    const consistency = prefs.goals.find((g) => g.id === 'consistency' && g.enabled);
    return recommendTraining({
      templates,
      programmes,
      history,
      exercises: new Map(exercises.map((e) => [e.id, e])),
      equipment: new Map(equipment.map((e) => [e.id, e])),
      recovery: { defaultHours: prefs.recoveryDefaultHours, overrides: prefs.recoveryOverrides },
      availableMin: minutes,
      weekStart: startOfWeek(today, prefs.weekStartsOn),
      weeklyTarget: consistency?.target ?? null
    });
  }, [prefs, templates, programmes, history, exercises, equipment, minutes, today]);

  if (!rec || active) return null;
  const exName = (id: string) => exercises?.find((e) => e.id === id)?.name ?? id;
  const setTime = (m: number | null) => {
    setMinutes(m);
    try {
      if (m == null) localStorage.removeItem(TIME_KEY);
      else localStorage.setItem(TIME_KEY, String(m));
    } catch {
      /* per-device convenience only */
    }
  };
  const start = async (a: TemplateAssessment) => {
    const progId = a.source === 'programme' ? programmes?.find((p) => p.active && p.templateIds.includes(a.template.id))?.id ?? null : null;
    await startFromPlan({ templateId: a.template.id, programmeId: progId, plan: a.plan });
    navigate('/workouts/active');
  };

  if (rec.kind === 'no-templates') {
    if (compact) return null;
    return (
      <Card>
        <CardTitle>Recommended today</CardTitle>
        <EmptyState icon={<Lightbulb className="h-6 w-6" />} title="No templates yet">Create a template (or add the examples below) to get recommendations.</EmptyState>
      </Card>
    );
  }

  const best = rec.best!;
  return (
    <Card className={compact ? '' : 'border-lift-500/40'}>
      <CardTitle action={!compact && <Link to="/settings#training" className="text-xs text-brand-700">Recovery settings</Link>}>
        <span className="flex items-center gap-1">
          <Lightbulb className="h-4 w-4 text-lift-500" /> Recommended today
        </span>
      </CardTitle>

      <div className="mb-3 flex items-center gap-1 overflow-x-auto" role="group" aria-label="Time available">
        <Clock className="mr-1 h-4 w-4 shrink-0 text-slate-400" />
        {TIME_OPTIONS.map((m) => (
          <button key={m ?? 'any'} onClick={() => setTime(m)} aria-pressed={minutes === m} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-medium', minutes === m ? 'border-lift-500 bg-lift-500 text-white' : 'border-slate-300 dark:border-slate-700')}>
            {m == null ? 'Any time' : `${m} min`}
          </button>
        ))}
      </div>

      {rec.kind === 'rest-or-cardio' && (
        <Notice className="mb-3">
          <Footprints className="mr-1 inline h-4 w-4" />
          {rec.summary[rec.summary.length - 1]}{' '}
          <Link to="/workouts/cardio/new" className="font-medium underline">
            Log a walk
          </Link>
        </Notice>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold">{best.template.name}</div>
          <div className="text-xs text-slate-500">
            ≈{best.estimatedMinutes} min{best.estimatedMinutes !== best.originalMinutes && ` (normally ≈${best.originalMinutes})`} · {best.plan.filter((p) => p.action !== 'drop').length} exercises
          </div>
        </div>
        <Button onClick={() => void start(best)} className="shrink-0 bg-lift-600 hover:bg-lift-500" aria-label={`Start recommended ${best.template.name}`}>
          <Play className="h-4 w-4" /> Start
        </Button>
      </div>

      <ul className="mt-2 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
        {best.reasons.map((r) => (
          <li key={r}>✓ {r}</li>
        ))}
        {best.warnings.map((w) => (
          <li key={w} className="text-amber-700 dark:text-amber-400">
            ! {w}
          </li>
        ))}
      </ul>

      {!compact && best.plan.some((p) => p.action !== 'keep') && (
        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/50">
          {best.plan
            .filter((p) => p.action !== 'keep')
            .map((p) => (
              <div key={p.templateExerciseId} className="flex items-start gap-1.5">
                {p.action === 'swap' ? <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : p.action === 'trim' ? <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  <span className="font-medium">{exName(p.exerciseId)}</span>: {p.reason}
                </span>
              </div>
            ))}
        </div>
      )}

      {!compact && best.recovery.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {best.recovery.map((r) => (
            <Badge key={r.muscle} tone={r.recovered ? 'green' : 'amber'} title={`Preference: ${r.requiredHours} h`}>
              {r.muscle} {r.hoursSince == null ? '· not trained recently' : `· ${Math.round(r.hoursSince)} h`}
            </Badge>
          ))}
        </div>
      )}

      {!compact && <p className="mt-2 text-xs text-slate-500">{rec.summary.slice(0, rec.kind === 'rest-or-cardio' ? -1 : undefined).join(' ')}</p>}

      {!compact && rec.alternatives.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
          <button className="text-xs font-medium text-brand-700" onClick={() => setShowAll((x) => !x)}>
            {showAll ? 'Hide' : 'Show'} other options ({rec.alternatives.length})
          </button>
          {showAll &&
            rec.alternatives.map((a) => (
              <div key={a.template.id} className="mt-2 flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{a.template.name} <span className="text-xs font-normal text-slate-500">≈{a.estimatedMinutes} min</span></div>
                  <div className="text-xs text-slate-500">{[...a.reasons, ...a.warnings].join(' · ') || 'No specific notes'}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void start(a)}>
                  Start
                </Button>
              </div>
            ))}
        </div>
      )}
      {!compact && <p className="mt-2 text-[11px] text-slate-400">Based only on what you've logged and your own settings; it can't judge readiness, pain or illness.</p>}
    </Card>
  );
}
