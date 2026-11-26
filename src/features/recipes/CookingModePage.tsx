import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Thermometer, Timer, X } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, Checkbox, Field, NumberInput, Select, Sheet, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useNow, useNutritionLookup, useToday } from '../../hooks/data';
import { scaleVersion } from '../../domain/recipes/scaling';
import { checkRecipeSafety } from '../../domain/recipes/safety';
import { APPLIANCE_LABEL, FEEDBACK_ISSUES, type CookingSession } from '../../domain/recipes/types';
import { addFeedback, finishCooking, startCooking } from '../../db/recipeService';
import { logRecipe } from '../../db/foodService';
import { formatQuantity } from '../../lib/units';
import { formatClock } from '../../lib/dates';
import { beep, requestWakeLock } from '../workouts/restTimer';
import { DEFAULT_MEALS, mealLabel } from '../../domain/nutrition/diary';

interface StepTimer {
  stepId: string;
  endsAt: number;
  label: string;
}

export function CookingModePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const recipe = useLiveQuery(() => db.recipes.get(id!), [id]);
  const version = useLiveQuery(() => (recipe ? db.recipeVersions.get(params.get('version') ?? recipe.currentVersionId) : undefined), [recipe, params]);
  const profiles = useLiveQuery(() => db.applianceProfiles.toArray(), []);
  const lookup = useNutritionLookup();
  const navigate = useNavigate();
  const toast = useToast();
  const [stage, setStage] = useState<'ingredients' | number>('ingredients');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [timers, setTimers] = useState<StepTimer[]>([]);
  const [session, setSession] = useState<CookingSession | null>(null);
  const [finishing, setFinishing] = useState(false);
  const now = useNow(500, timers.length > 0);
  const servings = Number(params.get('servings')) || version?.servings || 4;
  const scaled = useMemo(() => (version ? scaleVersion(version, servings) : null), [version, servings]);
  const safety = useMemo(() => (version && lookup && profiles ? checkRecipeSafety(version, lookup.ingredients, new Map(profiles.map((p) => [p.id, p]))) : []), [version, lookup, profiles]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    void requestWakeLock().then((l) => (lock = l));
    return () => void lock?.release();
  }, []);
  useEffect(() => {
    const due = timers.filter((t) => t.endsAt <= now);
    if (due.length) {
      beep();
      if ('vibrate' in navigator) navigator.vibrate?.([300, 100, 300]);
      due.forEach((t) => toast(`Timer done: ${t.label}`));
      setTimers((ts) => ts.filter((t) => t.endsAt > now));
    }
  }, [now, timers, toast]);

  if (!recipe || !version || !scaled || !lookup) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const blocked = safety.filter((f) => f.level === 'block');
  const begin = async () => {
    if (!session) setSession(await startCooking(recipe.id, version.id, servings));
    setStage(0);
  };
  const step = typeof stage === 'number' ? version.steps[stage] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(`/recipes/${recipe.id}`)} aria-label="Exit cooking mode">
          <X className="h-5 w-5" /> Exit
        </Button>
        <div className="text-right">
          <div className="font-semibold">{recipe.name}</div>
          <div className="text-xs text-slate-500">
            {servings} servings · v{version.versionNumber}
          </div>
        </div>
      </div>

      {blocked.map((b) => (
        <div key={b.code} className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5" /> Safety block
          </div>
          <p className="mt-1">{b.message}</p>
        </div>
      ))}

      {timers.length > 0 && (
        <div className="sticky top-2 z-20 space-y-1">
          {timers.map((t) => (
            <div key={t.stepId} className="flex items-center justify-between rounded-xl bg-fuel-500 px-4 py-2 text-white shadow">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Timer className="h-4 w-4" /> {t.label}
              </span>
              <span className="text-2xl font-bold tabular-nums">{formatClock((t.endsAt - now) / 1000)}</span>
              <button aria-label="Cancel timer" onClick={() => setTimers((ts) => ts.filter((x) => x.stepId !== t.stepId))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {stage === 'ingredients' ? (
        <Card>
          <h2 className="mb-3 text-xl font-bold">Get ingredients ready</h2>
          <ul className="space-y-3">
            {scaled.ingredients.map((ri) => (
              <li key={ri.id}>
                <Checkbox
                  checked={checked.has(ri.id)}
                  onChange={(on) => setChecked((s) => { const n = new Set(s); if (on) n.add(ri.id); else n.delete(ri.id); return n; })}
                  label={
                    <span className={`text-lg ${checked.has(ri.id) ? 'text-slate-400 line-through' : ''}`}>
                      <span className="font-semibold tabular-nums">{formatQuantity(ri.quantity, ri.unit)}</span> {ri.quantity === 0 && ri.preparation ? ri.preparation : lookup.ingredients.get(ri.ingredientId)?.name}
                      {ri.preparation && ri.quantity !== 0 && <span className="text-slate-500">, {ri.preparation}</span>}
                      {ri.optional && <Badge className="ml-1">optional</Badge>}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-1">
            {version.appliances.map((a) => (
              <Badge key={a} tone="teal">{APPLIANCE_LABEL[a]}</Badge>
            ))}
          </div>
          <Button size="lg" className="mt-4 w-full" onClick={() => void begin()} disabled={blocked.length > 0}>
            Start cooking <ArrowRight className="h-5 w-5" />
          </Button>
        </Card>
      ) : step ? (
        <Card className="min-h-[50vh]">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
            <span>
              Step {(stage as number) + 1} of {version.steps.length}
            </span>
            {step.appliance && <Badge tone="teal">{APPLIANCE_LABEL[step.appliance]}</Badge>}
          </div>
          <p className="text-2xl leading-relaxed">{step.text}</p>
          {step.safetyNote && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950 dark:text-red-100">
              <Thermometer className="mt-0.5 h-5 w-5 shrink-0" /> <span className="font-medium">{step.safetyNote}</span>
            </div>
          )}
          {step.timerMinutes && !timers.some((t) => t.stepId === step.id) && (
            <Button variant="secondary" size="lg" className="mt-4" onClick={() => setTimers((ts) => [...ts, { stepId: step.id, endsAt: Date.now() + step.timerMinutes! * 60_000, label: `Step ${(stage as number) + 1}` }])}>
              <Timer className="h-5 w-5" /> Start {step.timerMinutes} min timer
            </Button>
          )}
        </Card>
      ) : null}

      {typeof stage === 'number' && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => setStage(stage === 0 ? 'ingredients' : stage - 1)}>
            <ArrowLeft className="h-5 w-5" /> Back
          </Button>
          {stage < version.steps.length - 1 ? (
            <Button size="lg" onClick={() => setStage(stage + 1)}>
              Next <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button size="lg" onClick={() => setFinishing(true)}>
              <Check className="h-5 w-5" /> Finish
            </Button>
          )}
        </div>
      )}

      {safety.filter((f) => f.level !== 'block').length > 0 && (
        <Card>
          <h3 className="mb-1 text-sm font-semibold">Checks</h3>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {safety.filter((f) => f.level !== 'block').map((f) => (
              <li key={f.code}>
                • {f.message}
                {f.source && <span className="block pl-3 text-xs text-slate-400">{f.source}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {session && <FinishSheet open={finishing} onClose={() => setFinishing(false)} session={session} recipeId={recipe.id} versionId={version.id} servings={servings} onDone={() => navigate(`/recipes/${recipe.id}`)} />}
    </div>
  );
}

function FinishSheet({ open, onClose, session, recipeId, versionId, servings, onDone }: { open: boolean; onClose: () => void; session: CookingSession; recipeId: string; versionId: string; servings: number; onDone: () => void }) {
  const today = useToday();
  const toast = useToast();
  const elapsed = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000);
  const [minutes, setMinutes] = useState<number | null>(elapsed);
  const [rating, setRating] = useState(4);
  const [issues, setIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState<'yes' | 'no' | 'with-changes'>('yes');
  const [logServings, setLogServings] = useState<number | null>(1);
  const [meal, setMeal] = useState('dinner');
  const [doLog, setDoLog] = useState(true);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How did it go?"
      footer={
        <Button
          className="w-full"
          size="lg"
          onClick={async () => {
            await finishCooking(session.id, { actualMinutes: minutes ?? elapsed });
            await addFeedback({ recipeId, recipeVersionId: versionId, cookingSessionId: session.id, rating, issues: issues as never, taste: '', texture: '', notes, repeat });
            if (doLog && logServings) await logRecipe({ recipeId, versionId, date: today, meal, servings: logServings });
            toast(doLog ? `Saved and logged ${logServings} serving(s)` : 'Cooking saved');
            onDone();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Actual time (min)">{(fid) => <NumberInput id={fid} value={minutes} onChange={setMinutes} min={0} />}</Field>
        <div>
          <div className="mb-1 text-sm font-medium">Rating</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className={`h-11 w-11 rounded-lg border text-lg ${n <= rating ? 'border-amber-400 bg-amber-50 text-amber-500 dark:bg-amber-950' : 'border-slate-200 text-slate-300 dark:border-slate-700'}`} aria-label={`${n} stars`}>
                ★
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Anything to adjust?</div>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_ISSUES.map((i) => (
              <button key={i} onClick={() => setIssues((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} className={`rounded-full border px-3 py-1 text-sm ${issues.includes(i) ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-300 dark:border-slate-700'}`} aria-pressed={issues.includes(i)}>
                {i.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
        <Field label="Make again?">
          {(fid) => (
            <Select id={fid} value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
              <option value="yes">Yes</option>
              <option value="with-changes">Yes, with changes</option>
              <option value="no">No</option>
            </Select>
          )}
        </Field>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Taste, texture, notes" aria-label="Notes" />
        <Card className="space-y-2 bg-slate-50 dark:bg-slate-800/50">
          <Checkbox checked={doLog} onChange={setDoLog} label="Log what I ate to the food diary" />
          {doLog && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={logServings} onChange={setLogServings} step={0.25} min={0} aria-label="Servings eaten" />
              <Select value={meal} onChange={(e) => setMeal(e.target.value)} aria-label="Meal">
                {DEFAULT_MEALS.map((m) => (
                  <option key={m} value={m}>
                    {mealLabel(m)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <p className="text-xs text-slate-500">Made {servings} servings — remaining servings can be logged later from the recipe.</p>
        </Card>
      </div>
    </Sheet>
  );
}
