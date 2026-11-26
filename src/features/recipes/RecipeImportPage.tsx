import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BookOpen, CheckCircle2, CloudDownload, GitBranch, Upload } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Checkbox, Field, Input, Notice, PageHeader } from '../../components/ui';
import { useToast } from '../../components/toast';
import { fetchRecipeBook, importRecipeBook, importedRecipeIds, RECIPE_BOOK_URL_KEY, setImportedValidation, type ImportAction, type ImportReport } from '../../db/recipeBookService';
import { CHAPTER_CATEGORY, DEFAULT_RECIPE_BOOK_URL, parseRecipeBook, RECIPE_BOOK_REPO_URL } from '../../domain/recipes/recipeBook';
import { formatDateKey, isoToDateKey } from '../../lib/dates';
import { useOnline } from '../../hooks/data';

const ACTION_LABEL: Record<ImportAction, string> = {
  create: 'New',
  update: 'Updated',
  'update-branch': 'Update kept separate (you edited it)',
  unchanged: 'Unchanged',
  'skipped-deleted': 'Skipped (you deleted it)',
  'meta-only': 'Details updated'
};
const ACTION_TONE: Record<ImportAction, 'green' | 'blue' | 'amber' | 'slate' | 'indigo'> = { create: 'green', update: 'blue', 'update-branch': 'amber', unchanged: 'slate', 'skipped-deleted': 'slate', 'meta-only': 'indigo' };

export function RecipeImportPage() {
  const storedUrl = useLiveQuery(() => db.meta.get(RECIPE_BOOK_URL_KEY).then((r) => r ?? null), []);
  const lastImport = useLiveQuery(() => db.importRecords.orderBy('at').reverse().filter((r) => r.kind === 'recipe-book').first().then((r) => r ?? null), []);
  const online = useOnline();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [chapters, setChapters] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (storedUrl !== undefined && !url) setUrl((storedUrl?.value as string | undefined) ?? DEFAULT_RECIPE_BOOK_URL);
  }, [storedUrl, url]);

  const available = useMemo(() => {
    if (!raw) return [];
    const { recipes } = parseRecipeBook(raw);
    const m = new Map<string, { chapter: string; name: string; count: number }>();
    for (const r of recipes) {
      const cur = m.get(r.chapter) ?? { chapter: r.chapter, name: r.chapterName || r.chapter, count: 0 };
      cur.count++;
      m.set(r.chapter, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [raw]);

  const runPreview = async (data: unknown, selected: Set<string>) => {
    setError(null);
    setResult(null);
    const r = await importRecipeBook(data, { dryRun: true, chapters: [...selected] });
    setPreview(r);
  };

  const load = async (data: unknown, label: string) => {
    const { recipes, errors } = parseRecipeBook(data);
    if (!recipes.length) throw new Error(errors[0] ?? 'No recipes found in that file.');
    const all = new Set(recipes.map((r) => r.chapter));
    setRaw(data);
    setSourceLabel(label);
    setChapters(all);
    await runPreview(data, all);
  };

  const fetchFromUrl = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchRecipeBook(url.trim());
      await db.meta.put({ key: RECIPE_BOOK_URL_KEY, value: url.trim() });
      await load(data, url.trim());
    } catch (e) {
      setError(online ? (e as Error).message : 'You are offline. Connect to the internet to download the recipe book, or upload a recipes.json file.');
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file: File) => {
    setBusy(true);
    try {
      await load(JSON.parse(await file.text()), file.name);
    } catch (e) {
      setError(e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await importRecipeBook(raw, { dryRun: false, chapters: [...chapters], source: sourceLabel });
      setResult(r);
      setPreview(null);
      toast(`Imported: ${r.counts.create} new, ${r.counts.update + r.counts['update-branch']} updated`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleChapter = (c: string, on: boolean) => {
    const next = new Set(chapters);
    if (on) next.add(c);
    else next.delete(c);
    setChapters(next);
    void runPreview(raw, next);
  };

  const report = result ?? preview;
  const changing = report ? report.items.filter((i) => i.action !== 'unchanged' && i.action !== 'skipped-deleted') : [];
  const willWrite = preview ? preview.counts.create + preview.counts.update + preview.counts['update-branch'] + preview.counts['meta-only'] : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import from recipe book"
        subtitle={
          <a href={RECIPE_BOOK_REPO_URL} target="_blank" rel="noreferrer" className="underline">
            geosaurus98/recipe-book
          </a>
        }
        back={
          <Link to="/recipes" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500">
            <ArrowLeft className="h-4 w-4" /> Recipes
          </Link>
        }
      />

      <Card className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your recipe book stays the place you write recipes. Importing brings them into FormLab as versioned recipes you can plan, cook, experiment with and log. Run it again any time to pick up changes — recipes you've edited here are never overwritten.
        </p>
        <Field label="Recipe book data (planner/recipes.json)">{(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />}</Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void fetchFromUrl()} disabled={busy || !url.trim()}>
            <CloudDownload className="h-4 w-4" /> {busy ? 'Working…' : 'Check for recipes'}
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium dark:border-slate-700">
            <Upload className="h-4 w-4" /> Upload recipes.json
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void fromFile(e.target.files[0])} />
          </label>
          {url !== DEFAULT_RECIPE_BOOK_URL && (
            <Button variant="ghost" size="sm" onClick={() => setUrl(DEFAULT_RECIPE_BOOK_URL)}>
              Reset address
            </Button>
          )}
        </div>
        {lastImport && <p className="text-xs text-slate-500">Last import: {formatDateKey(isoToDateKey(lastImport.at), { day: 'numeric', month: 'short', year: 'numeric' })} — {lastImport.counts.create ?? 0} new, {(lastImport.counts.update ?? 0) + (lastImport.counts['update-branch'] ?? 0)} updated.</p>}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      {available.length > 0 && !result && (
        <Card className="space-y-2">
          <CardTitle>Chapters</CardTitle>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {available.map((c) => (
              <Checkbox key={c.chapter} checked={chapters.has(c.chapter)} onChange={(on) => toggleChapter(c.chapter, on)} label={`${c.name} (${c.count})${CHAPTER_CATEGORY[c.chapter] && CHAPTER_CATEGORY[c.chapter] !== 'Main' ? ` · ${CHAPTER_CATEGORY[c.chapter]}` : ''}`} />
            ))}
          </div>
          <p className="text-xs text-slate-500">Only main-meal chapters are used for dinner suggestions; the rest are still available to log and cook.</p>
        </Card>
      )}

      {report && (
        <Card className="space-y-3">
          <CardTitle>{result ? 'Imported' : 'Preview'}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(report.counts) as ImportAction[])
              .filter((a) => report.counts[a] > 0)
              .map((a) => (
                <Badge key={a} tone={ACTION_TONE[a]}>
                  {ACTION_LABEL[a]}: {report.counts[a]}
                </Badge>
              ))}
            {report.newIngredients > 0 && <Badge tone="teal">New ingredients: {report.newIngredients}</Badge>}
          </div>
          {report.errors.length > 0 && <Notice tone="warn">{report.errors.length} recipe(s) couldn't be read: {report.errors.slice(0, 3).join('; ')}</Notice>}

          {!result && (
            <Notice className="text-xs">
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Quantities, units and cooking times are kept exactly as written in your book.</li>
                <li>Imported recipes are marked <strong>Experimental / untested</strong> until you mark them otherwise.</li>
                <li>Nutrition is calculated from FormLab's food data where available. When that's incomplete, the book's own per-serving estimate is used for logging, labelled as an estimate.</li>
                <li>Seafood and brown/green-lentil recipes are imported but stay out of suggestions while those exclusions are on in Settings.</li>
              </ul>
            </Notice>
          )}

          {changing.length > 0 && (
            <div>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {(showAll ? changing : changing.slice(0, 12)).map((i) => (
                  <li key={i.recipeId} className="py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      {result ? (
                        <Link to={`/recipes/${i.recipeId}`} className="truncate hover:underline">
                          {i.name}
                        </Link>
                      ) : (
                        <span className="truncate">{i.name}</span>
                      )}
                      <Badge tone={ACTION_TONE[i.action]}>{i.action === 'update-branch' ? <><GitBranch className="h-3 w-3" /> separate</> : ACTION_LABEL[i.action]}</Badge>
                    </div>
                    {i.changes.length > 0 && <div className="text-xs text-slate-500">{i.changes.slice(0, 4).join(' · ')}{i.changes.length > 4 ? ` · +${i.changes.length - 4} more` : ''}</div>}
                  </li>
                ))}
              </ul>
              {changing.length > 12 && (
                <button className="mt-1 text-xs font-medium text-brand-700" onClick={() => setShowAll((x) => !x)}>
                  {showAll ? 'Show fewer' : `Show all ${changing.length}`}
                </button>
              )}
            </div>
          )}

          {!result && (
            <Button size="lg" className="w-full" disabled={busy || willWrite === 0} onClick={() => void apply()}>
              <BookOpen className="h-5 w-5" /> {willWrite === 0 ? 'Everything is up to date' : `Import ${willWrite} recipe${willWrite === 1 ? '' : 's'}`}
            </Button>
          )}
          {result && <AfterImport />}
        </Card>
      )}
    </div>
  );
}

function AfterImport() {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-3">
      <Notice tone="success">
        <CheckCircle2 className="mr-1 inline h-4 w-4" />
        Done. Imported recipes are in your library, tagged “recipe-book”.
      </Notice>
      <div className="flex flex-wrap gap-2">
        <Link to="/recipes?source=book">
          <Button>View imported recipes</Button>
        </Link>
        <Link to="/planner">
          <Button variant="outline">Plan meals</Button>
        </Link>
      </div>
      <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
        <Checkbox checked={confirm} onChange={setConfirm} label="I've cooked these recipes and trust them as written" />
        <p className="mt-1 text-xs text-slate-500">Marks every imported recipe that's still “Experimental” as kitchen-tested. You can also do this one recipe at a time on each recipe page.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={!confirm}
          onClick={async () => {
            const n = await setImportedValidation(await importedRecipeIds(), 'kitchen-tested');
            toast(`Marked ${n} recipe(s) as kitchen-tested`);
            setConfirm(false);
          }}
        >
          Mark as kitchen-tested
        </Button>
      </div>
    </div>
  );
}
