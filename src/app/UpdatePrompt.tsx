import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui';

/** Shows a prompt when a new app version has been downloaded; data is never touched by updates. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 p-3 text-sm text-white shadow-lg lg:bottom-6">
      <span>{needRefresh ? 'A new version of FormLab is available.' : 'FormLab is ready to work offline.'}</span>
      <div className="flex gap-2">
        {needRefresh && (
          <Button size="sm" onClick={() => updateServiceWorker(true)}>
            Update
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
