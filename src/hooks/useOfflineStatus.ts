/**
 * Provides live offline / queue status to any component.
 *
 * Re-reads the IndexedDB queue whenever:
 *   - The browser goes online / offline
 *   - A queueChanged event fires (emitted by orderQueue on every write)
 *   - The tab becomes visible again
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as queue from '../lib/orderQueue';
import { flushPendingPayments, flushPendingStatusUpdates } from '../utils/offlineSync';

export interface OfflineStatus {
  isOnline: boolean;
  pendingCount: number;   // orders queued but not yet confirmed
  failedCount: number;    // orders that hit max retries
  isSyncing: boolean;     // a flush is currently running
  retryAll: () => void;   // manually trigger a flush attempt
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [orders, payments, statusUpdates] = await Promise.all([
        queue.getAll(),
        queue.getAllPayments(),
        queue.getAllStatusUpdates(),
      ]);
      // Orders and payments use `status`, status updates use `queueStatus`
      const pending =
        orders.filter((e) => e.status === 'pending' || e.status === 'sending').length +
        payments.filter((e) => e.status === 'pending' || e.status === 'sending').length +
        statusUpdates.filter((e) => e.queueStatus === 'pending' || e.queueStatus === 'sending').length;
      const failed =
        orders.filter((e) => e.status === 'failed').length +
        payments.filter((e) => e.status === 'failed').length +
        statusUpdates.filter((e) => e.queueStatus === 'failed').length;
      setPendingCount(pending);
      setFailedCount(failed);
    } catch {
      // IndexedDB not ready yet — ignore
    }
  }, []);

  const retryAll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      // Reset all failed/pending order entries
      const allOrders = await queue.getAll();
      for (const entry of allOrders) {
        if (entry.status === 'failed' || entry.status === 'pending') {
          await queue.resetEntry(entry.idempotencyKey);
        }
      }
      // Reset failed/pending payment entries
      const allPayments = await queue.getAllPayments();
      for (const entry of allPayments) {
        if (entry.status === 'failed' || entry.status === 'pending') {
          await queue.resetPaymentEntry(entry.idempotencyKey);
        }
      }
      // Reset failed/pending status update entries
      const allStatusUpdates = await queue.getAllStatusUpdates();
      for (const entry of allStatusUpdates) {
        if (entry.queueStatus === 'failed' || entry.queueStatus === 'pending') {
          await queue.resetStatusEntry(entry.idempotencyKey);
        }
      }
      const { flushPendingOrders } = await import('../utils/offlineSync');
      await Promise.all([
        flushPendingOrders(
          (_localId, _order) => { void refresh(); },
          (_localId, _reason) => { void refresh(); }
        ),
        flushPendingPayments(
          (_orderId) => { void refresh(); },
          (_orderId, _reason) => { void refresh(); }
        ),
        flushPendingStatusUpdates(),
      ]);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();

    const onOnline = () => {
      setIsOnline(true);
      void refresh();
      navigator.serviceWorker?.controller?.postMessage({ type: 'SYNC_ORDERS' });
    };
    const onOffline = () => { setIsOnline(false); void refresh(); };
    const onQueueChanged = () => { void refresh(); };
    const onVisible = () => { if (!document.hidden) void refresh(); };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('queueChanged', onQueueChanged);
    window.addEventListener('ordersUpdated', onQueueChanged);
    document.addEventListener('visibilitychange', onVisible);

    // Poll every 5 s as a safety net for cases where events don't fire
    const interval = setInterval(() => void refresh(), 5000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('queueChanged', onQueueChanged);
      window.removeEventListener('ordersUpdated', onQueueChanged);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [refresh]);

  return { isOnline, pendingCount, failedCount, isSyncing, retryAll };
}
