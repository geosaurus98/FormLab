/** Generates a prefixed, collision-resistant identifier, e.g. `food_3f2a…`. */
export function newId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${raw.replace(/-/g, '').slice(0, 16)}`;
}
