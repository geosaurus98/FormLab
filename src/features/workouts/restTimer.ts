/**
 * Rest-timer side effects: sound, vibration and an optional system notification.
 * Browsers may throttle or suspend timers in background tabs, so the timer's truth is always the
 * stored `endsAt` timestamp. A notification scheduled with setTimeout is best-effort only: it is
 * reliable while the app is open (foreground or recently backgrounded), not when the OS has frozen it.
 */
let pending: ReturnType<typeof setTimeout> | null = null;

export function cancelRestAlert(): void {
  if (pending) clearTimeout(pending);
  pending = null;
}

export function scheduleRestAlert(endsAt: number, opts: { sound: boolean; notify: boolean; label: string }): void {
  cancelRestAlert();
  const delay = endsAt - Date.now();
  if (delay <= 0) return;
  pending = setTimeout(() => {
    pending = null;
    if (opts.sound) beep();
    if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
    if (opts.notify && document.visibilityState === 'hidden') void showNotification('Rest complete', opts.label);
  }, delay);
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: `${import.meta.env.BASE_URL}icon-192.png`, tag: 'formlab-rest' });
    else new Notification(title, { body });
  } catch {
    /* notifications are optional */
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

let ctx: AudioContext | null = null;
export function beep(): void {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.45);
  } catch {
    /* audio unavailable */
  }
}

/** Keeps the screen awake during a workout where supported (Android Chrome). */
export async function requestWakeLock(): Promise<{ release: () => Promise<void> } | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    return (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    return null;
  }
}
