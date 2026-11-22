import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Dumbbell, Footprints, Play, Plus, Pencil, CalendarRange, History, ListChecks } from 'lucide-react';
import { db } from '../../db/db';
import { addExampleProgrammes } from '../../db/seed';
import { startWorkout } from '../../db/workoutService';
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader, Tabs } from '../../components/ui';
import { useToast } from '../../components/toast';
import { nextTemplateInProgramme } from '../../domain/workouts/session';
import { sessionVolume } from '../../domain/workouts/records';
import { CARDIO_LABEL } from '../../domain/workouts/types';
import { formatDateKey, formatDuration, isoToDateKey } from '../../lib/dates';
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';

type Tab = 'start' | 'history' | 'cardio';

export function WorkoutsPage() {
  const [tab, setTab] = useState<Tab>('start');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Workouts"
        subtitle="WorkoutLab"
        actions={
          <Link to="/exercises">
            <Button variant="outline">Exercise library</Button>
          </Link>
        }
      />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'start', label: 'Train' }, { value: 'history', label: 'History' }, { value: 'cardio', label: 'Cardio & walks' }]} />
      {tab === 'start' && <StartTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'cardio' && <CardioTab />}
    </div>
  );
}

function StartTab() {
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const history = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const active = useLiveQuery(() => db.workouts.where('status').equals('active').first(), []);
  const gyms = useLiveQuery(() => db.gyms.toArray(), []);
  const prefs = useLiveQuery(() => db.preferences.get('prefs'), []);
  const navigate = useNavigate();
  const toast = useToast();
  const [gymId, setGymId] = useState<string | null>(null);
  const gym = gymId ?? prefs?.defaultGymId ?? null;

  const begin = async (templateId: string | null, programmeId: string | null = null) => {
    if (active) return navigate('/workouts/active');
    await startWorkout({ templateId, programmeId, gymId: gym });
    navigate('/workouts/active');
  };
  const activeProgrammes = (programmes ?? []).filter((p) => p.active);
  const tplName = (id: string) => templates?.find((t) => t.id === id)?.name ?? 'Unknown template';

  const newTemplate = async () => {
    const id = newId('tpl');
    await db.templates.add({ id, name: 'New workout', description: '', exercises: [], notes: '', archived: false, createdAt: nowIso(), updatedAt: nowIso() });
    navigate(`/workouts/templates/${id}`);
  };
  const newProgramme = async () => {
    const id = newId('prog');
    await db.programmes.add({ id, name: 'New programme', description: '', templateIds: [], schedule: { type: 'rotation' }, targetSessionsPerWeek: null, active: true, createdAt: nowIso(), updatedAt: nowIso() });
    navigate(`/workouts/programmes/${id}`);
  };

  return (
    <div className="space-y-4">
      {active && (
        <Card className="border-lift-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{active.name} in progress</div>
              <div className="text-xs text-slate-500">Started {new Date(active.startedAt).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}</div>
            </div>
            <Link to="/workouts/active">
              <Button>Resume</Button>
            </Link>
          </div>
        </Card>
      )}

      {(gyms?.length ?? 0) > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Training at</span>
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" value={gym ?? ''} onChange={(e) => setGymId(e.target.value)} aria-label="Gym">
            {gyms!.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeProgrammes.map((p) => {
        const next = nextTemplateInProgramme(p, history ?? []);
        return (
          <Card key={p.id}>
            <CardTitle action={<Link to={`/workouts/programmes/${p.id}`} className="text-xs text-brand-700">Edit</Link>}>{p.name}</CardTitle>
            {next ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">{next.when}</div>
                  <div className="text-lg font-semibold">{tplName(next.templateId)}</div>
                </div>
                <Button size="lg" onClick={() => void begin(next.templateId, p.id)}>
                  <Play className="h-4 w-4" /> Start
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Add templates to this programme to schedule workouts.</p>
            )}
          </Card>
        );
      })}

      <Button variant="outline" size="lg" className="w-full" onClick={() => void begin(null)}>
        <Dumbbell className="h-5 w-5" /> Start an empty workout
      </Button>

      <Card>
        <CardTitle action={<Button size="sm" variant="ghost" onClick={() => void newTemplate()}><Plus className="h-4 w-4" /> Template</Button>}>Workout templates</CardTitle>
        {(templates ?? []).filter((t) => !t.archived).length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(templates ?? [])
              .filter((t) => !t.archived)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="truncate text-xs text-slate-500">{t.exercises.length} exercises</div>
                  </div>
                  <div className="flex gap-1">
                    <Link to={`/workouts/templates/${t.id}`}>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button size="sm" onClick={() => void begin(t.id)} aria-label={`Start ${t.name}`}>
                      <Play className="h-4 w-4" /> Start
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No templates yet" action={<Button variant="outline" onClick={async () => { await addExampleProgrammes(); toast('Added example programmes and templates'); }}>Add example programmes</Button>}>
            Create your own, or add optional examples (full-body beginner, upper/lower, three-day full body). Examples contain no weights or history.
          </EmptyState>
        )}
      </Card>

      <Card>
        <CardTitle action={<Button size="sm" variant="ghost" onClick={() => void newProgramme()}><Plus className="h-4 w-4" /> Programme</Button>}>Programmes</CardTitle>
        {(programmes ?? []).length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {programmes!.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <Link to={`/workouts/programmes/${p.id}`} className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.templateIds.length} workouts · {p.schedule.type === 'rotation' ? 'rotation' : 'fixed weekdays'}
                  </div>
                </Link>
                <Button variant={p.active ? 'secondary' : 'outline'} size="sm" onClick={() => void db.programmes.update(p.id, { active: !p.active })}>
                  {p.active ? 'Active' : 'Activate'}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            <CalendarRange className="mr-1 inline h-4 w-4" />A programme groups templates into a rotation or a weekday schedule.
          </p>
        )}
      </Card>
    </div>
  );
}

function HistoryTab() {
  const sessions = useLiveQuery(() => db.workouts.where('status').equals('completed').reverse().sortBy('startedAt'), []);
  if (!sessions) return null;
  if (!sessions.length) return <EmptyState icon={<History className="h-6 w-6" />} title="No workouts logged yet">Completed workouts appear here with their sets, volume and records.</EmptyState>;
  return (
    <Card className="p-0">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link to={`/workouts/history/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-slate-500">
                  {formatDateKey(isoToDateKey(s.startedAt), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {s.endedAt ? formatDuration(new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) : ''} · {s.exercises.length} exercises
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                {Math.round(sessionVolume(s)).toLocaleString()} kg vol.
                {s.revision > 0 && <Badge className="ml-1">edited</Badge>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CardioTab() {
  const list = useLiveQuery(() => db.cardio.orderBy('date').reverse().limit(60).toArray(), []);
  const totals = useMemo(() => {
    const cutoff = isoToDateKey(new Date(Date.now() - 6 * 86_400_000).toISOString());
    const week = (list ?? []).filter((c) => c.date >= cutoff);
    return { minutes: week.reduce((s, c) => s + c.durationMin, 0), km: week.reduce((s, c) => s + (c.distanceKm ?? 0), 0), n: week.length };
  }, [list]);
  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between">
        <div className="text-sm">
          <div className="text-xs text-slate-500">Last 7 days</div>
          <div className="font-semibold">
            {totals.n} activities · {Math.round(totals.minutes)} min · {totals.km.toFixed(1)} km
          </div>
        </div>
        <Link to="/workouts/cardio/new">
          <Button>
            <Plus className="h-4 w-4" /> Log activity
          </Button>
        </Link>
      </Card>
      {list?.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((c) => (
              <li key={c.id}>
                <Link to={`/workouts/cardio/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <div className="font-medium">{CARDIO_LABEL[c.type]}</div>
                    <div className="text-xs text-slate-500">
                      {formatDateKey(c.date)} · {c.durationMin} min{c.distanceKm ? ` · ${c.distanceKm} km` : ''}
                      {c.elevationGainM ? ` · ↑${c.elevationGainM} m` : ''}
                    </div>
                  </div>
                  {c.energyEstimate && <Badge tone="amber" title={c.energyEstimate.method}>≈{c.energyEstimate.kcal} kcal est.</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<Footprints className="h-6 w-6" />} title="No activities yet">Log walks, hikes, rides and cardio-machine sessions. GPS isn't required.</EmptyState>
      )}
    </div>
  );
}
