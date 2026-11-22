import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<(message: string, action?: ToastItem['action']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((message: string, action?: ToastItem['action']) => {
    const id = next.current++;
    setItems((x) => [...x.slice(-2), { id, message, action }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), action ? 6000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
            <span>{t.message}</span>
            {t.action && (
              <button
                className="font-semibold text-brand-200 dark:text-brand-800"
                onClick={() => {
                  t.action!.onClick();
                  setItems((x) => x.filter((i) => i.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
