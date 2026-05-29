import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus, CartItem, Customer } from '../types';
import { getEffectivePrice } from '../utils/pricing';
import {
  createOrder as apiCreateOrder,
  fetchOrders as apiFetchOrders,
  findMergeableOpenOrder,
} from '../api/orders';
import { recordTableSessionActivity } from '../utils/tableSessions';

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
    createdAt: parseDate(rawOrder.createdAt ?? rawOrder.created_at) ?? new Date(),
    updatedAt: parseDate(rawOrder.updatedAt ?? rawOrder.updated_at) ?? new Date(),
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

  const [restaurantId, setRestaurantId] = useState<string | undefined>(
    () => localStorage.getItem('restaurantId') || undefined
  );

  // Keep restaurantId in sync whenever the app sets/changes it
  useEffect(() => {
    const handleChange = () => {
    };
    window.addEventListener('restaurantIdChanged', handleChange);
    return () => window.removeEventListener('restaurantIdChanged', handleChange);
  }, []);

  const loadOrders = useCallback(async (restId?: string) => {
    const id = restId || restaurantId;
    try {
      const fetched = await apiFetchOrders('all', id);
      const normalized = (fetched ?? []).map((o: any) => normalizeOrderPayload(o)).filter(Boolean) as Order[];
      // Merge: keep in-flight temp orders (id starts with "temp-") that aren't in the DB yet
      setOrders((prev) => {
        const tempOrders = prev.filter((o) => o.id.startsWith('temp-'));
        const fetchedIds = new Set(normalized.map((o) => o.id));
        const stillPending = tempOrders.filter((t) => !fetchedIds.has(t.id));
        return [...stillPending, ...normalized];
      });
    } catch (e: any) {
      console.error('[Orders] Poll failed:', e?.message ?? e);
      // Do not clear orders on a failed poll — preserve existing state
    }
  }, [restaurantId]);

  useEffect(() => {
    loadOrders();

    // Poll every 3 seconds as a reliable fallback (works even if Realtime is not enabled)
    const pollInterval = setInterval(() => loadOrders(), 3000);

    // Also subscribe to Supabase Realtime for instant updates when it IS configured
    if (restaurantId) {
      if (channelRef.current) supabase.removeChannel(channelRef.current);

      channelRef.current = supabase
        .channel(`orders-realtime-${restaurantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
          (payload) => {
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
        const mergeCandidate = await findMergeableOpenOrder(tableNumber, currentRestaurantId);
        if (mergeCandidate) {
          if (confirmMerge) {
            allowMergeToOpenTab = await confirmMerge(mergeCandidate);
          } else {
            const candidateNumber = String(
              (mergeCandidate as any).orderNumber || (mergeCandidate as any).order_number || mergeCandidate.id
            ).trim().slice(0, 7).toUpperCase();
            allowMergeToOpenTab = window.confirm(
              `Table ${tableNumber} has an open tab (#${candidateNumber}). Click OK to merge new items into that tab, or Cancel to create a separate order.`
            );
          }
        }
      }

      const subtotal = localItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const total = subtotal;
      const idempotencyKey = crypto.randomUUID();
      const localOrderId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();
      const localOrder: Order = {
        id: localOrderId,
        orderNumber: `TEMP-${Date.now().toString().slice(-6)}`,
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
        createdAt: now,
        updatedAt: now,
      } as Order;

      setOrders((prev) => [localOrder, ...prev]);
      void recordTableSessionActivity(tableNumber);

      let savedOrder: Order = localOrder;
      try {
        // Explicitly pass the creator's staffId so createOrder always assigns them,
        // regardless of whether staffRole in localStorage is stale.
        const hookStaffId = localStorage.getItem('staffId');
        const createdOrder = await apiCreateOrder({
          tableNumber,
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
          assignedWaiterId: hookStaffId || undefined, // belt-and-suspenders assignment
          loyaltyRewardId,
          promotionCode,
          idempotencyKey,
          allowMergeToOpenTab,
        } as any);

        savedOrder = normalizeOrderPayload(createdOrder) ?? localOrder;
        // Upsert: replace temp order OR merge with real order if poll already added it
        setOrders((prev) => {
          const withoutTemp = prev.filter((o) => o.id !== localOrderId);
          const alreadyHasReal = withoutTemp.some((o) => o.id === savedOrder.id);
          if (alreadyHasReal) {
            return withoutTemp.map((o) => (o.id === savedOrder.id ? savedOrder : o));
          }
          return [savedOrder, ...withoutTemp];
        });
        window.dispatchEvent(new Event('ordersUpdated'));
      } catch (e: any) {
        console.error('[Order] Failed to save order to Supabase:', e?.message ?? e);
        // Remove the optimistic temp order so the customer sees the real failure
        setOrders((prev) => prev.filter((o) => o.id !== localOrderId));
        throw e; // rethrow so CartPage can display the error and keep the cart intact
      }

      return savedOrder;
    },
    [restaurantId]
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      try {
        const ordersApi = await import('../api/orders');
        await (ordersApi as any).updateOrderStatus(orderId, { status: status as any, assignedTo: opts?.assignedWaiterId });
      } catch (e) {
        console.warn('Failed to update order status:', e);
      }

      // Always update local state
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
