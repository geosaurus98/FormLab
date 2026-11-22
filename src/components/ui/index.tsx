import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/* Small, dependency-free design system in the style of shadcn/ui (Tailwind + composable primitives). */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 dark:bg-brand-600 dark:hover:bg-brand-500',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10'
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(function Button({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cn('inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)} {...props} />;
});

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
      {action}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('min-h-[80px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 sm:text-sm', className)} {...props}>
      {children}
    </select>
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Numeric input that keeps `null` for empty (unknown) rather than coercing to 0. */
export function NumberInput({ value, onChange, step = 1, min, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: number | null | undefined; onChange: (v: number | null) => void; step?: number; min?: number }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Number(v));
      }}
      className={className}
      {...props}
    />
  );
}

export function Badge({ children, tone = 'slate', className, title }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'indigo' | 'teal'; className?: string; title?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'
  };
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max, tone = 'brand', label, over }: { value: number; max: number | null; tone?: 'brand' | 'fuel' | 'lift' | 'pantry'; label?: string; over?: 'warn' | 'ok' }) {
  const pct = max && max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colours = { brand: 'bg-brand-600', fuel: 'bg-fuel-500', lift: 'bg-lift-500', pantry: 'bg-pantry-500' };
  const isOver = max != null && value > max;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={max ?? undefined} aria-label={label}>
      <div className={cn('h-full rounded-full transition-all', isOver && over === 'warn' ? 'bg-red-500' : colours[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Bottom sheet on mobile, centred dialog on desktop. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={ref} className="relative flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn('flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors', o.value === value ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 rounded border-slate-300 accent-brand-700" />
      <span>{label}</span>
    </label>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'danger' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
    success: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/50 dark:text-green-200'
  };
  return <div className={cn('rounded-lg border px-3 py-2 text-sm', tones[tone], className)}>{children}</div>;
}
