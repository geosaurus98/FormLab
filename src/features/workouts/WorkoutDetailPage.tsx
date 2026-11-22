import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Copy, Pencil, Trophy, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Input, NumberInput, PageHeader, Stat, Textarea, Notice, Sheet } from '../../components/ui';
import { useToast } from '../../components/toast';
import { summariseSession, exerciseVolume } from '../../domain/workouts/records';
import { removeSet, updateSet } from '../../domain/workouts/session';
import { SET_TYPE_LABEL, type WorkoutSession } from '../../domain/workouts/types';
import { saveEditedWorkout, templateFromSession } from '../../db/workoutService';
import { formatDateKey, formatDuration, isoToDateKey } from '../../lib/dates';

export function WorkoutDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const session = useLiveQuery(() => db.workouts.get(id!), [id]);
  const history = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const [editing, setEditing] = useState<WorkoutSession | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const summary = useMemo(() => (session && history ? summariseSession(session, history) : null), [session, history]);
  if (!session || !summary) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const view = editing ?? session;
  const cmp = summary.comparison;

  return (
    <div className="space-y-4">
      <PageHeader
        title={session.name}
        subtitle={`${formatDateKey(isoToDateKey(session.startedAt), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${session.revision ? ` · edited ${session.revision}×` : ''}`}
        back={
          <Link to="/workouts" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500">
            <ArrowLeft className="h-4 w-4" /> Workouts
          </Link>
        }
        actions={
          !editing && (
            <>
              <Button variant="outline" onClick={() => setEditing(structuredClone(session))}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" onClick={() => { setTplName(session.name); setTplOpen(true); }}>
                <Copy className="h-4 w-4" /> Save as template
              </Button>
            </>
          )
        }
      />
      {params.get('summary') && !editing && <Notice tone="success">Workout saved. Nice work.</Notice>}

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Duration" value={formatDuration(summary.durationMs)} sub={cmp ? `prev ${formatDuration(cmp.previousDurationMs)}` : undefined} />
          <Stat label="Exercises" value={summary.exercisesCompleted} />
          <Stat label="Sets" value={summary.setsCompleted} sub={cmp ? `prev ${cmp.previousSets}` : undefined} />
          <Stat label="Volume (loaded)" value={`${Math.round(summary.volumeKg).toLocaleString()} kg`} sub={cmp ? `prev ${Math.round(cmp.previousVolumeKg).toLocaleString()} kg` : 'Weight × reps, external load only'} />
        </div>
      </Card>

      {summary.records.length > 0 && (
        <Card>
          <CardTitle>Personal records</CardTitle>
          <ul className="space-y-1 text-sm">
            {summary.records.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="font-medium">{r.exerciseName}</span> — {r.label}
                {r.estimate && <Badge tone="amber">estimate</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Records compare only the same exercise on comparable equipment (machines are compared within the same gym and variant).</p>
        </Card>
      )}

      {editing && <Notice tone="warn">Editing a completed workout. Records and charts are recalculated from history, so nothing is left stale.</Notice>}

      {view.exercises.map((es) => (
        <Card key={es.id}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              <Link to={`/exercises/${es.exerciseId}`}>{es.exerciseName}</Link>
              {es.variant && <span className="text-sm font-normal text-slate-500"> · {es.variant}</span>}
            </h2>
            {exerciseVolume(es) != null && <span className="text-xs text-slate-500">{Math.round(exerciseVolume(es)!)} kg</span>}
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="w-10">Set</th>
                <th>Type</th>
                <th>Load</th>
                <th>Reps / time</th>
                {editing && <th />}
              </tr>
            </thead>
            <tbody>
              {es.sets.map((s, i) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">{i + 1}</td>
                  <td>{SET_TYPE_LABEL[s.type]}</td>
                  <td>
                    {editing && es.tracking === 'weight_reps' ? (
                      <NumberInput value={s.weightKg} onChange={(v) => setEditing((w) => w && updateSet(w, es.id, s.id, { weightKg: v }))} className="h-8 w-20" aria-label="Weight" />
                    ) : es.tracking === 'weight_reps' ? (
                      `${s.weightKg ?? '—'} kg`
                    ) : es.tracking === 'bodyweight_reps' ? (
                      `BW${s.addedKg ? ` + ${s.addedKg} kg` : ''}`
                    ) : es.tracking === 'assisted_bodyweight' ? (
                      `BW − ${s.assistanceKg ?? 0} kg assist`
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {editing && (es.tracking === 'weight_reps' || es.tracking.includes('bodyweight') || es.tracking === 'reps') ? (
                      <NumberInput value={s.reps} onChange={(v) => setEditing((w) => w && updateSet(w, es.id, s.id, { reps: v }))} className="h-8 w-16" aria-label="Reps" />
                    ) : es.tracking === 'duration' ? (
                      `${s.durationSec ?? 0} s`
                    ) : es.tracking === 'distance_duration' ? (
                      `${Math.round((s.durationSec ?? 0) / 60)} min${s.distanceM ? ` · ${(s.distanceM / 1000).toFixed(2)} km` : ''}`
                    ) : (
                      s.reps ?? '—'
                    )}
                    {s.rpe != null && <span className="ml-1 text-xs text-slate-500">RPE {s.rpe}</span>}
                  </td>
                  {editing && (
                    <td>
                      <Button variant="ghost" size="icon" aria-label="Delete set" onClick={() => setEditing((w) => w && removeSet(w, es.id, s.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {es.notes && <p className="mt-2 text-xs text-slate-500">{es.notes}</p>}
        </Card>
      ))}

      {editing ? (
        <Card className="space-y-3">
          <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Notes" aria-label="Workout notes" />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={async () => {
                await saveEditedWorkout(session, editing);
                setEditing(null);
                toast('Workout updated');
              }}
            >
              Save changes
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (!confirm('Delete this workout permanently?')) return;
              await db.workouts.delete(session.id);
              navigate('/workouts');
            }}
          >
            Delete workout
          </Button>
        </Card>
      ) : (
        session.notes && (
          <Card>
            <CardTitle>Notes</CardTitle>
            <p className="whitespace-pre-wrap text-sm">{session.notes}</p>
          </Card>
        )
      )}

      <Sheet
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Save as template"
        footer={
          <Button
            className="w-full"
            disabled={!tplName.trim()}
            onClick={async () => {
              const t = await templateFromSession(session, tplName.trim());
              setTplOpen(false);
              navigate(`/workouts/templates/${t.id}`);
            }}
          >
            Create template
          </Button>
        }
      >
        <Input value={tplName} onChange={(e) => setTplName(e.target.value)} aria-label="Template name" />
      </Sheet>
    </div>
  );
}
