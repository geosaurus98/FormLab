import type { FeedbackIssue, IngredientRole, RecipeFeedback, RecipeVersion } from './types';

export interface ModificationSuggestion {
  issue: FeedbackIssue;
  occurrences: number;
  sampleSize: number;
  suggestion: string;
  role: IngredientRole | null;
  /** multiplier for the quantities of ingredients with `role` */
  factor: number | null;
}

const RULES: Record<FeedbackIssue, { text: string; role: IngredientRole | null; factor: number | null }> = {
  'too-spicy': { text: 'Reduce spice/chilli ingredients by about 25%.', role: 'spice', factor: 0.75 },
  'too-mild': { text: 'Increase spice ingredients by about 25%.', role: 'spice', factor: 1.25 },
  bland: { text: 'Increase aromatics (garlic, ginger, onion) by about 25%.', role: 'aromatic', factor: 1.25 },
  'too-salty': { text: 'Reduce stock/sauce ingredients by about 20%, or use reduced-salt versions.', role: 'sauce', factor: 0.8 },
  'too-watery': { text: 'Reduce added liquid by about 15%.', role: 'liquid', factor: 0.85 },
  'too-thick': { text: 'Increase added liquid by about 15%.', role: 'liquid', factor: 1.15 },
  overcooked: { text: 'Record a shorter cooking time next attempt (check doneness earlier — keep safe internal temperatures).', role: null, factor: null },
  undercooked: { text: 'Cook longer and verify internal temperature; do not shorten safety-related steps.', role: null, factor: null },
  'too-sweet': { text: 'Reduce sweet sauce components by about 20%.', role: 'sauce', factor: 0.8 },
  'too-sour': { text: 'Reduce acidic sauce components by about 20%.', role: 'sauce', factor: 0.8 },
  dry: { text: 'Increase sauce/liquid by about 15%, or reduce cooking time.', role: 'liquid', factor: 1.15 }
};

/**
 * Suggests one modification: the most frequently reported issue across the latest feedback for this
 * version line (min 1 report; ties broken by recency). Deterministic and explainable.
 */
export function suggestModification(feedback: RecipeFeedback[], version: Pick<RecipeVersion, 'ingredients'>, recentN = 5): ModificationSuggestion | null {
  const recent = [...feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, recentN);
  const counts = new Map<FeedbackIssue, { n: number; latest: string }>();
  for (const f of recent) for (const i of f.issues) {
    const c = counts.get(i) ?? { n: 0, latest: '' };
    c.n += 1;
    if (f.createdAt > c.latest) c.latest = f.createdAt;
    counts.set(i, c);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].latest.localeCompare(a[1].latest));
  for (const [issue, c] of ranked) {
    const rule = RULES[issue];
    if (rule.role && !version.ingredients.some((ri) => ri.role === rule.role)) continue;
    return { issue, occurrences: c.n, sampleSize: recent.length, suggestion: rule.text, role: rule.role, factor: rule.factor };
  }
  return null;
}

export function applyRoleFactor<T extends Pick<RecipeVersion, 'ingredients'>>(version: T, role: IngredientRole, factor: number): T {
  return { ...version, ingredients: version.ingredients.map((ri) => (ri.role === role ? { ...ri, quantity: Math.round(ri.quantity * factor * 100) / 100 } : ri)) };
}

export function averageRating(feedback: RecipeFeedback[]): { mean: number; n: number } | null {
  if (!feedback.length) return null;
  return { mean: feedback.reduce((s, f) => s + f.rating, 0) / feedback.length, n: feedback.length };
}
