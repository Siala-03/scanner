/**
 * Offline order flush logic.
 *
 * Reads pending entries from the IndexedDB queue and attempts to send each
 * to Supabase. Handles three error classes:
 *   - Network error   → mark failed (will retry with backoff)
 *   - Duplicate (23505 / pre-check hit) → mark done, return existing order
 *   - Server error    → mark failed with backoff
 */

import * as queue from '../lib/orderQueue';
import type { QueueEntry, PaymentQueueEntry, StatusUpdateEntry } from '../lib/orderQueue';
import { createOrder as apiCreateOrder, confirmPayment, updateOrderStatus as apiUpdateOrderStatus } from '../api/orders';
import type { Order } from '../types';

export type OnConfirmed = (localOrderId: string, order: Order) => void;
export type OnFailed = (localOrderId: string, reason: string) => void;
export type OnPaymentConfirmed = (orderId: string) => void;
export type OnPaymentFailed = (orderId: string, reason: string) => void;

let _flushing = false;
let _flushStartedAt = 0;
let _flushingPayments = false;
let _flushPaymentsStartedAt = 0;
let _flushingStatus = false;
let _flushStatusStartedAt = 0;
const FLUSH_LOCK_TIMEOUT = 30_000;

function acquireLock(active: boolean, startedAt: number): boolean {
  if (!active) return true;
  return Date.now() - startedAt >= FLUSH_LOCK_TIMEOUT;
}

/**
 * Flush all ready pending entries sequentially.
 * Skips if a flush is already running (prevents concurrent sends).
 * Lock auto-expires after 30s to prevent permanent stalls.
 */
export async function flushPendingOrders(
  onConfirmed: OnConfirmed,
  onFailed: OnFailed
): Promise<void> {
  if (!acquireLock(_flushing, _flushStartedAt)) return;
  _flushing = true;
  _flushStartedAt = Date.now();

  try {
    const pending = await queue.getPending();
    for (const entry of pending) {
      await flushEntry(entry, onConfirmed, onFailed);

      // Stop sending if we go offline mid-flush
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
    }
  } finally {
    _flushing = false;
    // Purge old done entries to keep IndexedDB lean
    void queue.purgeDone();
  }
}

/**
 * Flush a single queue entry by its idempotency key.
 * Useful for retrying a specific failed entry from the UI.
 */
export async function flushByKey(
  idempotencyKey: string,
  onConfirmed: OnConfirmed,
  onFailed: OnFailed
): Promise<void> {
  const entry = await queue.getEntry(idempotencyKey);
  if (!entry) return;
  await flushEntry(entry, onConfirmed, onFailed);
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function flushEntry(
  entry: QueueEntry,
  onConfirmed: OnConfirmed,
  onFailed: OnFailed
): Promise<void> {
  // Already done or currently sending — skip
  if (entry.status === 'done' || entry.status === 'sending') return;

  await queue.markSending(entry.idempotencyKey);

  try {
    let confirmedOrder = await apiCreateOrder(entry.payload as any) as Order;

    if (!confirmedOrder?.id) {
      await queue.markFailed(entry.idempotencyKey, 'Order created but no ID returned');
      return;
    }

    // If the waiter progressed the order through the workflow while offline
    // (e.g. verified → ready → served), apply that final status immediately
    // so the order doesn't reset back to "incoming / pending" on sync.
    if (entry.targetStatus && entry.targetStatus !== 'pending') {
      try {
        const { updateOrderStatus: apiUpdateStatus } = await import('../api/orders');
        const updated = await apiUpdateStatus(confirmedOrder.id, {
          status: entry.targetStatus as any,
          assignedTo: (entry.payload as any).assignedWaiterId,
        });
        if (updated) confirmedOrder = updated as unknown as Order;
      } catch (e) {
        console.warn('[Queue] Failed to apply offline status after sync:', e);
        // Non-fatal — the order is created, just at wrong status. Will self-correct.
      }
    }

    await queue.markDone(entry.idempotencyKey, confirmedOrder.id);
    onConfirmed(entry.localOrderId, confirmedOrder);

    // Register background sync if available (SW will retry if tab closes before done)
    void registerBackgroundSync();
  } catch (err: any) {
    const message = err?.message ?? String(err);

    // 23505 = unique violation — order already exists, fetch and return it
    if (err?.code === '23505' || message.includes('23505') || message.includes('duplicate')) {
      const existing = await findExistingByKey(entry);
      if (existing) {
        await queue.markDone(entry.idempotencyKey, existing.id);
        onConfirmed(entry.localOrderId, existing);
        return;
      }
    }

    // IP restriction — will never succeed on retry, fail immediately
    if (message.includes('restaurant network')) {
      await queue.markDone(entry.idempotencyKey, 'blocked-by-ip-restriction');
      onFailed(entry.localOrderId, message);
      return;
    }

    // Network error — leave as pending for retry
    const isNetworkError =
      err?.name === 'TypeError' ||
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Unable to connect') ||
      message.includes('WorkboxError') ||
      message.includes('no-response') ||
      message.includes('bad-network') ||
      message.includes('timeout') ||
      message.includes('ERR_') ||
      message.includes('ECONNREFUSED') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    if (isNetworkError) {
      await queue.markFailed(entry.idempotencyKey, 'Network unavailable');
      // Do NOT call onFailed — keep the optimistic order in UI, just queued
      return;
    }

    // Server / auth error
    await queue.markFailed(entry.idempotencyKey, message);

    if ((await queue.getEntry(entry.idempotencyKey))?.status === 'failed') {
      // Hit max attempts — surface to UI
      onFailed(entry.localOrderId, message);
    }
  }
}

/** Try to find an already-confirmed order matching this queue entry. */
async function findExistingByKey(entry: QueueEntry): Promise<Order | null> {
  try {
    const { supabase } = await import('../lib/supabase');
    const { data } = await (supabase as any)
      .from('orders')
      .select('*')
      .eq('idempotency_key', entry.idempotencyKey)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

// ─── Payment confirmation flush ───────────────────────────────────────────────

/**
 * Flush all pending payment confirmations.
 * Payment confirmations are UPDATE operations — naturally idempotent,
 * so no duplicate-prevention logic is needed beyond the queue key.
 */
export async function flushPendingPayments(
  onConfirmed: OnPaymentConfirmed,
  onFailed: OnPaymentFailed
): Promise<void> {
  if (!acquireLock(_flushingPayments, _flushPaymentsStartedAt)) return;
  _flushingPayments = true;
  _flushPaymentsStartedAt = Date.now();

  try {
    const pending = await queue.getPendingPayments();
    for (const entry of pending) {
      await flushPaymentEntry(entry, onConfirmed, onFailed);
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
    }
  } finally {
    _flushingPayments = false;
    void queue.purgeDone();
  }
}

async function flushPaymentEntry(
  entry: PaymentQueueEntry,
  onConfirmed: OnPaymentConfirmed,
  onFailed: OnPaymentFailed
): Promise<void> {
  if (entry.status === 'done' || entry.status === 'sending') return;

  await queue.markPaymentSending(entry.idempotencyKey);

  try {
    await confirmPayment(entry.orderId, entry.paymentData as any);
    await queue.markPaymentDone(entry.idempotencyKey);
    onConfirmed(entry.orderId);
  } catch (err: any) {
    const message = err?.message ?? String(err);

    // Network error — leave pending for automatic retry
    const isNetworkError =
      err?.name === 'TypeError' ||
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Unable to connect') ||
      message.includes('WorkboxError') ||
      message.includes('no-response') ||
      message.includes('timeout') ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    if (isNetworkError) {
      await queue.markPaymentFailed(entry.idempotencyKey, 'Network unavailable');
      return;
    }

    await queue.markPaymentFailed(entry.idempotencyKey, message);

    // Only surface to UI after max attempts
    const updated = await queue.getPaymentEntry(entry.idempotencyKey);
    if (updated?.status === 'failed') {
      onFailed(entry.orderId, message);
    }
  }
}

// ─── Status update flush ──────────────────────────────────────────────────────

/**
 * Flush all pending status updates (verify / mark ready / mark served)
 * that were made while offline against already-existing server orders.
 */
export async function flushPendingStatusUpdates(): Promise<void> {
  if (!acquireLock(_flushingStatus, _flushStatusStartedAt)) return;
  _flushingStatus = true;
  _flushStatusStartedAt = Date.now();

  try {
    const pending = await queue.getPendingStatusUpdates();
    for (const entry of pending) {
      await flushStatusEntry(entry);
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
    }
  } finally {
    _flushingStatus = false;
  }
}

async function flushStatusEntry(entry: StatusUpdateEntry): Promise<void> {
  if (entry.queueStatus === 'done' || entry.queueStatus === 'sending') return;

  await queue.markStatusSending(entry.idempotencyKey);

  try {
    await apiUpdateOrderStatus(entry.orderId, {
      status: entry.status as any,
      assignedTo: entry.assignedWaiterId,
      cancellationReason: entry.cancellationReason,
      cancelledBy: entry.cancelledBy,
    });
    await queue.markStatusDone(entry.idempotencyKey);
  } catch (err: any) {
    const message = err?.message ?? String(err);
    const isNetworkError =
      err?.name === 'TypeError' ||
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Unable to connect') ||
      message.includes('WorkboxError') ||
      message.includes('no-response') ||
      message.includes('timeout') ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    // Network error — keep pending for next retry
    if (isNetworkError) {
      await queue.markStatusFailed(entry.idempotencyKey, 'Network unavailable');
      return;
    }

    await queue.markStatusFailed(entry.idempotencyKey, message);
  }
}

/** Register a Background Sync tag so the SW retries if the tab closes. */
async function registerBackgroundSync(): Promise<void> {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await (reg as any).sync.register('sync-pending-orders');
    }
  } catch {
    // Background Sync not supported — app-side retry is enough
  }
}
