import { AlertTriangle } from 'lucide-react';
import { Badge, ProgressBar } from './ui';
import { DATA_QUALITY_LABEL, type DataQuality } from '../domain/shared/provenance';
import { formatNutrient, KJ_PER_KCAL, type Nutrients, type NutrientTotals } from '../domain/nutrition/nutrients';
import type { ValidationStatus } from '../domain/recipes/types';
import { VALIDATION_LABEL } from '../domain/recipes/types';
import { usePrefs } from '../hooks/data';

export function QualityBadge({ quality }: { quality: DataQuality }) {
  const tone = { measured: 'green', label: 'green', reference: 'blue', calculated: 'teal', estimate: 'amber', user: 'slate', unknown: 'red' } as const;
  return (
    <Badge tone={tone[quality]} title="Data quality">
      {DATA_QUALITY_LABEL[quality]}
    </Badge>
  );
}

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const tone = { 'kitchen-tested': 'green', 'source-checked': 'blue', experimental: 'amber', blocked: 'red' } as const;
  return <Badge tone={tone[status]}>{VALIDATION_LABEL[status]}</Badge>;
}

export function IncompleteMark({ show, title = 'Incomplete — some values are unknown, so this is a lower-bound estimate' }: { show: boolean; title?: string }) {
  if (!show) return null;
  return (
    <span title={title} aria-label={title} className="inline-flex text-amber-600">
      <AlertTriangle className="h-3.5 w-3.5" />
    </span>
  );
}

/** Formats energy in the user's preferred unit. */
export function useEnergy() {
  const prefs = usePrefs();
  const unit = prefs?.energyUnit ?? 'kcal';
  return {
    unit,
    fmt: (kcal: number | null | undefined) => (kcal == null ? '?' : unit === 'kJ' ? `${Math.round(kcal * KJ_PER_KCAL)}` : `${Math.round(kcal)}`)
  };
}

export function MacroLine({ n, incomplete }: { n: Nutrients; incomplete?: boolean }) {
  const { fmt, unit } = useEnergy();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-xs text-slate-500 tabular-nums">
      <span className="font-medium text-slate-700 dark:text-slate-300">
        {fmt(n.energyKcal)} {unit}
      </span>
      <span>P {formatNutrient('proteinG', n.proteinG)}</span>
      <span>C {formatNutrient('carbsG', n.carbsG)}</span>
      <span>F {formatNutrient('fatG', n.fatG)}</span>
      <IncompleteMark show={!!incomplete} />
    </span>
  );
}

export function TargetRow({ label, value, target, unit, tone, incomplete, kind = 'min' }: { label: string; value: number; target: number | null; unit: string; tone?: 'brand' | 'fuel' | 'lift' | 'pantry'; incomplete?: boolean; kind?: 'min' | 'max' }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="flex items-center gap-1 font-medium">
          {label} <IncompleteMark show={!!incomplete} />
        </span>
        <span className="tabular-nums text-slate-600 dark:text-slate-300">
          {Math.round(value)}
          {target != null ? ` / ${Math.round(target)}` : ''} {unit}
          {target != null && kind === 'max' && <span className="text-xs text-slate-400"> max</span>}
        </span>
      </div>
      <ProgressBar value={value} max={target} tone={tone} label={label} over={kind === 'max' ? 'warn' : 'ok'} />
    </div>
  );
}

export function NutrientTable({ totals, perLabel }: { totals: NutrientTotals | { values: Nutrients }; perLabel?: string }) {
  const values = 'missing' in totals ? totals.values : totals.values;
  const missing = 'missing' in totals ? totals.missing : null;
  const rows: [keyof Nutrients, string][] = [
    ['energyKcal', 'Energy (kcal)'],
    ['proteinG', 'Protein'],
    ['carbsG', 'Carbohydrate'],
    ['sugarsG', '  of which sugars'],
    ['fatG', 'Fat'],
    ['satFatG', '  of which saturated'],
    ['fibreG', 'Fibre'],
    ['sodiumMg', 'Sodium']
  ];
  return (
    <table className="w-full text-sm">
      {perLabel && (
        <thead>
          <tr>
            <th />
            <th className="text-right text-xs font-medium text-slate-500">{perLabel}</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map(([k, l]) => (
          <tr key={k} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
            <td className="whitespace-pre py-1 text-slate-600 dark:text-slate-400">{l}</td>
            <td className="py-1 text-right tabular-nums">
              {formatNutrient(k, (values as Record<string, number | null>)[k])}
              {missing && missing[k] > 0 && <span className="ml-1 text-xs text-amber-600" title={`${missing[k]} item(s) missing this value`}>+?</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
