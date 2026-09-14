import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus, CartItem, Customer } from '../types';
import { getEffectivePrice } from '../utils/pricing';
import {
  fetchOrders as apiFetchOrders,
} from '../api/orders';
import { recordTableSessionActivity } from '../utils/tableSessions';
import * as queue from '../lib/orderQueue';

// Auth is anon-key-only (custom staff auth, not Supabase Auth).
// The SW uses the anon key directly for background sync.

const normalizeOrderPayload = (rawOrder: any): Order | undefined => {
  if (!rawOrder) return undefined;
  const itemsRaw = typeof rawOrder.items === 'string' ? JSON.parse(rawOrder.items) : rawOrder.items;
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];

  const normalizeItem = (item: any) => {
    const menuItem = item.menuItem || item.menu_item || {
      id: item.menuItemId ?? item.menu_item_id ?? item.id ?? 'unknown',
      name: item.menuItemName ?? item.menu_item_name ?? 'Unknown Item',
      description: item.menuItem?.description ?? item.description ?? '',
      price: item.unitPrice ?? item.unit_price ?? 0,
      category: item.menuItem?.category ?? item.category ?? 'unknown',
      emoji: item.menuItem?.emoji ?? '🍽',
      prepTime: item.menuItem?.prepTime ?? item.prepTime ?? 0,
      isAvailable: item.menuItem?.isAvailable ?? item.is_available ?? true,
      isPopular: item.menuItem?.isPopular ?? item.is_popular ?? false,
      requiresKitchen: item.menuItem?.requiresKitchen ?? item.requiresKitchen ?? item.requires_kitchen,
    };

    return {
      ...item,
      id: item.id ?? item.menuItemId ?? item.menu_item_id,
      menuItem,
      menuItemId: item.menuItemId ?? item.menu_item_id,
      menuItemName: item.menuItemName ?? item.menu_item_name ?? menuItem.name,
      unitPrice: item.unitPrice ?? item.unit_price ?? menuItem.price,
      totalPrice: item.totalPrice ?? item.total_price ?? (item.quantity * ((item.unitPrice ?? item.unit_price ?? menuItem.price) || 0)),
      specialInstructions: item.specialInstructions ?? item.special_instructions,
      status: item.status,
      startedAt: item.startedAt ?? item.started_at,
      completedAt: item.completedAt ?? item.completed_at,
    };
  };

  const parseDate = (value: any) => {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const normalizedOrderNumber = String(rawOrder.orderNumber ?? rawOrder.order_number ?? rawOrder.id ?? '')
    .trim()
    .slice(0, 7)
    .toUpperCase();

  return {
    ...rawOrder,
    id: rawOrder.id,
    orderNumber: normalizedOrderNumber,
    tableNumber: rawOrder.tableNumber ?? rawOrder.table_number,
    customerName: rawOrder.customerName ?? rawOrder.customer_name,
    customerId: rawOrder.customerId ?? rawOrder.customer_id,
    restaurantId: rawOrder.restaurantId ?? rawOrder.restaurant_id,
    status: rawOrder.status,
    subtotal: rawOrder.subtotal,
    tax: rawOrder.tax,
    total: rawOrder.total,
    notes: rawOrder.notes ?? rawOrder.note,
    specialInstructions: rawOrder.specialInstructions ?? rawOrder.special_instructions,
    createdAt: parseDate(rawOrder.createdAt ?? rawOrder.created_at) ?? parseDate(rawOrder.inserted_at) ?? new Date(0),
    updatedAt: parseDate(rawOrder.updatedAt ?? rawOrder.updated_at) ?? new Date(0),
    verifiedAt: parseDate(rawOrder.verifiedAt ?? rawOrder.verified_at),
    readyAt: parseDate(rawOrder.readyAt ?? rawOrder.ready_at),
    servedAt: parseDate(rawOrder.servedAt ?? rawOrder.served_at),
    requiresKitchen: rawOrder.requiresKitchen ?? rawOrder.requires_kitchen,
    deliveryProvider: rawOrder.deliveryProvider ?? rawOrder.delivery_provider,
    deliveryAddress: rawOrder.deliveryAddress ?? rawOrder.delivery_address,
    loyaltyRewardId: rawOrder.loyaltyRewardId ?? rawOrder.loyalty_reward_id,
    loyaltyDiscount: rawOrder.loyaltyDiscount ?? rawOrder.loyalty_discount,
    loyaltyFreeItemId: rawOrder.loyaltyFreeItemId ?? rawOrder.loyalty_free_item_id,
    assignedWaiterId: rawOrder.assignedWaiterId ?? rawOrder.assigned_waiter_id ?? rawOrder.assigned_to,
    paymentStatus: rawOrder.paymentStatus ?? rawOrder.payment_status,
    paymentConfirmedBy: rawOrder.paymentConfirmedBy ?? rawOrder.payment_confirmed_by,
    paymentConfirmedAt: rawOrder.paymentConfirmedAt ?? rawOrder.payment_confirmed_at,
    ebmInvoiceId: rawOrder.ebmInvoiceId ?? rawOrder.ebm_invoice_id,
    ebmRcptSign: rawOrder.ebmRcptSign ?? rawOrder.ebm_rcpt_sign,
    ebmRcptNo: rawOrder.ebmRcptNo ?? rawOrder.ebm_rcpt_no,
    items: items.map(normalizeItem),
  } as Order;
};

function resolveRestaurantId(): string | undefined {
  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (authUserRaw) {
    try {
      const authUser = JSON.parse(authUserRaw);
      const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
      if (typeof fallbackId === 'string' && fallbackId.trim()) {
        localStorage.setItem('restaurantId', fallbackId);
        return fallbackId;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export type ConfirmMergeFn = (candidate: Order) => Promise<boolean>;

// Statuses an order must have to be eligible for merging with a new order
const MERGEABLE_STATUSES = new Set(['pending', 'verified', 'preparing', 'ready', 'served']);

// Pure in-memory alternative to the findMergeableOpenOrder DB call.
// Uses the orders already loaded into state — zero network cost.
export function findMergeableInOrders(orders: Order[], tableNumber: number): Order | null {
  const cutoff = Date.now() - 120 * 60_000;
  return orders.find((o) => {
    const tNum = (o as any).tableNumber ?? (o as any).table_number;
    if (tNum !== tableNumber) return false;
    if (!MERGEABLE_STATUSES.has(o.status)) return false;
    const ps = ((o as any).paymentStatus ?? (o as any).payment_status ?? '').toLowerCase();
    if (ps === 'confirmed' || ps === 'paid') return false;
    const created = new Date(o.createdAt as any).getTime();
    if (Number.isNaN(created) || created < cutoff) return false;
    // Skip local-only orders that haven't synced yet
    if ((o.id ?? '').startsWith('offline-') || (o.id ?? '').startsWith('temp-')) return false;
    return true;
  }) ?? null;
}

interface UseOrdersReturn {
  orders: Order[];
  addOrder: (
    tableNumber: number,
    items: CartItem[],
    specialInstructions?: string,
    customer?: Customer | null,
    delivery?: { provider: string; address: string },
    loyaltyRewardId?: string,
    promotionCode?: string,
    confirmMerge?: ConfirmMergeFn
  ) => Promise<Order>;
  updateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    opts?: { assignedWaiterId?: string }
  ) => Promise<void>;
  getOrdersByTable: (tableNumber: number) => Order[];
  getOrdersByWaiter: (waiterId: string) => Order[];
  getPendingOrders: () => Order[];
  getActiveOrders: () => Order[];
  getOrderById: (orderId: string) => Order | undefined;
  getTodaysOrders: () => Order[];
  getTodaysRevenue: () => number;
}

// API functions
export function useOrders(): UseOrdersReturn {
  const [orders, setOrders] = useState<Order[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Stable ref so addOrder can read the latest orders without being in its dep array
  const ordersRef = useRef<Order[]>(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Read restaurantId dynamically so a login/logout that updates localStorage
  // is immediately reflected — never frozen in a useState initializer.
  const getActiveRestaurantId = useCallback(
    () => localStorage.getItem('restaurantId') || undefined,
    []
  );
  const [restaurantId, setRestaurantId] = useState<string | undefined>(getActiveRestaurantId);

  // Re-sync when the app changes the active restaurant (login / logout / switch)
  useEffect(() => {
    const handleChange = () => {
      const next = getActiveRestaurantId();
      setRestaurantId(next);
      // Immediately flush stale orders so the previous tenant's data is gone
      setOrders([]);
    };
    window.addEventListener('restaurantIdChanged', handleChange);
    return () => window.removeEventListener('restaurantIdChanged', handleChange);
  }, [getActiveRestaurantId]);

  const statusChangeInFlight = useRef<Set<string>>(new Set());

  const loadOrders = useCallback(async (restId?: string) => {
    const id = restId || getActiveRestaurantId();
    // No restaurant after logout — clear immediately, don't hit the network.
    if (!id) {
      const role = localStorage.getItem('staffRole');
      if (role !== 'superadmin') {
        setOrders([]);
        return;
      }
    }
    try {
      const fetched = await apiFetchOrders('all', id);
      const normalized = (fetched ?? []).map((o: any) => normalizeOrderPayload(o)).filter(Boolean) as Order[];
      const fetchedIds = new Set(normalized.map((o) => o.id));

      setOrders((prev) => {
        // Preserve local-only orders not yet in the DB
        const localOrders = prev.filter(
          (o) => o.id.startsWith('temp-') || o.id.startsWith('offline-')
        );

        // Guard: if the fetch returned nothing but we already have server orders,
        // skip this update. fetchOrders returns [] on ANY Supabase error, so an
        // empty result with existing orders is almost certainly a transient failure
        // rather than a legitimate "zero orders" state. Realtime handles real
        // deletions; the poll is just a fallback for missed events.
        const hasServerOrders = prev.some(
          (o) => !o.id.startsWith('temp-') && !o.id.startsWith('offline-')
        );
        if (normalized.length === 0 && hasServerOrders) return prev;

        // Dedupe: drop offline orders whose idempotency key matches a server order
        const stillPending = localOrders.filter((local) => {
          if (!local.id.startsWith('offline-')) return !fetchedIds.has(local.id);
          const key = local.id.slice('offline-'.length);
          return !normalized.some((n: any) => n.idempotency_key === key || n.idempotencyKey === key);
        });

        // For orders with a status change in flight, keep the local version
        const merged = normalized.map((serverOrder) => {
          if (statusChangeInFlight.current.has(serverOrder.id)) {
            const localVersion = prev.find((o) => o.id === serverOrder.id);
            if (localVersion) return localVersion;
          }
          return serverOrder;
        });

        return [...stillPending, ...merged];
      });
    } catch (e: any) {
      console.error('[Orders] Poll failed:', e?.message ?? e);
    }
  }, [getActiveRestaurantId]);

  useEffect(() => {
    loadOrders();

    // Timestamp of the last Realtime event — poll skips if one fired recently.
    let lastRealtimeEvent = 0;

    // Poll every 15 seconds as a fallback for missed Realtime events.
    // If Realtime fired within the last 10 s we skip the poll — it's redundant.
    const pollInterval = setInterval(() => {
      if (Date.now() - lastRealtimeEvent < 10_000) return;
      loadOrders();
    }, 15_000);

    // Subscribe to Supabase Realtime for instant updates when it IS configured.
    if (restaurantId) {
      if (channelRef.current) supabase.removeChannel(channelRef.current);

      channelRef.current = supabase
        .channel(`orders-realtime-${restaurantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
          (payload) => {
            lastRealtimeEvent = Date.now();
            const raw = payload.new || payload.old;
            if (!raw) { loadOrders(); return; }
            const updated = normalizeOrderPayload(raw);
            if (!updated) return;

            setOrders((prev) => {
              const exists = prev.some((o) => o.id === updated.id);
              if (payload.eventType === 'DELETE') {
                return prev.filter((o) => o.id !== updated.id);
              }
              if (!exists) return [updated, ...prev];
              return prev.map((o) => (o.id === updated.id ? updated : o));
            });
          }
        )
        .subscribe();
    }

    return () => {
      clearInterval(pollInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId, loadOrders]);

  // Categories that are explicitly bar/beverage — everything else goes to kitchen.
  // Using a blacklist is safer: unknown or new categories default to kitchen.
  const drinkCategories = new Set([
    'alcoholic-drinks', 'beers', 'wine', 'soft-drinks',
    'drinks', 'beverages', 'cocktails', 'bar',
  ]);

  const isFoodOrder = (items: CartItem[]) =>
    items.some((item) => {
      if (item.menuItem.requiresKitchen === false) return false; // explicitly bar-only
      if (item.menuItem.requiresKitchen === true) return true;  // explicitly kitchen
      const category = String(item.menuItem.category ?? '').trim().toLowerCase();
      if (!category || category === 'unknown') return true; // unknown → assume kitchen
      return !drinkCategories.has(category);
    });

  const buildOrderItemPayload = (item: CartItem) => {
    const unitPrice = item.adjustedUnitPrice ?? getEffectivePrice(item.menuItem);
    return {
      menuItemId: item.menuItem.id,
      menuItemName: item.menuItem.name,
      quantity: item.quantity,
      unitPrice,
      notes: item.specialInstructions,
      category: item.menuItem.category,
      requiresKitchen: item.menuItem.requiresKitchen,
      selectedModifiers: item.selectedModifiers || [],
    };
  };

  const buildLocalOrderItem = (item: CartItem) => {
    const unitPrice = item.adjustedUnitPrice ?? getEffectivePrice(item.menuItem);
    return {
      id: `local-${item.menuItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      menuItem: item.menuItem,
      menuItemId: item.menuItem.id,
      menuItemName: item.menuItem.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      specialInstructions: item.specialInstructions,
      selectedModifiers: item.selectedModifiers || [],
      status: 'pending',
    };
  };

  // ─── Queue callbacks (stable refs so event listeners don't stale-close) ────

  const replaceLocalOrder = useCallback((localOrderId: string, confirmed: Order) => {
    setOrders((prev) => {
      const without = prev.filter((o) => o.id !== localOrderId);
      const alreadyReal = without.some((o) => o.id === confirmed.id);
      if (alreadyReal) return without.map((o) => (o.id === confirmed.id ? confirmed : o));
      return [confirmed, ...without];
    });
    window.dispatchEvent(new Event('ordersUpdated'));
  }, []);

  const onQueueConfirmed = useCallback(
    (localOrderId: string, confirmed: Order) => replaceLocalOrder(localOrderId, confirmed),
    [replaceLocalOrder]
  );

  const onQueueFailed = useCallback((_localOrderId: string, reason: string) => {
    console.warn('[Queue] Order hit max retries:', reason);
    // Keep the offline order visible — it will show a "failed" badge via useOfflineStatus
    window.dispatchEvent(new CustomEvent('orderSyncFailed', { detail: { reason } }));
  }, []);

  // ─── Flush helper (lazily imports offlineSync to avoid circular deps) ────────

  const flushQueue = useCallback(async () => {
    const { flushPendingOrders, flushPendingStatusUpdates } = await import('../utils/offlineSync');
    await Promise.all([
      flushPendingOrders(onQueueConfirmed, onQueueFailed),
      flushPendingStatusUpdates(),
    ]);
  }, [onQueueConfirmed, onQueueFailed]);

  // ─── Restore queued orders from IndexedDB on mount ───────────────────────────

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const pending = await queue.getPending();
        if (cancelled || pending.length === 0) return;

        const now = new Date();
        const restoredOrders: Order[] = pending.map((entry) => {
          const p = entry.payload as any;
          const localItems = (p.items || []).map((item: any, idx: number) => ({
            id: `local-${idx}`,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
            specialInstructions: item.notes,
            status: 'pending',
          }));
          const total = localItems.reduce((s: number, i: any) => s + i.totalPrice, 0);
          return {
            id: entry.localOrderId,
            orderNumber: entry.receiptContext.localOrderNumber,
            tableNumber: p.tableNumber,
            customerName: p.customerName,
            restaurantId: p.restaurantId,
            // Preserve assignment so the waiter sees the order in their incoming list
            assignedWaiterId: p.assignedWaiterId ?? undefined,
            items: localItems,
            status: 'pending',
            subtotal: total,
            tax: 0,
            total,
            notes: p.notes,
            requiresKitchen: p.requiresKitchen,
            createdAt: now,
            updatedAt: now,
          } as Order;
        });

        setOrders((prev) => {
          const existingIds = new Set(prev.map((o) => o.id));
          const newOnes = restoredOrders.filter((o) => !existingIds.has(o.id));
          return newOnes.length ? [...newOnes, ...prev] : prev;
        });

        // Attempt to flush immediately (we may have just come online)
        await flushQueue();
      } catch (e) {
        console.warn('[Queue] Restore failed:', e);
      }
    };

    restore();
    return () => { cancelled = true; };
  }, [flushQueue]);

  // ─── Flush on reconnect + tab focus ──────────────────────────────────────────

  useEffect(() => {
    const onOnline = () => { void flushQueue(); };
    const onVisible = () => { if (!document.hidden) void flushQueue(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    // Service worker notifies us when it synced orders while tab was backgrounded
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ORDERS_REFRESHED' || e.data?.type === 'ORDER_SYNCED') {
        void loadOrders();
        void flushQueue();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [flushQueue, loadOrders]);

  // ─── addOrder ────────────────────────────────────────────────────────────────

  const addOrder = useCallback(
    async (
      tableNumber: number,
      items: CartItem[],
      specialInstructions?: string,
      customer?: Customer | null,
      delivery?: { provider: string; address: string },
      loyaltyRewardId?: string,
      promotionCode?: string,
      confirmMerge?: ConfirmMergeFn
    ): Promise<Order> => {
      const currentRestaurantId = resolveRestaurantId();
      if (!currentRestaurantId) {
        throw new Error('Cannot place order: restaurant context is missing. Please scan the restaurant QR code.');
      }
      const requiresKitchen = isFoodOrder(items);
      const payloadItems = items.map(buildOrderItemPayload);
      const localItems = items.map(buildLocalOrderItem);
      let allowMergeToOpenTab = false;

      if (Number.isInteger(tableNumber) && tableNumber > 0 && tableNumber !== 999) {
        // Use the in-memory orders list — no DB round trip needed.
        // ordersRef is kept current by a useEffect, so this always reflects the latest state.
        const mergeCandidate = findMergeableInOrders(ordersRef.current, tableNumber);
        if (confirmMerge) {
          // Pass the candidate (or null for offline probe) — confirmMerge handles all cases:
          // pre-stored autoMerge decision, showing the modal, and the offline null probe.
          allowMergeToOpenTab = await confirmMerge(mergeCandidate as Order);
        } else if (mergeCandidate) {
          const candidateNumber = String(
            (mergeCandidate as any).orderNumber || (mergeCandidate as any).order_number || mergeCandidate.id
          ).trim().slice(0, 7).toUpperCase();
          allowMergeToOpenTab = window.confirm(
            `Table ${tableNumber} has an open tab (#${candidateNumber}). Click OK to merge new items into that tab, or Cancel to create a separate order.`
          );
        }
      }

      const subtotal = localItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const total = subtotal;
      // Key generated once here — never regenerated on retry
      const idempotencyKey = crypto.randomUUID();
      const localOrderId = `offline-${idempotencyKey}`;
      const now = new Date();
      // Read staffId now so both localOrder and the queue payload share it.
      // Only stamp assignedWaiterId when the logged-in user is actually a waiter —
      // managers/supervisors placing orders should not appear as the assigned waiter.
      const hookStaffId = localStorage.getItem('staffId');
      const hookStaffRole = localStorage.getItem('staffRole');
      const waiterStaffId = hookStaffRole === 'waiter' ? hookStaffId : null;

      const localOrder: Order = {
        id: localOrderId,
        orderNumber: 'QUEUED',
        tableNumber,
        customerName: customer?.name,
        customerId: customer?.id,
        restaurantId: currentRestaurantId,
        items: localItems,
        status: 'pending',
        subtotal,
        tax: 0,
        total,
        notes: specialInstructions,
        specialInstructions,
        requiresKitchen,
        deliveryProvider: delivery?.provider,
        deliveryAddress: delivery?.address,
        // Makes isAssignedToCurrentWaiter() return true so the order appears
        // in the waiter's incoming list while queued. Only set for waiter role.
        assignedWaiterId: waiterStaffId ?? undefined,
        createdAt: now,
        updatedAt: now,
      } as Order;

      // 1. Persist to IndexedDB first — survives page refresh, network drop, browser close
      const receiptCtx = queue.buildReceiptContext();
      await queue.enqueue({
        idempotencyKey,
        localOrderId,
        payload: {
          tableNumber: tableNumber === 0 ? undefined : tableNumber,
          customerName: (customer as any)?.customerName || customer?.name || 'Walk-in',
          customerId: customer?.id,
          customerPhone: (customer as any)?.customerPhone || null,
          customerEmail: (customer as any)?.customerEmail || null,
          customerAddress: (customer as any)?.customerAddress || null,
          restaurantId: currentRestaurantId,
          items: payloadItems,
          notes: specialInstructions,
          requiresKitchen,
          deliveryProvider: delivery?.provider,
          deliveryAddress: delivery?.address,
          assignedWaiterId: waiterStaffId || undefined,
          loyaltyRewardId,
          promotionCode,
          idempotencyKey,
          allowMergeToOpenTab,
        },
        receiptContext: receiptCtx,
        status: 'pending',
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
        supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        authToken: null,
        refreshToken: null,
      });

      // 2. Show optimistic order in UI (after queue write so it's never lost)
      setOrders((prev) => [localOrder, ...prev]);
      void recordTableSessionActivity(tableNumber);

      // 3. Attempt immediate send (non-blocking — queue handles failure)
      void flushQueue();

      return localOrder;
    },
    [restaurantId, flushQueue]
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, opts?: {
      assignedWaiterId?: string;
      cancellationReason?: string;
      cancelledBy?: string;
    }) => {
      // ── Offline order: update queue entry, don't hit the network ──────────
      if (orderId.startsWith('offline-')) {
        const idempotencyKey = orderId.slice('offline-'.length);

        if (status === 'cancelled') {
          // Order cancelled before it ever synced — mark done so it never creates
          // on the server, and remove it from local state entirely.
          await queue.markDone(idempotencyKey, 'cancelled-before-sync');
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
          return;
        }

        // Record the furthest status reached so the flush can apply it after creation
        void queue.updateTargetStatus(idempotencyKey, status);
        // Fall through to update local state below (no network call needed)
      } else {
        statusChangeInFlight.current.add(orderId);
        try {
          const ordersApi = await import('../api/orders');
          await (ordersApi as any).updateOrderStatus(orderId, {
            status: status as any,
            assignedTo: opts?.assignedWaiterId,
            cancellationReason: opts?.cancellationReason,
            cancelledBy: opts?.cancelledBy,
          });
        } catch (e: any) {
          const msg = e?.message ?? '';
          const isNetworkError =
            e?.name === 'TypeError' ||
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError') ||
            msg.includes('Unable to connect') ||
            msg.includes('WorkboxError') ||
            msg.includes('no-response') ||
            msg.includes('timeout') ||
            !navigator.onLine;

          if (isNetworkError) {
            void queue.queueStatusUpdate(orderId, status as string, {
              assignedWaiterId: opts?.assignedWaiterId,
              cancellationReason: opts?.cancellationReason,
              cancelledBy: opts?.cancelledBy,
            });
          } else {
            console.warn('Failed to update order status:', e);
          }
        }
      }

      // Update local state (only reached on success or queued offline)
      let affectedTableNumber: number | undefined;
      setOrders((prev) =>
        prev.map((order) => {
          if (order.id !== orderId) return order;
          affectedTableNumber = order.tableNumber;

          const now = new Date();

          const updates: Partial<Order> = {
            status,
            updatedAt: now,
            assignedWaiterId: opts?.assignedWaiterId ?? order.assignedWaiterId
          };

          if (status === 'verified' || status === 'preparing') {
            updates.verifiedAt = order.verifiedAt ?? now;
          }
          if (status === 'ready') {
            updates.readyAt = now;
          }
          if (status === 'served') {
            updates.servedAt = now;
          }

          return { ...order, ...updates };
        })
      );

      if (affectedTableNumber != null) {
        void recordTableSessionActivity(affectedTableNumber);
      }

      // Clear in-flight flag after next poll cycle has time to fetch the updated status
      if (!orderId.startsWith('offline-')) {
        setTimeout(() => statusChangeInFlight.current.delete(orderId), 5000);
      }

      window.dispatchEvent(new Event('ordersUpdated'));
    },
    []
  );

  const getOrdersByTable = useCallback(
    (tableNumber: number) =>
      orders.filter((order) => order.tableNumber === tableNumber),
    [orders]
  );

  const getOrdersByWaiter = useCallback(
    (waiterId: string) =>
      orders.filter((order) => order.assignedWaiterId === waiterId),
    [orders]
  );

  const getPendingOrders = useCallback(
    () => orders.filter((order) => order.status === 'pending'),
    [orders]
  );

  const getActiveOrders = useCallback(
    () =>
      orders.filter((order) =>
        ['pending', 'verified', 'preparing', 'ready'].includes(order.status)
      ),
    [orders]
  );

  const getOrderById = useCallback(
    (orderId: string) => orders.find((order) => order.id === orderId),
    [orders]
  );

  const getTodaysOrders = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter((order) => new Date(order.createdAt) >= today);
  }, [orders]);

  const getTodaysRevenue = useCallback(() => {
    return getTodaysOrders()
      .filter((order) => order.status === 'served')
      .reduce((sum, order) => sum + order.total, 0);
  }, [getTodaysOrders]);

  return {
    orders,
    addOrder,
    updateOrderStatus,
    getOrdersByTable,
    getOrdersByWaiter,
    getPendingOrders,
    getActiveOrders,
    getOrderById,
    getTodaysOrders,
    getTodaysRevenue
  };
}
