import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { RefreshCwIcon, WifiOffIcon } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, pendingCount, failedCount, isSyncing, retryAll } = useOfflineStatus();

  if (isOnline && pendingCount === 0 && failedCount === 0) return null;

  const handleRefresh = () => {
    if (navigator.onLine) {
      window.location.reload();
    } else {
      retryAll();
    }
  };

  if (!isOnline) {
    return (
      <div className="w-full bg-slate-800 border-b border-amber-500/40 px-4 py-2.5 flex items-center gap-3">
        <WifiOffIcon className="flex-shrink-0 w-4 h-4 text-amber-400" />
        <span className="text-sm text-amber-300 font-medium flex-1">
          You're offline.
          {pendingCount > 0 && (
            <span className="text-amber-200">
              {' '}{pendingCount} order{pendingCount !== 1 ? 's' : ''} queued.
            </span>
          )}
        </span>
        <button
          onClick={handleRefresh}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-medium transition-colors"
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-800 border-b border-slate-700 px-4 py-2.5 flex items-center gap-3">
      {isSyncing ? (
        <RefreshCwIcon className="flex-shrink-0 w-4 h-4 text-blue-400 animate-spin" />
      ) : failedCount > 0 ? (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-400" />
      ) : (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      )}

      <span className="text-sm flex-1">
        {isSyncing && pendingCount > 0 && (
          <span className="text-blue-300">
            Syncing {pendingCount} queued order{pendingCount !== 1 ? 's' : ''}…
          </span>
        )}
        {!isSyncing && pendingCount > 0 && failedCount === 0 && (
          <span className="text-slate-300">
            {pendingCount} order{pendingCount !== 1 ? 's' : ''} pending sync…
          </span>
        )}
        {failedCount > 0 && (
          <span className="text-red-300">
            {failedCount} order{failedCount !== 1 ? 's' : ''} failed to sync.
          </span>
        )}
      </span>
      {(failedCount > 0 || pendingCount > 0) && (
        <button
          onClick={retryAll}
          disabled={isSyncing}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing…' : 'Retry now'}
        </button>
      )}
    </div>
  );
}
