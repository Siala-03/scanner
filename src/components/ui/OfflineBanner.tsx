import { useOfflineStatus } from '../../hooks/useOfflineStatus';

/**
 * Sticky banner that appears whenever the device is offline
 * or has queued orders waiting to sync.
 *
 * Mount once near the top of any staff dashboard — it self-manages visibility.
 */
export function OfflineBanner() {
  const { isOnline, pendingCount, failedCount, isSyncing, retryAll } = useOfflineStatus();

  // Nothing to show when online and queue is empty
  if (isOnline && pendingCount === 0 && failedCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="w-full bg-slate-800 border-b border-amber-500/40 px-4 py-2.5 flex items-center gap-3">
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-sm text-amber-300 font-medium flex-1">
          You're offline.
          {pendingCount > 0 && (
            <span className="text-amber-200">
              {' '}{pendingCount} order{pendingCount !== 1 ? 's' : ''} queued — will sync automatically when reconnected.
            </span>
          )}
        </span>
      </div>
    );
  }

  // Online but queue not empty yet (syncing or failed)
  return (
    <div className="w-full bg-slate-800 border-b border-slate-700 px-4 py-2.5 flex items-center gap-3">
      {isSyncing ? (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
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
            {failedCount} order{failedCount !== 1 ? 's' : ''} failed to sync.{' '}
            <button
              onClick={retryAll}
              disabled={isSyncing}
              className="underline text-red-200 hover:text-white transition-colors disabled:opacity-50"
            >
              Retry now
            </button>
          </span>
        )}
      </span>
    </div>
  );
}
