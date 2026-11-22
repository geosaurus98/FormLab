import { newId } from '../../lib/id';
import { nowIso } from '../../lib/utils';
import type { Recipe, RecipeIngredient, RecipeVersion } from './types';

export type VersionContent = Omit<RecipeVersion, 'id' | 'recipeId' | 'versionNumber' | 'parentVersionId' | 'createdAt' | 'branch'>;

export function contentOf(v: RecipeVersion): VersionContent {
  const { id: _id, recipeId: _r, versionNumber: _n, parentVersionId: _p, createdAt: _c, branch: _b, ...content } = v;
  return content;
}

function comparable(c: VersionContent) {
  return JSON.stringify({ ...c, changeSummary: '', changeReason: '' });
}

export function contentEquals(a: VersionContent, b: VersionContent): boolean {
  return comparable(a) === comparable(b);
}

/** Creates a new immutable version derived from `parent`. Version numbers are global per recipe. */
export function createVersion(params: { recipeId: string; parent: RecipeVersion | null; content: VersionContent; existing: RecipeVersion[]; branch?: string }): RecipeVersion {
  const maxN = params.existing.filter((v) => v.recipeId === params.recipeId).reduce((m, v) => Math.max(m, v.versionNumber), 0);
  return {
    ...params.content,
    id: newId('rv'),
    recipeId: params.recipeId,
    versionNumber: maxN + 1,
    parentVersionId: params.parent?.id ?? null,
    branch: params.branch ?? params.parent?.branch ?? 'main',
    createdAt: nowIso()
  };
}

/** Human-readable differences between two versions — used for change summaries and comparisons. */
export function diffVersions(a: Pick<RecipeVersion, 'ingredients' | 'servings' | 'steps' | 'appliances' | 'cookMinutes' | 'prepMinutes'>, b: typeof a, ingredientName: (id: string) => string): string[] {
  const changes: string[] = [];
  if (a.servings !== b.servings) changes.push(`Servings ${a.servings} → ${b.servings}`);
  if (a.prepMinutes !== b.prepMinutes) changes.push(`Prep ${a.prepMinutes} → ${b.prepMinutes} min`);
  if (a.cookMinutes !== b.cookMinutes) changes.push(`Cook ${a.cookMinutes} → ${b.cookMinutes} min`);
  const key = (ri: RecipeIngredient) => ri.ingredientId;
  const am = new Map(a.ingredients.map((ri) => [key(ri), ri]));
  const bm = new Map(b.ingredients.map((ri) => [key(ri), ri]));
  for (const [k, ri] of am) {
    const other = bm.get(k);
    if (!other) changes.push(`Removed ${ingredientName(k)}`);
    else if (other.quantity !== ri.quantity || other.unit !== ri.unit) changes.push(`${ingredientName(k)}: ${ri.quantity} ${ri.unit} → ${other.quantity} ${other.unit}`);
    else if (other.optional !== ri.optional) changes.push(`${ingredientName(k)} now ${other.optional ? 'optional' : 'required'}`);
  }
  for (const [k, ri] of bm) if (!am.has(k)) changes.push(`Added ${ingredientName(k)} (${ri.quantity} ${ri.unit})`);
  const aApp = [...a.appliances].sort().join(',');
  const bApp = [...b.appliances].sort().join(',');
  if (aApp !== bApp) changes.push(`Appliances ${aApp || 'none'} → ${bApp || 'none'}`);
  if (a.steps.map((s) => s.text).join('\n') !== b.steps.map((s) => s.text).join('\n')) changes.push('Method steps changed');
  return changes;
}

export function versionLineage(versions: RecipeVersion[], versionId: string): RecipeVersion[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const out: RecipeVersion[] = [];
  let cur = byId.get(versionId);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentVersionId ? byId.get(cur.parentVersionId) : undefined;
  }
  return out;
}

export function branchesOf(versions: RecipeVersion[]): { branch: string; head: RecipeVersion; count: number }[] {
  const map = new Map<string, RecipeVersion[]>();
  for (const v of versions) (map.get(v.branch) ?? map.set(v.branch, []).get(v.branch)!).push(v);
  return [...map.entries()]
    .map(([branch, list]) => ({ branch, head: list.reduce((a, b) => (b.versionNumber > a.versionNumber ? b : a)), count: list.length }))
    .sort((a, b) => (a.branch === 'main' ? -1 : b.branch === 'main' ? 1 : a.branch.localeCompare(b.branch)));
}

export function duplicateRecipeMeta(recipe: Recipe, newName: string): Omit<Recipe, 'currentVersionId'> {
  const now = nowIso();
  return { ...recipe, id: newId('rec'), name: newName, favourite: false, archived: false, source: { kind: 'user', name: `Duplicated from ${recipe.name}` }, createdAt: now, updatedAt: now };
}
