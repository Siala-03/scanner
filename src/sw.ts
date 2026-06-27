/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// Injected by VitePWA at build time — captured once so injectManifest sees exactly one reference.
const WB_MANIFEST = self.__WB_MANIFEST;
try {
  precacheAndRoute(WB_MANIFEST);
} catch (e) {
  console.warn('[SW] precacheAndRoute failed, runtime routes still active:', e);
}

self.skipWaiting();

const CURRENT_CACHES = new Set(['static-assets', 'navigation']);

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.delete('supabase-api'),
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((n) => !CURRENT_CACHES.has(n) && !n.startsWith('workbox-precache'))
            .map((n) => caches.delete(n))
        )
      ),
    ])
  );
});

// ─── App shell: serve from cache when offline ────────────────────────────────
// In a production build, VitePWA injects index.html into __WB_MANIFEST so
// createHandlerBoundToURL can serve it from precache when offline.
// In dev mode __WB_MANIFEST is empty, so we fall back to NetworkFirst instead
// (works online, degrades gracefully rather than throwing).
import { NavigationRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

const hasPrecache = (WB_MANIFEST as unknown[]).length > 0;
const navHandler = hasPrecache
  ? createHandlerBoundToURL('/index.html')
  : new NetworkFirst({ cacheName: 'navigation' });
registerRoute(new NavigationRoute(navHandler));

// ─── Runtime caching ─────────────────────────────────────────────────────────

// Inventory: always fetch fresh — never cache
registerRoute(
  ({ url }) => url.pathname.includes('/inventory'),
  new NetworkOnly()
);

// Supabase REST / Edge Functions: always hit the network.
// Caching API responses causes stale auth tokens, cached error responses (400s),
// and stale data. Offline mode uses IndexedDB queuing instead.
registerRoute(
  ({ url }) =>
    url.hostname.includes('supabase.co') &&
    (url.pathname.includes('/rest/') || url.pathname.includes('/functions/')),
  new NetworkOnly()
);

// Static assets: CacheFirst (24 hours)
registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// ─── Message handler — app can trigger sync explicitly ─────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SYNC_ORDERS') {
    e.waitUntil(syncPendingOrders());
  }
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Background Sync ──────────────────────────────────────────────────────────

const DB_NAME = 'servv_order_queue';
const DB_VERSION = 3;
const STORE = 'orders';
const PAYMENT_STORE = 'payment_confirmations';
const STATUS_STORE = 'status_updates';

self.addEventListener('sync', (e) => {
  if ((e as any).tag === 'sync-pending-orders') {
    (e as any).waitUntil(syncPendingOrders());
  }
});

async function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = req.result;
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
        if (!db.objectStoreNames.contains(STATUS_STORE)) {
          const sStore = db.createObjectStore(STATUS_STORE, { keyPath: 'idempotencyKey' });
          sStore.createIndex('byQueueStatus', 'queueStatus', { unique: false });
        }
      }
    };
  });
}

function idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((res, rej) => {
    const r = store.put(value);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function idbGetAll<T>(index: IDBIndex, key: IDBValidKey): Promise<T[]> {
  return new Promise((res, rej) => {
    const r = index.getAll(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

interface QueueEntry {
  idempotencyKey: string;
  localOrderId: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  nextRetryAt: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authToken: string | null;
  refreshToken: string | null;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function isTokenExpired(jwt: string | null): boolean {
  if (!jwt) return true;
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    // Treat as expired 60 seconds before actual expiry to avoid edge cases
    return payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

async function refreshAccessToken(
  supabaseUrl: string,
  supabaseAnonKey: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/** Returns a valid access token — refreshes automatically if expired. */
async function resolveToken(entry: QueueEntry): Promise<string | null> {
  if (!isTokenExpired(entry.authToken)) return entry.authToken;
  if (entry.refreshToken) {
    return refreshAccessToken(entry.supabaseUrl, entry.supabaseAnonKey, entry.refreshToken);
  }
  return entry.supabaseAnonKey; // last resort: anon key (works if RLS allows it)
}

async function syncPendingOrders(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openQueueDB();
  } catch {
    return; // DB not available — nothing to sync
  }

  const t = db.transaction(STORE, 'readwrite');
  const store = t.objectStore(STORE);
  const byStatus = store.index('byStatus');
  const pending = await idbGetAll<QueueEntry>(byStatus, 'pending');
  const now = Date.now();

  for (const entry of pending) {
    if (entry.nextRetryAt > now) continue;
    if (!entry.supabaseUrl || !entry.supabaseAnonKey) continue;

    // Mark as sending so the app doesn't double-send
    await idbPut(store, { ...entry, status: 'sending' });

    try {
      // Resolve a valid access token — refreshes automatically if the stored one expired
      const token = await resolveToken(entry);

      // POST directly to Supabase REST API
      const body = {
        ...entry.payload,
        idempotency_key: entry.idempotencyKey,
      };

      const res = await fetch(`${entry.supabaseUrl}/rest/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: entry.supabaseAnonKey,
          Authorization: `Bearer ${token ?? entry.supabaseAnonKey}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 409) {
        // 409 = already exists — treat as success
        await idbPut(store, { ...entry, status: 'done' });

        // Notify open clients so they can refresh their order list
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) =>
          c.postMessage({ type: 'ORDER_SYNCED', idempotencyKey: entry.idempotencyKey })
        );
      } else {
        // Non-retryable server error or temporary 5xx — back to pending with backoff
        const attempts = (entry.attempts ?? 0) + 1;
        const backoff = Math.min(Math.pow(2, attempts) * 2000, 60_000);
        await idbPut(store, {
          ...entry,
          status: attempts >= 5 ? 'failed' : 'pending',
          attempts,
          nextRetryAt: now + backoff,
        });
      }
    } catch {
      // Network still down — reset to pending, browser will re-trigger sync
      await idbPut(store, { ...entry, status: 'pending' });
      break;
    }
  }

  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });

  // Tell open tabs to refresh orders from the server
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length) {
    clients.forEach((c) => c.postMessage({ type: 'ORDERS_REFRESHED' }));
  }
}
