/** Date helpers. Dates in the diary are local calendar days stored as `YYYY-MM-DD` keys. */
export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date = new Date()): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: DateKey, b: DateKey): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Inclusive list of date keys between start and end. */
export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Start of the week containing `key`; weekStartsOn 1 = Monday. */
export function startOfWeek(key: DateKey, weekStartsOn = 1): DateKey {
  const d = fromDateKey(key);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export function isoToDateKey(iso: string): DateKey {
  return toDateKey(new Date(iso));
}

export function formatDateKey(key: DateKey, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return fromDateKey(key).toLocaleDateString('en-NZ', opts);
}

export function relativeDayLabel(key: DateKey, today: DateKey = toDateKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return formatDateKey(key);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
