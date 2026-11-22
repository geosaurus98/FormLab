import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '../../db/db';
import { Button, Card, Field, Input, NumberInput, PageHeader, Textarea, Checkbox, Notice } from '../../components/ui';
import { useToast } from '../../components/toast';
import { CARDIO_LABEL, CARDIO_TYPES, type CardioType } from '../../domain/workouts/types';
import { MET_VALUES, estimateCardioKcal, paceMinPerKm } from '../../domain/workouts/cardio';
import { latestBodyweightKg, logCardio } from '../../db/workoutService';
import { useToday } from '../../hooks/data';
import { nowIso } from '../../lib/utils';

export function CardioPage() {
  const { id } = useParams();
  const existing = useLiveQuery(() => (id && id !== 'new' ? db.cardio.get(id) : undefined), [id]);
  const today = useToday();
  const navigate = useNavigate();
  const toast = useToast();
  const [type, setType] = useState<CardioType>('walk');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState<number | null>(30);
  const [distance, setDistance] = useState<number | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState(true);
  const [bw, setBw] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => void latestBodyweightKg().then(setBw), []);
  useEffect(() => {
    if (existing && !loaded) {
      setType(existing.type);
      setDate(existing.date);
      setTime(existing.startedAt ? new Date(existing.startedAt).toTimeString().slice(0, 5) : '');
      setDuration(existing.durationMin);
      setDistance(existing.distanceKm);
      setElevation(existing.elevationGainM);
      setHr(existing.avgHeartRate);
      setNotes(existing.notes);
      setEstimate(!!existing.energyEstimate);
      setLoaded(true);
    }
  }, [existing, loaded]);

  const est = estimate && duration ? estimateCardioKcal(type, duration, bw) : null;
  const pace = duration && distance ? paceMinPerKm({ durationMin: duration, distanceKm: distance }) : null;

  const save = async () => {
    if (!duration) return;
    const startedAt = time ? new Date(`${date}T${time}`).toISOString() : null;
    if (existing) {
      await db.cardio.put({ ...existing, type, date, startedAt, durationMin: duration, distanceKm: distance, elevationGainM: elevation, avgHeartRate: hr, notes, energyEstimate: estimate ? estimateCardioKcal(type, duration, bw) : null, updatedAt: nowIso() });
      toast('Activity updated');
    } else {
      const { duplicateOf } = await logCardio({ type, date, startedAt, durationMin: duration, distanceKm: distance, elevationGainM: elevation, avgHeartRate: hr, notes, estimateEnergy: estimate });
      toast(duplicateOf ? 'Saved — this looks similar to another activity on the same day; check for a duplicate.' : 'Activity logged');
    }
    navigate('/workouts');
  };

  return (
    <div className="space-y-4">
      <PageHeader title={existing ? 'Edit activity' : 'Log activity'} back={<Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>} />
      <Card className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {CARDIO_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-lg border px-2 py-2 text-sm ${type === t ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-200 dark:border-slate-700'}`} aria-pressed={type === t}>
              {CARDIO_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">{(fid) => <Input id={fid} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Start time (optional)">{(fid) => <Input id={fid} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          <Field label="Duration (min)">{(fid) => <NumberInput id={fid} value={duration} onChange={setDuration} min={1} />}</Field>
          <Field label="Distance (km)">{(fid) => <NumberInput id={fid} value={distance} onChange={setDistance} step={0.1} min={0} placeholder="optional" />}</Field>
          <Field label="Elevation gain (m)">{(fid) => <NumberInput id={fid} value={elevation} onChange={setElevation} min={0} placeholder="optional" />}</Field>
          <Field label="Average heart rate">{(fid) => <NumberInput id={fid} value={hr} onChange={setHr} min={30} placeholder="optional" />}</Field>
        </div>
        {pace && <p className="text-sm text-slate-500">Pace: {Math.floor(pace)}:{String(Math.round((pace % 1) * 60)).padStart(2, '0')} min/km</p>}
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (route, conditions…)" aria-label="Notes" />
        <Checkbox checked={estimate} onChange={setEstimate} label="Store an estimated energy expenditure" />
        {estimate && (
          <Notice tone={bw ? 'info' : 'warn'}>
            {bw
              ? `≈ ${est?.kcal ?? 0} kcal (estimate). ${MET_VALUES[type].note}; MET ${MET_VALUES[type].met} minus resting, × ${bw.toFixed(1)} kg. Population estimates can be off by ±20% or more; this is not added to your food allowance unless you enable that in Settings.`
              : 'Record a body weight on the Progress page to enable an energy estimate.'}
          </Notice>
        )}
      </Card>
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" disabled={!duration} onClick={() => void save()}>
          Save
        </Button>
        {existing && (
          <Button
            size="lg"
            variant="outline"
            onClick={async () => {
              await db.cardio.delete(existing.id);
              navigate('/workouts');
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
