import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, ChefHat, Dumbbell, FlaskConical, Home, LineChart, Menu, Settings, ShoppingCart, Sparkles, Utensils, Library, Database, WifiOff } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { cn } from '../lib/utils';
import { useOnline } from '../hooks/data';
import { UpdatePrompt } from './UpdatePrompt';

const SECTIONS = [
  { group: 'Today', items: [{ to: '/', label: 'Home', icon: Home, end: true }] },
  { group: 'FuelTracker', items: [{ to: '/food', label: 'Food diary', icon: Utensils }, { to: '/foods', label: 'Food database', icon: Database }] },
  { group: 'PantryGenome', items: [{ to: '/recipes', label: 'Recipes', icon: BookOpen }, { to: '/planner', label: 'Meal planner', icon: CalendarDays }, { to: '/groceries', label: 'Groceries', icon: ShoppingCart }, { to: '/lab', label: 'Recipe Lab', icon: FlaskConical }] },
  { group: 'WorkoutLab', items: [{ to: '/workouts', label: 'Workouts', icon: Dumbbell }, { to: '/exercises', label: 'Exercise library', icon: Library }] },
  { group: 'Review', items: [{ to: '/progress', label: 'Progress', icon: LineChart }, { to: '/insights', label: 'Insights', icon: Sparkles }, { to: '/settings', label: 'Settings', icon: Settings }] }
];

const BOTTOM = [
  { to: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { to: '/food', label: 'Food', icon: Utensils, match: (p: string) => p.startsWith('/food') },
  { to: '/workouts', label: 'Train', icon: Dumbbell, match: (p: string) => p.startsWith('/workouts') || p.startsWith('/exercises') },
  { to: '/recipes', label: 'Cook', icon: ChefHat, match: (p: string) => ['/recipes', '/planner', '/groceries', '/lab'].some((x) => p.startsWith(x)) },
  { to: '/more', label: 'More', icon: Menu, match: (p: string) => ['/more', '/progress', '/insights', '/settings'].some((x) => p.startsWith(x)) }
];

export function Layout() {
  const { pathname } = useLocation();
  const online = useOnline();
  const active = useLiveQuery(() => db.workouts.where('status').equals('active').first(), []);
  const hideChrome = pathname.startsWith('/workouts/active') || pathname.endsWith('/cook');

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-bold">FormLab</span>
        </div>
        {SECTIONS.map((s) => (
          <div key={s.group} className="mb-4">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.group}</div>
            {s.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={'end' in i ? i.end : false} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                <i.icon className="h-4 w-4" />
                {i.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <div className="min-w-0 flex-1">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-slate-800 px-3 py-1 text-xs text-white">
            <WifiOff className="h-3.5 w-3.5" /> Offline — everything still works and saves on this device.
          </div>
        )}
        {active && !pathname.startsWith('/workouts/active') && (
          <NavLink to="/workouts/active" className="flex items-center justify-center gap-2 bg-lift-600 px-3 py-2 text-sm font-medium text-white">
            <Dumbbell className="h-4 w-4" /> Workout in progress — {active.name}. Tap to resume.
          </NavLink>
        )}
        <main className={cn('mx-auto w-full max-w-5xl px-4 pt-4', hideChrome ? 'pb-6' : 'pb-24 lg:pb-8')}>
          <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {!hideChrome && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden" aria-label="Main">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {BOTTOM.map((b) => {
              const isActive = b.match(pathname);
              return (
                <NavLink key={b.to} to={b.to} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500')}>
                  <b.icon className="h-5 w-5" />
                  {b.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
      <UpdatePrompt />
    </div>
  );
}

export function MorePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">More</h1>
      {SECTIONS.slice(1).map((s) => (
        <div key={s.group}>
          <div className="pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{s.group}</div>
          <div className="grid grid-cols-2 gap-2">
            {s.items.map((i) => (
              <NavLink key={i.to} to={i.to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium dark:border-slate-800 dark:bg-slate-900">
                <i.icon className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {i.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
