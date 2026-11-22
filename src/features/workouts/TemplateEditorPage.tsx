import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import { Button, Card, Field, Input, NumberInput, PageHeader, Select, Textarea, Checkbox, Notice } from '../../components/ui';
import { useToast } from '../../components/toast';
import { ExercisePicker } from './ActiveWorkoutPage';
import { DEFAULT_PROGRESSION } from '../../domain/workouts/session';
import { WorkoutTemplateSchema, WorkoutProgrammeSchema, type WorkoutProgramme, type WorkoutTemplate, type ProgressionRule } from '../../domain/workouts/types';
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';

const METHOD_LABEL: Record<ProgressionRule['method'], string> = {
  double: 'Double progression (reps, then weight)',
  fixed: 'Fixed increment when all sets done',
  reps: 'Add reps',
  time: 'Add time',
  manual: 'Manual (repeat last)'
};

export function TemplateEditorPage() {
  const { id } = useParams();
  const stored = useLiveQuery(() => db.templates.get(id!), [id]);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [t, setT] = useState<WorkoutTemplate | null>(null);
  const [picker, setPicker] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  useEffect(() => {
    if (stored && !t) setT(stored);
  }, [stored, t]);
  if (!t) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const exName = (eid: string) => exercises?.find((e) => e.id === eid)?.name ?? eid;
  const patchEx = (i: number, patch: Partial<WorkoutTemplate['exercises'][number]>) => setT({ ...t, exercises: t.exercises.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const move = (i: number, d: -1 | 1) => {
    const list = [...t.exercises];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setT({ ...t, exercises: list });
  };
  const save = async () => {
    const parsed = WorkoutTemplateSchema.safeParse({ ...t, updatedAt: nowIso() });
    if (!parsed.success) return toast(`Can't save: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    await db.templates.put(parsed.data);
    toast('Template saved');
    navigate('/workouts');
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Edit template" back={<Link to="/workouts" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Workouts</Link>} />
      <Notice>Editing a template only affects future workouts. Completed workouts keep the targets they were performed with.</Notice>
      <Card className="space-y-3">
        <Field label="Name">{(fid) => <Input id={fid} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />}</Field>
        <Field label="Description">{(fid) => <Textarea id={fid} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />}</Field>
      </Card>
      {t.exercises.map((te, i) => (
        <Card key={te.id} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {i + 1}. {exName(te.exerciseId)}
            </h2>
            <div className="flex">
              <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => move(i, -1)}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => move(i, 1)}>
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setT({ ...t, exercises: t.exercises.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Field label="Sets">{(fid) => <NumberInput id={fid} value={te.sets} onChange={(v) => patchEx(i, { sets: Math.max(1, v ?? 1) })} min={1} />}</Field>
            <Field label="Reps min">{(fid) => <NumberInput id={fid} value={te.repMin} onChange={(v) => patchEx(i, { repMin: v ?? 0 })} min={0} />}</Field>
            <Field label="Reps max">{(fid) => <NumberInput id={fid} value={te.repMax} onChange={(v) => patchEx(i, { repMax: v ?? 0 })} min={0} />}</Field>
            <Field label="Rest (s)">{(fid) => <NumberInput id={fid} value={te.restSec} onChange={(v) => patchEx(i, { restSec: v ?? 0 })} step={15} min={0} />}</Field>
            <Field label="Warm-ups">{(fid) => <NumberInput id={fid} value={te.warmupSets} onChange={(v) => patchEx(i, { warmupSets: v ?? 0 })} min={0} />}</Field>
            <Field label="Target kg">{(fid) => <NumberInput id={fid} value={te.targetWeightKg} onChange={(v) => patchEx(i, { targetWeightKg: v })} step={0.5} min={0} placeholder="—" />}</Field>
            <Field label="Target RPE">{(fid) => <NumberInput id={fid} value={te.rpe} onChange={(v) => patchEx(i, { rpe: v })} step={0.5} min={1} placeholder="—" />}</Field>
            <Field label="Target RIR">{(fid) => <NumberInput id={fid} value={te.rir} onChange={(v) => patchEx(i, { rir: v })} min={0} placeholder="—" />}</Field>
            <Field label="Time (s)">{(fid) => <NumberInput id={fid} value={te.targetDurationSec} onChange={(v) => patchEx(i, { targetDurationSec: v })} step={5} min={0} placeholder="—" />}</Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Progression" className="sm:col-span-2">
              {(fid) => (
                <Select id={fid} value={te.progression.method} onChange={(e) => patchEx(i, { progression: { ...te.progression, method: e.target.value as ProgressionRule['method'] } })}>
                  {Object.entries(METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Increment kg" hint="Blank = equipment default">{(fid) => <NumberInput id={fid} value={te.progression.incrementKg} onChange={(v) => patchEx(i, { progression: { ...te.progression, incrementKg: v } })} step={0.5} min={0} placeholder="auto" />}</Field>
            <Field label="Max RPE to progress" hint="Optional effort ceiling">{(fid) => <NumberInput id={fid} value={te.progression.maxRpeToProgress} onChange={(v) => patchEx(i, { progression: { ...te.progression, maxRpeToProgress: v } })} step={0.5} min={1} placeholder="none" />}</Field>
          </div>
          <Input value={te.notes} onChange={(e) => patchEx(i, { notes: e.target.value })} placeholder="Notes (e.g. seat 4)" aria-label="Notes" />
        </Card>
      ))}
      <Button variant="outline" className="w-full" onClick={() => setPicker(true)}>
        <Plus className="h-4 w-4" /> Add exercise
      </Button>
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" onClick={() => void save()}>
          Save template
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={async () => {
            await db.templates.update(t.id, { archived: true });
            navigate('/workouts');
          }}
        >
          Archive
        </Button>
      </div>
      <ExercisePicker
        open={picker}
        title="Add exercise"
        replaceFor={null}
        onClose={() => setPicker(false)}
        onPick={(exerciseId) => {
          const ex = exercises?.find((e) => e.id === exerciseId);
          const timed = ex?.tracking === 'duration';
          setT({ ...t, exercises: [...t.exercises, { id: newId('te'), exerciseId, sets: 3, repMin: timed ? 0 : 8, repMax: timed ? 0 : 12, targetWeightKg: null, targetDurationSec: timed ? 30 : null, restSec: 90, warmupSets: 0, rpe: null, rir: null, notes: '', progression: { ...DEFAULT_PROGRESSION, method: timed ? 'time' : 'double' } }] });
          setPicker(false);
        }}
      />
    </div>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ProgrammeEditorPage() {
  const { id } = useParams();
  const stored = useLiveQuery(() => db.programmes.get(id!), [id]);
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.archived).toArray(), []);
  const [p, setP] = useState<WorkoutProgramme | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  useEffect(() => {
    if (stored && !p) setP(stored);
  }, [stored, p]);
  if (!p) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const days = p.schedule.type === 'weekdays' ? p.schedule.days : [];
  return (
    <div className="space-y-4">
      <PageHeader title="Edit programme" back={<Link to="/workouts" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Workouts</Link>} />
      <Card className="space-y-3">
        <Field label="Name">{(fid) => <Input id={fid} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />}</Field>
        <Field label="Description">{(fid) => <Textarea id={fid} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />}</Field>
        <Field label="Target sessions per week (optional)">{(fid) => <NumberInput id={fid} value={p.targetSessionsPerWeek} onChange={(v) => setP({ ...p, targetSessionsPerWeek: v })} min={1} />}</Field>
        <Checkbox checked={p.active} onChange={(v) => setP({ ...p, active: v })} label="Active (shown on Home and Train)" />
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Workouts in this programme</h2>
        {(templates ?? []).map((t) => (
          <Checkbox key={t.id} checked={p.templateIds.includes(t.id)} onChange={(on) => setP({ ...p, templateIds: on ? [...p.templateIds, t.id] : p.templateIds.filter((x) => x !== t.id) })} label={t.name} />
        ))}
        {!templates?.length && <p className="text-sm text-slate-500">Create a template first.</p>}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Schedule</h2>
        <Select value={p.schedule.type} onChange={(e) => setP({ ...p, schedule: e.target.value === 'rotation' ? { type: 'rotation' } : { type: 'weekdays', days: [] } })} aria-label="Schedule type">
          <option value="rotation">Rotation — next workout in order, whenever I train</option>
          <option value="weekdays">Fixed weekdays</option>
        </Select>
        {p.schedule.type === 'weekdays' &&
          WEEKDAYS.map((label, wd) => (
            <div key={wd} className="flex items-center gap-2">
              <span className="w-10 text-sm font-medium">{label}</span>
              <Select
                value={days.find((d) => d.weekday === wd)?.templateId ?? ''}
                onChange={(e) => {
                  const rest = days.filter((d) => d.weekday !== wd);
                  setP({ ...p, schedule: { type: 'weekdays', days: e.target.value ? [...rest, { weekday: wd, templateId: e.target.value }] : rest } });
                }}
                aria-label={`${label} workout`}
              >
                <option value="">Rest / unscheduled</option>
                {p.templateIds.map((tid) => (
                  <option key={tid} value={tid}>
                    {templates?.find((t) => t.id === tid)?.name ?? tid}
                  </option>
                ))}
              </Select>
            </div>
          ))}
      </Card>
      <div className="flex gap-2">
        <Button
          size="lg"
          className="flex-1"
          onClick={async () => {
            await db.programmes.put(WorkoutProgrammeSchema.parse({ ...p, updatedAt: nowIso() }));
            toast('Programme saved');
            navigate('/workouts');
          }}
        >
          Save programme
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={async () => {
            if (!confirm('Delete this programme? Templates and history are kept.')) return;
            await db.programmes.delete(p.id);
            navigate('/workouts');
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
