import type { RestTimer } from './types';

/**
 * Rest timer modelled as timestamps, not ticking state: the remaining time is always computed from
 * `endsAt - now`, so it stays correct after the tab is backgrounded, throttled or reloaded.
 */
export function startTimer(durationSec: number, exerciseSessionId: string | null, now = Date.now()): RestTimer {
  const ms = Math.max(0, durationSec * 1000);
  return { endsAt: now + ms, pausedRemainingMs: null, durationMs: ms, exerciseSessionId };
}

export function remainingMs(t: RestTimer | null, now = Date.now()): number {
  if (!t) return 0;
  if (t.pausedRemainingMs != null) return t.pausedRemainingMs;
  if (t.endsAt == null) return 0;
  return Math.max(0, t.endsAt - now);
}

export function isRunning(t: RestTimer | null, now = Date.now()): boolean {
  return !!t && t.pausedRemainingMs == null && t.endsAt != null && t.endsAt > now;
}

export function isPaused(t: RestTimer | null): boolean {
  return !!t && t.pausedRemainingMs != null;
}

export function pauseTimer(t: RestTimer, now = Date.now()): RestTimer {
  if (t.pausedRemainingMs != null) return t;
  return { ...t, pausedRemainingMs: remainingMs(t, now), endsAt: null };
}

export function resumeTimer(t: RestTimer, now = Date.now()): RestTimer {
  if (t.pausedRemainingMs == null) return t;
  return { ...t, endsAt: now + t.pausedRemainingMs, pausedRemainingMs: null };
}

export function extendTimer(t: RestTimer, seconds: number, now = Date.now()): RestTimer {
  const add = seconds * 1000;
  if (t.pausedRemainingMs != null) return { ...t, pausedRemainingMs: Math.max(0, t.pausedRemainingMs + add), durationMs: t.durationMs + add };
  const base = t.endsAt != null && t.endsAt > now ? t.endsAt : now;
  return { ...t, endsAt: Math.max(now, base + add), durationMs: Math.max(0, t.durationMs + add) };
}

export function timerProgress(t: RestTimer | null, now = Date.now()): number {
  if (!t || t.durationMs <= 0) return 0;
  return 1 - remainingMs(t, now) / t.durationMs;
}
