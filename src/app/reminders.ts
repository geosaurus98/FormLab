import { db } from '../db/db';
import { showNotification } from '../features/workouts/restTimer';
import { toDateKey } from '../lib/dates';

const MESSAGES: Record<string, [string, string]> = {
  workout: ['Workout planned', 'Your next session is ready in FormLab.'],
  'food-log': ['Log today’s food', 'A quick check that today’s diary is complete.'],
  'meal-plan': ['Plan the week', 'Pick meals for the coming week.'],
  groceries: ['Grocery list', 'Generate and check your shopping list.'],
  'weigh-in': ['Weigh-in', 'Record your body weight.'],
  'recipe-feedback': ['Recipe feedback', 'Cooked something today? Rate it in the Recipe Lab.']
};

/**
 * Local reminder loop. Runs only while the app is open (or recently backgrounded); each reminder
 * fires at most once per day. Uses a notification if permitted, otherwise an in-app callback.
 */
export function startReminderLoop(onInApp: (title: string, body: string) => void): () => void {
  const tick = async () => {
    const prefs = await db.preferences.get('prefs');
    if (!prefs) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = toDateKey(now);
    for (const r of prefs.reminders) {
      if (!r.enabled || !r.days.includes(now.getDay()) || hhmm < r.time) continue;
      const key = `reminder:${r.id}`;
      const last = await db.meta.get(key);
      if (last?.value === today) continue;
      // Skip reminders that are already satisfied
      if (r.id === 'food-log' && (await db.dayStatus.get(today))?.complete) continue;
      if (r.id === 'weigh-in' && (await db.body.where('date').equals(today).count()) > 0) continue;
      await db.meta.put({ key, value: today });
      const [title, body] = MESSAGES[r.id] ?? ['FormLab', ''];
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') await showNotification(title, body);
      else onInApp(title, body);
    }
  };
  void tick();
  const id = setInterval(() => void tick(), 60_000);
  return () => clearInterval(id);
}
