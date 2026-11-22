import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, FlaskConical, GitBranch, Lightbulb, Star, ArrowUpCircle } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Field, Input, NumberInput, PageHeader, Select, Sheet, Notice, EmptyState } from '../../components/ui';
import { MacroLine, ValidationBadge } from '../../components/nutrition';
import { useToast } from '../../components/toast';
import { CookNav } from '../recipes/RecipesPage';
import { useNutritionLookup, usePrefs } from '../../hooks/data';
import { branchesOf, contentOf, diffVersions, type VersionContent } from '../../domain/recipes/versions';
import { applyRoleFactor, averageRating, suggestModification } from '../../domain/recipes/lab';
import { checkMethodTransformation, validateSubstitution } from '../../domain/recipes/safety';
import { calculateRecipeNutrition } from '../../domain/recipes/nutrition';
import { APPLIANCE_LABEL, APPLIANCES, INGREDIENT_ROLES, type ApplianceId, type IngredientRole, type RecipeVersion } from '../../domain/recipes/types';
import { createBranch, promoteVersion } from '../../db/recipeService';
import { formatDateKey, isoToDateKey } from '../../lib/dates';

export function LabIndexPage() {
  const recipes = useLiveQuery(() => db.recipes.filter((r) => !r.archived).sortBy('name'), []);
  const versions = useLiveQuery(() => db.recipeVersions.toArray(), []);
  const feedback = useLiveQuery(() => db.recipeFeedback.toArray(), []);
  return (
    <div className="space-y-4">
      <CookNav />
      <PageHeader title="Recipe Lab" subtitle="Controlled cooking experiments — originals are never overwritten." />
      <div className="grid gap-3 sm:grid-cols-2">
        {(recipes ?? []).map((r) => {
          const vs = (versions ?? []).filter((v) => v.recipeId === r.id);
          const branches = branchesOf(vs).length - 1;
          const fb = (feedback ?? []).filter((f) => f.recipeId === r.id);
          return (
            <Link key={r.id} to={`/lab/${r.id}`}>
              <Card className="h-full hover:shadow-md">
                <div className="font-semibold">{r.name}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  <Badge>{vs.length} version{vs.length === 1 ? '' : 's'}</Badge>
                  {branches > 0 && <Badge tone="indigo">{branches} experiment{branches === 1 ? '' : 's'}</Badge>}
                  {fb.length > 0 && <Badge tone="amber">{fb.length} feedback</Badge>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function LabRecipePage() {
  const { id } = useParams();
  const recipe = useLiveQuery(() => db.recipes.get(id!), [id]);
  const versions = useLiveQuery(() => db.recipeVersions.where('recipeId').equals(id!).sortBy('versionNumber'), [id]);
  const feedback = useLiveQuery(() => db.recipeFeedback.where('recipeId').equals(id!).toArray(), [id]);
  const cooks = useLiveQuery(() => db.cookingSessions.where('recipeId').equals(id!).toArray(), [id]);
  const lookup = useNutritionLookup();
  const [compare, setCompare] = useState<[string, string] | null>(null);
  const [experiment, setExperiment] = useState<{ base: RecipeVersion; preset?: Partial<VersionContent>; name?: string; reason?: string } | null>(null);
  const toast = useToast();
  const current = versions?.find((v) => v.id === recipe?.currentVersionId);
  const suggestion = useMemo(() => (current && feedback ? suggestModification(feedback, current) : null), [current, feedback]);
  if (!recipe || !versions || !lookup || !current) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  const branches = branchesOf(versions);
  const ingName = (i: string) => lookup.ingredients.get(i)?.name ?? i;
  const a = compare ? versions.find((v) => v.id === compare[0]) : null;
  const b = compare ? versions.find((v) => v.id === compare[1]) : null;

  return (
    <div className="space-y-4">
      <PageHeader title={recipe.name} subtitle="Recipe Lab" back={<Link to="/lab" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Lab</Link>} actions={<Button onClick={() => setExperiment({ base: current })}><FlaskConical className="h-4 w-4" /> New experiment</Button>} />

      {suggestion ? (
        <Card className="border-amber-300">
          <CardTitle>
            <span className="flex items-center gap-1">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Suggested modification
            </span>
          </CardTitle>
          <p className="text-sm">{suggestion.suggestion}</p>
          <p className="mt-1 text-xs text-slate-500">
            Because “{suggestion.issue.replace('-', ' ')}” was reported in {suggestion.occurrences} of the last {suggestion.sampleSize} feedback entr{suggestion.sampleSize === 1 ? 'y' : 'ies'}. This is a heuristic, not a tested recipe.
          </p>
          {suggestion.role && suggestion.factor && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setExperiment({ base: current, preset: applyRoleFactor(contentOf(current), suggestion.role!, suggestion.factor!), name: suggestion.issue === 'too-mild' ? 'more-spice' : suggestion.issue, reason: `Feedback: ${suggestion.issue}` })}>
              Create experiment from suggestion
            </Button>
          )}
        </Card>
      ) : (
        <Notice className="text-xs">Cook a version and leave feedback (from Cooking mode) to get a data-driven suggestion.</Notice>
      )}

      {branches.map(({ branch, head }) => {
        const line = versions.filter((v) => v.branch === branch);
        return (
          <Card key={branch}>
            <CardTitle action={branch !== 'main' && <Button size="sm" variant="outline" onClick={async () => { await promoteVersion(recipe.id, head.id); toast(`"${branch}" adopted as the new main version`); }}><ArrowUpCircle className="h-4 w-4" /> Adopt as main</Button>}>
              <span className="flex items-center gap-1">
                <GitBranch className="h-4 w-4" /> {branch === 'main' ? 'Main recipe' : branch}
              </span>
            </CardTitle>
            <ul className="space-y-2">
              {line.map((v) => {
                const fb = (feedback ?? []).filter((f) => f.recipeVersionId === v.id);
                const r = averageRating(fb);
                const cooked = (cooks ?? []).filter((c) => c.recipeVersionId === v.id);
                const n = calculateRecipeNutrition(v, lookup);
                return (
                  <li key={v.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">v{v.versionNumber}</span>
                        {v.id === recipe.currentVersionId && <Badge tone="green">current</Badge>}
                        <ValidationBadge status={v.validation} />
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setCompare([current.id, v.id])} disabled={v.id === current.id}>
                          Compare
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setExperiment({ base: v })}>
                          Branch
                        </Button>
                        <Link to={`/recipes/${recipe.id}/cook?version=${v.id}`}>
                          <Button size="sm" variant="ghost">Cook</Button>
                        </Link>
                      </div>
                    </div>
                    <div className="mt-1 text-sm">{v.changeSummary || '—'}</div>
                    {v.changeReason && <div className="text-xs text-slate-500">Why: {v.changeReason}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{formatDateKey(isoToDateKey(v.createdAt))}</span>
                      <span>{cooked.length ? `cooked ${cooked.length}×` : 'not cooked yet'}</span>
                      {cooked.some((c) => c.actualMinutes) && <span>actual ~{Math.round(cooked.reduce((s, c) => s + (c.actualMinutes ?? 0), 0) / cooked.filter((c) => c.actualMinutes).length)} min</span>}
                      {r && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {r.mean.toFixed(1)} ({r.n})
                        </span>
                      )}
                      {fb.some((f) => f.repeat !== 'yes') && <span>repeat: {fb.map((f) => f.repeat).join(', ')}</span>}
                    </div>
                    <div className="mt-1">
                      <MacroLine n={n.perServing} incomplete={!n.complete} />
                    </div>
                    {fb.filter((f) => f.notes || f.issues.length).slice(-2).map((f) => (
                      <p key={f.id} className="mt-1 text-xs italic text-slate-500">
                        “{[f.issues.join(', '), f.notes].filter(Boolean).join(' — ')}”
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <Sheet open={!!compare} onClose={() => setCompare(null)} title="Compare versions">
        {a && b && <CompareView a={a} b={b} ingName={ingName} />}
      </Sheet>
      {experiment && <ExperimentSheet recipeId={recipe.id} base={experiment.base} preset={experiment.preset} defaultName={experiment.name} defaultReason={experiment.reason} onClose={() => setExperiment(null)} />}
    </div>
  );
}

function CompareView({ a, b, ingName }: { a: RecipeVersion; b: RecipeVersion; ingName: (id: string) => string }) {
  const lookup = useNutritionLookup();
  const feedback = useLiveQuery(() => db.recipeFeedback.where('recipeVersionId').anyOf([a.id, b.id]).toArray(), [a.id, b.id]);
  if (!lookup) return null;
  const na = calculateRecipeNutrition(a, lookup).perServing;
  const nb = calculateRecipeNutrition(b, lookup).perServing;
  const ra = averageRating((feedback ?? []).filter((f) => f.recipeVersionId === a.id));
  const rb = averageRating((feedback ?? []).filter((f) => f.recipeVersionId === b.id));
  const diffs = diffVersions(a, b, ingName);
  const row = (label: string, x: number | null, y: number | null, unit = '') => (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-1">{label}</td>
      <td className="text-right tabular-nums">{x == null ? '?' : `${Math.round(x)}${unit}`}</td>
      <td className="text-right tabular-nums">{y == null ? '?' : `${Math.round(y)}${unit}`}</td>
    </tr>
  );
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Changes v{a.versionNumber} → v{b.versionNumber}</h3>
      {diffs.length ? (
        <ul className="list-disc pl-5 text-sm">
          {diffs.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No content differences.</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="text-left">Per serving</th>
            <th className="text-right">v{a.versionNumber}</th>
            <th className="text-right">v{b.versionNumber}</th>
          </tr>
        </thead>
        <tbody>
          {row('Energy (kcal)', na.energyKcal, nb.energyKcal)}
          {row('Protein', na.proteinG, nb.proteinG, ' g')}
          {row('Sat fat', na.satFatG, nb.satFatG, ' g')}
          {row('Sodium', na.sodiumMg, nb.sodiumMg, ' mg')}
          {row('Rating', ra?.mean ?? null, rb?.mean ?? null)}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">Ratings are based on {ra?.n ?? 0} and {rb?.n ?? 0} cook(s) — small samples, so treat differences cautiously.</p>
    </div>
  );
}

function ExperimentSheet({ recipeId, base, preset, defaultName, defaultReason, onClose }: { recipeId: string; base: RecipeVersion; preset?: Partial<VersionContent>; defaultName?: string; defaultReason?: string; onClose: () => void }) {
  const lookup = useNutritionLookup();
  const prefs = usePrefs();
  const rules = useLiveQuery(() => db.substitutionRules.toArray(), []);
  const transforms = useLiveQuery(() => db.methodTransformations.toArray(), []);
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []);
  const [content, setContent] = useState<VersionContent>({ ...contentOf(base), ...preset, changeSummary: '', changeReason: defaultReason ?? '' });
  const [name, setName] = useState(defaultName ?? '');
  const [subFrom, setSubFrom] = useState('');
  const [subTo, setSubTo] = useState('');
  const [role, setRole] = useState<IngredientRole>('spice');
  const [factor, setFactor] = useState<number | null>(125);
  const [method, setMethod] = useState<ApplianceId | ''>('');
  const [messages, setMessages] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string }[]>([]);
  const toast = useToast();
  if (!lookup || !ingredients || !rules || !transforms || !prefs) return null;
  const ingName = (i: string) => lookup.ingredients.get(i)?.name ?? i;
  const diffs = diffVersions(base, content, ingName);
  const n = calculateRecipeNutrition(content, lookup);
  const primary = base.appliances.find((a) => a !== 'rice-cooker') ?? base.appliances[0];

  const doSub = () => {
    const check = validateSubstitution(subFrom, subTo, rules, lookup.ingredients, prefs.excludedTags);
    if (!check.allowed) return setMessages([{ tone: 'danger', text: `Blocked: ${check.reasons.join(' ')}` }]);
    setContent({ ...content, ingredients: content.ingredients.map((ri) => (ri.ingredientId === subFrom ? { ...ri, ingredientId: subTo, quantity: Math.round(ri.quantity * check.ratio * 100) / 100 } : ri)) });
    setMessages([{ tone: check.status === 'experimental' ? 'warn' : 'info', text: `Substitution status: ${check.status}. ${check.reasons.join(' ')}` }]);
  };
  const doMethod = () => {
    if (!method || !primary) return;
    const check = checkMethodTransformation(primary, method, transforms);
    if (!check.allowed) return setMessages([{ tone: 'danger', text: check.guidance }]);
    setContent({ ...content, appliances: [...new Set([...content.appliances.filter((a) => a !== primary), method])], steps: content.steps.map((s) => (s.appliance === primary ? { ...s, appliance: method, timerMinutes: null, text: `[REWRITE FOR ${APPLIANCE_LABEL[method].toUpperCase()}] ${s.text}` } : s)), validation: 'experimental' });
    setMessages([{ tone: 'warn', text: `${check.guidance} Timers for converted steps were cleared — enter times from a tested source. ${check.source ? `Source: ${check.source}` : ''}` }]);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Experiment from v${base.versionNumber}`}
      footer={
        <Button
          className="w-full"
          disabled={!name.trim() || name.trim() === 'main' || !diffs.length}
          onClick={async () => {
            try {
              await createBranch(recipeId, base.id, name.trim(), { ...content, changeSummary: diffs.join('; ') });
              toast(`Experiment "${name.trim()}" created`);
              onClose();
            } catch (e) {
              setMessages([{ tone: 'danger', text: (e as Error).message }]);
            }
          }}
        >
          Create experiment
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Experiment name">{(fid) => <Input id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. extra-ginger" />}</Field>
          <Field label="Servings">{(fid) => <NumberInput id={fid} value={content.servings} onChange={(v) => setContent({ ...content, servings: v ?? content.servings })} min={1} />}</Field>
        </div>
        <Field label="Reason for change">{(fid) => <Input id={fid} value={content.changeReason} onChange={(e) => setContent({ ...content, changeReason: e.target.value })} placeholder="What are you testing?" />}</Field>

        <Card className="space-y-2 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-sm font-semibold">Ingredient quantities</div>
          {content.ingredients.map((ri, i) => (
            <div key={ri.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{ingName(ri.ingredientId)}</span>
              <NumberInput value={ri.quantity} onChange={(v) => setContent({ ...content, ingredients: content.ingredients.map((x, j) => (j === i ? { ...x, quantity: v ?? 0 } : x)) })} step={0.25} className="h-8 w-20" aria-label={`${ingName(ri.ingredientId)} quantity`} />
              <span className="w-10 text-xs text-slate-500">{ri.unit}</span>
              <input type="checkbox" checked={ri.optional} onChange={(e) => setContent({ ...content, ingredients: content.ingredients.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) })} aria-label="Optional" title="Optional" />
            </div>
          ))}
        </Card>

        <Card className="space-y-2 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-sm font-semibold">Scale a component (aromatics, spice, sauce…)</div>
          <div className="flex gap-2">
            <Select value={role} onChange={(e) => setRole(e.target.value as IngredientRole)} aria-label="Role">
              {INGREDIENT_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <NumberInput value={factor} onChange={setFactor} step={5} min={0} className="w-24" aria-label="Percent" />
            <span className="self-center text-sm">%</span>
            <Button variant="outline" onClick={() => factor && setContent(applyRoleFactor(content, role, factor / 100))}>
              Apply
            </Button>
          </div>
        </Card>

        <Card className="space-y-2 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-sm font-semibold">Swap an ingredient (e.g. protein source)</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={subFrom} onChange={(e) => setSubFrom(e.target.value)} aria-label="Replace">
              <option value="">Replace…</option>
              {content.ingredients.map((ri) => (
                <option key={ri.id} value={ri.ingredientId}>
                  {ingName(ri.ingredientId)}
                </option>
              ))}
            </Select>
            <Select value={subTo} onChange={(e) => setSubTo(e.target.value)} aria-label="With">
              <option value="">With…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" disabled={!subFrom || !subTo} onClick={doSub}>
            Check & apply swap
          </Button>
        </Card>

        <Card className="space-y-2 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-sm font-semibold">Change cooking method</div>
          <div className="flex gap-2">
            <Select value={method} onChange={(e) => setMethod(e.target.value as ApplianceId)} aria-label="New method">
              <option value="">From {primary ? APPLIANCE_LABEL[primary] : '—'} to…</option>
              {APPLIANCES.filter((a) => a !== primary).map((a) => (
                <option key={a} value={a}>
                  {APPLIANCE_LABEL[a]}
                </option>
              ))}
            </Select>
            <Button variant="outline" disabled={!method} onClick={doMethod}>
              Check
            </Button>
          </div>
          <p className="text-xs text-slate-500">Methods aren't interchangeable. Unsupported conversions are rejected; supported ones still require you to rewrite and test the steps.</p>
        </Card>

        {messages.map((m, i) => (
          <Notice key={i} tone={m.tone}>
            {m.text}
          </Notice>
        ))}
        <Card>
          <div className="mb-1 text-sm font-semibold">Changes ({diffs.length})</div>
          {diffs.length ? (
            <ul className="list-disc pl-5 text-sm">
              {diffs.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No changes yet.</p>
          )}
          <div className="mt-2">
            <MacroLine n={n.perServing} incomplete={!n.complete} />
          </div>
        </Card>
      </div>
    </Sheet>
  );
}

export function LabEmpty() {
  return <EmptyState title="Choose a recipe" />;
}
