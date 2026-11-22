import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type { Preferences } from '../domain/shared/preferences';
import { targetOn } from '../domain/nutrition/targets';
import { toDateKey, type DateKey } from '../lib/dates';
import { calculateRecipeNutrition } from '../domain/recipes/nutrition';
import type { RecipeVersion } from '../domain/recipes/types';
import { nowIso } from '../lib/utils';

export function usePrefs(): Preferences | undefined {
  return useLiveQuery(() => db.preferences.get('prefs'), []);
}

export async function updatePrefs(patch: Partial<Preferences>): Promise<void> {
  await db.preferences.update('prefs', { ...patch, updatedAt: nowIso() });
}

export function useTargetOn(date: DateKey) {
  const targets = useLiveQuery(() => db.targets.toArray(), []);
  return useMemo(() => (targets ? targetOn(targets, date) : undefined), [targets, date]);
}

/** Current local date key; refreshes at midnight and when the app regains focus. */
export function useToday(): DateKey {
  const [today, setToday] = useState(toDateKey());
  useEffect(() => {
    const check = () => setToday(toDateKey());
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

export function useNutritionLookup() {
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  return useMemo(() => (ingredients && foods ? { ingredients: new Map(ingredients.map((i) => [i.id, i])), foods: new Map(foods.map((f) => [f.id, f])) } : null), [ingredients, foods]);
}

export function useRecipeNutrition(version: RecipeVersion | undefined | null) {
  const lookup = useNutritionLookup();
  return useMemo(() => (version && lookup ? calculateRecipeNutrition(version, lookup) : null), [version, lookup]);
}

export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs, active]);
  return now;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
