import { z } from 'zod';
import { toBase } from '../../lib/units';
import { ValidationStatusSchema, type ApplianceId, type ApplianceProfile, type Ingredient, type RecipeVersion, type ValidationStatus } from './types';

export interface SafetyFinding {
  level: 'block' | 'warn' | 'info';
  code: string;
  message: string;
  source?: string;
}

/**
 * Internal temperature checks shown in cooking mode. These are general food-safety guidance values,
 * displayed with their source; they are not recipe-specific tested times.
 */
export const TEMPERATURE_CHECKS: { tag: string; label: string; celsius: number; source: string }[] = [
  { tag: 'poultry', label: 'Poultry (whole pieces & mince)', celsius: 75, source: 'NZ Ministry for Primary Industries — cook chicken until juices run clear / 75 °C' },
  { tag: 'mince', label: 'Minced red meat', celsius: 71, source: 'USDA FSIS safe minimum internal temperature (160 °F)' },
  { tag: 'pork', label: 'Pork (whole cuts, then rest 3 min)', celsius: 63, source: 'USDA FSIS safe minimum internal temperature (145 °F)' },
  { tag: 'leftovers', label: 'Reheated leftovers', celsius: 74, source: 'USDA FSIS — reheat leftovers to 165 °F' }
];

const totalLiquidMl = (v: Pick<RecipeVersion, 'ingredients'>, ings: Map<string, Ingredient>) => {
  let ml = 0;
  for (const ri of v.ingredients) {
    const ing = ings.get(ri.ingredientId);
    if (!ing?.tags.includes('liquid')) continue;
    const b = toBase(ri.quantity, ri.unit);
    if (b.unit === 'ml') ml += b.quantity;
    else if (b.unit === 'g') ml += b.quantity / (ing.densityGPerMl ?? 1);
    else if (ri.unit === 'can' && ing.unitWeightsG.can) ml += ing.unitWeightsG.can / (ing.densityGPerMl ?? 1);
  }
  return ml;
};

const approxVolumeLitres = (v: Pick<RecipeVersion, 'ingredients'>, ings: Map<string, Ingredient>) => {
  let litres = 0;
  for (const ri of v.ingredients) {
    const ing = ings.get(ri.ingredientId);
    const b = toBase(ri.quantity, ri.unit);
    if (b.unit === 'ml') litres += b.quantity / 1000;
    else if (b.unit === 'g') litres += b.quantity / 1000 / (ing?.densityGPerMl ?? 1);
    else {
      const w = ing?.unitWeightsG[ri.unit as keyof typeof ing.unitWeightsG];
      if (w) litres += (w * ri.quantity) / 1000;
    }
  }
  return litres;
};

/** Checks a recipe version against appliance constraints and ingredient hazards. */
export function checkRecipeSafety(version: Pick<RecipeVersion, 'ingredients' | 'appliances' | 'steps'>, ings: Map<string, Ingredient>, profiles: Map<ApplianceId, ApplianceProfile>): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const tags = new Set(version.ingredients.flatMap((ri) => ings.get(ri.ingredientId)?.tags ?? []));

  if (version.appliances.includes('slow-cooker') && tags.has('dried-kidney-bean')) {
    out.push({ level: 'block', code: 'kidney-bean-slow-cooker', message: 'Dried red kidney beans must be soaked and boiled hard before slow cooking; slow-cooker temperatures may not destroy phytohaemagglutinin.', source: 'NZ Food Safety / UK FSA guidance on raw kidney beans' });
  }
  if (version.appliances.includes('slow-cooker') && tags.has('frozen-meat')) {
    out.push({ level: 'block', code: 'frozen-meat-slow-cooker', message: 'Thaw meat before slow cooking; frozen meat may stay in the temperature danger zone too long.', source: 'USDA FSIS slow cooker guidance' });
  }
  if (version.appliances.includes('pressure-cooker')) {
    const p = profiles.get('pressure-cooker');
    const liquid = totalLiquidMl(version, ings);
    if (p?.minLiquidMl && liquid < p.minLiquidMl) {
      out.push({ level: 'warn', code: 'pressure-min-liquid', message: `Only about ${Math.round(liquid)} ml of thin liquid recorded; your pressure-cooker profile requires at least ${p.minLiquidMl} ml. Thick sauces (e.g. passata) may trigger a burn warning.`, source: p.sourceReference });
    }
    if (p?.capacityLitres && p.maxFillFraction) {
      const vol = approxVolumeLitres(version, ings);
      if (vol > p.capacityLitres * p.maxFillFraction) out.push({ level: 'warn', code: 'pressure-overfill', message: `Approximate volume ${vol.toFixed(1)} L exceeds the ${Math.round(p.maxFillFraction * 100)}% fill line of your ${p.capacityLitres} L cooker.`, source: p.sourceReference });
    }
  }
  if (version.appliances.includes('slow-cooker')) {
    const p = profiles.get('slow-cooker');
    if (p?.capacityLitres && p.maxFillFraction) {
      const vol = approxVolumeLitres(version, ings);
      if (vol > p.capacityLitres * p.maxFillFraction) out.push({ level: 'warn', code: 'slow-overfill', message: `Approximate volume ${vol.toFixed(1)} L may overfill your ${p.capacityLitres} L slow cooker.`, source: p.sourceReference });
    }
  }
  for (const t of TEMPERATURE_CHECKS) {
    if (t.tag !== 'leftovers' && tags.has(t.tag)) out.push({ level: 'info', code: `temp-${t.tag}`, message: `${t.label}: check it reaches ${t.celsius} °C internally.`, source: t.source });
  }
  for (const app of version.appliances) {
    if (!version.steps.some((s) => s.appliance === app)) out.push({ level: 'info', code: `no-steps-${app}`, message: `Appliance "${app}" is listed but no step uses it.` });
  }
  return out;
}

/* ---------------- Substitutions & method transformations ---------------- */

export const SubstitutionRuleSchema = z.object({
  id: z.string(),
  fromIngredientId: z.string(),
  toIngredientId: z.string(),
  /** ratio of replacement quantity to original */
  ratio: z.number().positive(),
  status: ValidationStatusSchema,
  notes: z.string().default(''),
  source: z.string().default('')
});
export type SubstitutionRule = z.infer<typeof SubstitutionRuleSchema>;

export interface SubstitutionCheck {
  allowed: boolean;
  status: ValidationStatus;
  ratio: number;
  reasons: string[];
}

/**
 * Validates replacing one ingredient with another. Without an explicit rule the swap is permitted
 * only as an *experimental* manual change in a Recipe Lab branch; it is never applied automatically.
 * Excluded tags (e.g. seafood) block the swap.
 */
export function validateSubstitution(fromId: string, toId: string, rules: SubstitutionRule[], ings: Map<string, Ingredient>, excludedTags: string[]): SubstitutionCheck {
  const to = ings.get(toId);
  const reasons: string[] = [];
  if (!to) return { allowed: false, status: 'blocked', ratio: 1, reasons: ['Replacement ingredient not found'] };
  const excluded = to.tags.filter((t) => excludedTags.includes(t));
  if (excluded.length) return { allowed: false, status: 'blocked', ratio: 1, reasons: [`Replacement has excluded attribute(s): ${excluded.join(', ')}`] };
  const rule = rules.find((r) => r.fromIngredientId === fromId && r.toIngredientId === toId);
  if (rule) {
    if (rule.status === 'blocked') return { allowed: false, status: 'blocked', ratio: rule.ratio, reasons: [rule.notes || 'Rule marks this substitution as blocked'] };
    if (rule.notes) reasons.push(rule.notes);
    return { allowed: true, status: rule.status, ratio: rule.ratio, reasons };
  }
  const from = ings.get(fromId);
  if (from && from.tags.includes('poultry') !== to.tags.includes('poultry')) reasons.push('Different protein type: cooking times and safe internal temperatures may differ.');
  reasons.push('No recorded rule — treat as an untested experiment.');
  return { allowed: true, status: 'experimental', ratio: 1, reasons };
}

export const MethodTransformationSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  status: ValidationStatusSchema,
  guidance: z.string(),
  source: z.string()
});
export type MethodTransformation = z.infer<typeof MethodTransformationSchema>;

/**
 * Cooking methods are not interchangeable. A transformation is only offered when a rule exists,
 * and even then the app never invents times: it returns guidance text and requires the user to
 * rewrite the method steps themselves.
 */
export function checkMethodTransformation(from: ApplianceId, to: ApplianceId, rules: MethodTransformation[]): { allowed: boolean; status: ValidationStatus; guidance: string; source: string } {
  if (from === to) return { allowed: true, status: 'kitchen-tested', guidance: 'Same method.', source: '' };
  const rule = rules.find((r) => r.from === from && r.to === to);
  if (!rule) return { allowed: false, status: 'blocked', guidance: `No supported transformation from ${from} to ${to}. Create a Lab branch and write and test the new method yourself.`, source: '' };
  return { allowed: rule.status !== 'blocked', status: rule.status, guidance: rule.guidance, source: rule.source };
}
