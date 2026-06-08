/**
 * Persistent offline order queue backed by IndexedDB.
 *
 * Every order that leaves the UI goes through this queue first.
 * The idempotency key is generated once here and never regenerated,
 * so retries, background sync, and page-refreshes all end up
 * hitting the same DB row rather than creating duplicates.
 */

const DB_NAME = 'servv_order_queue';
const DB_VERSION = 3;
const STORE = 'orders';
const PAYMENT_STORE = 'payment_confirmations';
const STATUS_STORE = 'status_updates';

export interface ReceiptContext {
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantLogoB64?: string;
  waiterName: string;
  localOrderNumber: string;
}

export interface QueueEntry {
  idempotencyKey: string;   // IndexedDB primary key — never regenerated
  localOrderId: string;     // matches the "offline-<key>" id in React state
  payload: Record<string, unknown>; // full CreateOrderInput
  receiptContext: ReceiptContext;
  status: 'pending' | 'sending' | 'done' | 'failed';
  attempts: number;
  nextRetryAt: number;      // epoch ms — 0 means "retry now"
  failureReason?: string;
  confirmedOrderId?: string;
  createdAt: number;        // epoch ms
  // Stored at queue time so the service worker can send without localStorage
  supabaseUrl: string;
  supabaseAnonKey: string;
  authToken: string | null;
  refreshToken: string | null; // used by SW to get a new access token after expiry
  // Tracks the furthest status the order reached locally while offline.
  // Applied to the server order immediately after creation so the waiter
  // doesn't see the order reset back to "incoming / pending".
  targetStatus?: string;
}

// ─── DB bootstrap ────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const oldVersion = e.oldVersion;

      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
        store.createIndex('byStatus', 'status', { unique: false });
        store.createIndex('byLocalOrderId', 'localOrderId', { unique: true });
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(PAYMENT_STORE)) {
          const pStore = db.createObjectStore(PAYMENT_STORE, { keyPath: 'idempotencyKey' });
          pStore.createIndex('byStatus', 'status', { unique: false });
        }
      }

      if (oldVersion < 3) {
        // Added in v3: order status update queue
        // Key = `status-${orderId}` — one slot per order, always the latest status
        if (!db.objectStoreNames.contains(STATUS_STORE)) {
          const sStore = db.createObjectStore(STATUS_STORE, { keyPath: 'idempotencyKey' });
          sStore.createIndex('byQueueStatus', 'queueStatus', { unique: false });
        }
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db!);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  storeName = STORE
): { store: IDBObjectStore; done: Promise<void> } {
  const t = db.transaction(storeName, mode);
  const store = t.objectStore(storeName);
  const done = new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
  return { store, done };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// ─── Emit queue change event so hooks can re-read counts ─────────────────────

function emitQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('queueChanged'));
  }
}

// ─── Local order-number counter ───────────────────────────────────────────────

function nextLocalOrderNumber(): string {
  const n = parseInt(localStorage.getItem('offlineOrderCounter') || '0', 10) + 1;
  localStorage.setItem('offlineOrderCounter', String(n));
  return `OFF-${String(n).padStart(3, '0')}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueue(
  entry: Omit<QueueEntry, 'attempts' | 'nextRetryAt' | 'createdAt'>
): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const full: QueueEntry = {
    ...entry,
    attempts: 0,
    nextRetryAt: 0,
    createdAt: Date.now(),
  };
  store.put(full);
  await done;
  emitQueueChanged();
}

export async function markSending(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const existing = await req<QueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({ ...existing, status: 'sending' });
  await done;
}

export async function markDone(key: string, confirmedOrderId: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const existing = await req<QueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({ ...existing, status: 'done', confirmedOrderId });
  await done;
  emitQueueChanged();
}

export async function markFailed(key: string, reason: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const existing = await req<QueueEntry>(store.get(key));
  if (!existing) { await done; return; }

  const attempts = existing.attempts + 1;
  const backoffMs = Math.min(Math.pow(2, attempts) * 2000, 60_000);
  store.put({
    ...existing,
    status: attempts >= 5 ? 'failed' : 'pending',
    attempts,
    nextRetryAt: Date.now() + backoffMs,
    failureReason: reason,
  });
  await done;
  emitQueueChanged();
}

/** Entries ready to retry right now (status=pending, nextRetryAt in the past). */
export async function getPending(): Promise<QueueEntry[]> {
  const db = await openDB();
  const { store } = tx(db, 'readonly');
  const all = await req<QueueEntry[]>(store.index('byStatus').getAll('pending'));
  const now = Date.now();
  return all.filter((e) => e.nextRetryAt <= now);
}

export async function getAll(): Promise<QueueEntry[]> {
  const db = await openDB();
  const { store } = tx(db, 'readonly');
  return req<QueueEntry[]>(store.getAll());
}

export async function getEntry(key: string): Promise<QueueEntry | undefined> {
  const db = await openDB();
  const { store } = tx(db, 'readonly');
  return req<QueueEntry | undefined>(store.get(key));
}

/**
 * Track the furthest status an offline order reached locally.
 * Called whenever the waiter moves the order through the workflow while offline.
 */
export async function updateTargetStatus(key: string, status: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const existing = await req<QueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({ ...existing, targetStatus: status });
  await done;
}

/** Reset a failed entry back to pending so it will be retried immediately. */
export async function resetEntry(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const existing = await req<QueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({
    ...existing,
    status: 'pending',
    attempts: 0,
    nextRetryAt: 0,
    failureReason: undefined,
  });
  await done;
  emitQueueChanged();
}

/** Remove done entries older than maxAgeMs to keep IndexedDB tidy. */
export async function purgeDone(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite');
  const all = await req<QueueEntry[]>(store.index('byStatus').getAll('done'));
  const cutoff = Date.now() - maxAgeMs;
  for (const e of all) {
    if (e.createdAt < cutoff) store.delete(e.idempotencyKey);
  }
  await done;
}

/** Build a ReceiptContext from whatever is currently in localStorage. */
export function buildReceiptContext(): ReceiptContext {
  let waiterName = 'Staff';
  let restaurantName = 'Restaurant';
  let restaurantAddress = '';
  let restaurantPhone = '';
  try {
    const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
    if (authUser?.name) waiterName = authUser.name;
    if (authUser?.restaurantName) restaurantName = authUser.restaurantName;
  } catch { /* ignore */ }

  const cachedInfo = localStorage.getItem('restaurantInfo');
  if (cachedInfo) {
    try {
      const info = JSON.parse(cachedInfo);
      if (info.name) restaurantName = info.name;
      if (info.address) restaurantAddress = info.address;
      if (info.phone) restaurantPhone = info.phone;
    } catch { /* ignore */ }
  }

  return {
    restaurantName,
    restaurantAddress,
    restaurantPhone,
    restaurantLogoB64: localStorage.getItem('cachedLogoB64') || undefined,
    waiterName,
    localOrderNumber: nextLocalOrderNumber(),
  };
}

// ─── Payment confirmation queue ───────────────────────────────────────────────
// Separate store, same DB. Key = `payment-${orderId}` — one slot per order,
// naturally prevents double-queuing the same confirmation.

export interface PaymentQueueEntry {
  idempotencyKey: string;         // `payment-${orderId}`
  orderId: string;
  paymentData: Record<string, unknown>;
  status: 'pending' | 'sending' | 'done' | 'failed';
  attempts: number;
  nextRetryAt: number;
  failureReason?: string;
  createdAt: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authToken: string | null;
  refreshToken: string | null;
}

export async function enqueuePayment(
  entry: Omit<PaymentQueueEntry, 'attempts' | 'nextRetryAt' | 'createdAt'>
): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', PAYMENT_STORE);
  store.put({ ...entry, attempts: 0, nextRetryAt: 0, createdAt: Date.now() });
  await done;
  emitQueueChanged();
}

export async function markPaymentSending(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', PAYMENT_STORE);
  const existing = await req<PaymentQueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({ ...existing, status: 'sending' });
  await done;
}

export async function markPaymentDone(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', PAYMENT_STORE);
  const existing = await req<PaymentQueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({ ...existing, status: 'done' });
  await done;
  emitQueueChanged();
}

export async function markPaymentFailed(key: string, reason: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', PAYMENT_STORE);
  const existing = await req<PaymentQueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  const attempts = existing.attempts + 1;
  const backoffMs = Math.min(Math.pow(2, attempts) * 2000, 60_000);
  store.put({
    ...existing,
    status: attempts >= 5 ? 'failed' : 'pending',
    attempts,
    nextRetryAt: Date.now() + backoffMs,
    failureReason: reason,
  });
  await done;
  emitQueueChanged();
}

export async function resetPaymentEntry(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', PAYMENT_STORE);
  const existing = await req<PaymentQueueEntry>(store.get(key));
  if (!existing) { await done; return; }
  store.put({ ...existing, status: 'pending', attempts: 0, nextRetryAt: 0, failureReason: undefined });
  await done;
  emitQueueChanged();
}

export async function getPendingPayments(): Promise<PaymentQueueEntry[]> {
  const db = await openDB();
  const { store } = tx(db, 'readonly', PAYMENT_STORE);
  const all = await req<PaymentQueueEntry[]>(store.index('byStatus').getAll('pending'));
  const now = Date.now();
  return all.filter((e) => e.nextRetryAt <= now);
}

export async function getAllPayments(): Promise<PaymentQueueEntry[]> {
  const db = await openDB();
  const { store } = tx(db, 'readonly', PAYMENT_STORE);
  return req<PaymentQueueEntry[]>(store.getAll());
}

export async function getPaymentEntry(key: string): Promise<PaymentQueueEntry | undefined> {
  const db = await openDB();
  const { store } = tx(db, 'readonly', PAYMENT_STORE);
  return req<PaymentQueueEntry | undefined>(store.get(key));
}

// ─── Status update queue ──────────────────────────────────────────────────────
// One slot per order (key = `status-${orderId}`). Each new offline status change
// overwrites the previous one so only the FINAL status is synced — identical to
// the targetStatus pattern used for offline-created orders.

export interface StatusUpdateEntry {
  idempotencyKey: string;      // `status-${orderId}`
  orderId: string;
  status: string;              // the target order status
  assignedWaiterId?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  queueStatus: 'pending' | 'sending' | 'done' | 'failed';
  attempts: number;
  nextRetryAt: number;
  createdAt: number;
}

export async function queueStatusUpdate(
  orderId: string,
  status: string,
  opts?: { assignedWaiterId?: string; cancellationReason?: string; cancelledBy?: string }
): Promise<void> {
  const db = await openDB();
  const key = `status-${orderId}`;
  const { store, done } = tx(db, 'readwrite', STATUS_STORE);
  // Overwrite any previous pending update for this order
  store.put({
    idempotencyKey: key,
    orderId,
    status,
    assignedWaiterId: opts?.assignedWaiterId,
    cancellationReason: opts?.cancellationReason,
    cancelledBy: opts?.cancelledBy,
    queueStatus: 'pending',
    attempts: 0,
    nextRetryAt: 0,
    createdAt: Date.now(),
  } satisfies StatusUpdateEntry);
  await done;
  emitQueueChanged();
}

export async function markStatusSending(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', STATUS_STORE);
  const e = await req<StatusUpdateEntry>(store.get(key));
  if (!e) { await done; return; }
  store.put({ ...e, queueStatus: 'sending' });
  await done;
}

export async function markStatusDone(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', STATUS_STORE);
  const e = await req<StatusUpdateEntry>(store.get(key));
  if (!e) { await done; return; }
  store.put({ ...e, queueStatus: 'done' });
  await done;
  emitQueueChanged();
}

export async function markStatusFailed(key: string, _reason?: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', STATUS_STORE);
  const e = await req<StatusUpdateEntry>(store.get(key));
  if (!e) { await done; return; }
  const attempts = e.attempts + 1;
  const backoffMs = Math.min(Math.pow(2, attempts) * 2000, 60_000);
  store.put({
    ...e,
    queueStatus: attempts >= 5 ? 'failed' : 'pending',
    attempts,
    nextRetryAt: Date.now() + backoffMs,
  });
  await done;
  emitQueueChanged();
}

export async function resetStatusEntry(key: string): Promise<void> {
  const db = await openDB();
  const { store, done } = tx(db, 'readwrite', STATUS_STORE);
  const e = await req<StatusUpdateEntry>(store.get(key));
  if (!e) { await done; return; }
  store.put({ ...e, queueStatus: 'pending', attempts: 0, nextRetryAt: 0 });
  await done;
  emitQueueChanged();
}

export async function getPendingStatusUpdates(): Promise<StatusUpdateEntry[]> {
  const db = await openDB();
  const { store } = tx(db, 'readonly', STATUS_STORE);
  const all = await req<StatusUpdateEntry[]>(store.index('byQueueStatus').getAll('pending'));
  const now = Date.now();
  return all.filter((e) => e.nextRetryAt <= now);
}

export async function getAllStatusUpdates(): Promise<StatusUpdateEntry[]> {
  const db = await openDB();
  const { store } = tx(db, 'readonly', STATUS_STORE);
  return req<StatusUpdateEntry[]>(store.getAll());
}
