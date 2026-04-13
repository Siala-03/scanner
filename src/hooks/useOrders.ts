import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus, CartItem, Customer } from '../types';
import { getEffectivePrice } from '../utils/pricing';
import { decrementInventoryForOrder, ensureInventoryInitialized } from '../utils/inventoryStorage';
import { OfflineAwareAPI } from '../api/offlineAware';

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

  return {
    ...rawOrder,
    id: rawOrder.id,
    orderNumber: rawOrder.orderNumber ?? rawOrder.order_number,
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
    assignedWaiterId: rawOrder.assignedWaiterId ?? rawOrder.assigned_waiter_id,
    items: items.map(normalizeItem),
  } as Order;
};

interface UseOrdersReturn {
  orders: Order[];
  addOrder: (
    tableNumber: number,
    items: CartItem[],
    specialInstructions?: string,
    customer?: Customer | null,
    delivery?: { provider: string; address: string },
    loyaltyRewardId?: string
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

  const restaurantId = localStorage.getItem('restaurantId') || undefined;

  const loadOrders = useCallback(async (restId?: string) => {
    const id = restId || restaurantId;
    try {
      const fetched = await OfflineAwareAPI.fetchOrders('all', id);
      setOrders(fetched.map((o: any) => normalizeOrderPayload(o)).filter(Boolean) as Order[]);
    } catch {
      setOrders([]);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadOrders();

    // Subscribe to Supabase Realtime for live order updates
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
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId, loadOrders]);

  const drinkCategories = new Set([
    'beers',
    'wine',
    'alcoholic-drinks',
    'soft-drinks',
    'coffee',
    'tea',
    'juices',
    'cocktails',
    'mocktails',
    'non-alcoholic',
    'water',
  ]);

  const isFoodOrder = (items: CartItem[]) =>
    items.some((item) => {
      // Explicit flag takes priority if set
      if (item.menuItem.requiresKitchen === true) return true;
      if (item.menuItem.requiresKitchen === false) return false;
      // Fall back to category-based detection
      const category = String(item.menuItem.category ?? '').toLowerCase();
      return category === '' || !drinkCategories.has(category);
    });

  const buildOrderItemPayload = (item: CartItem) => ({
    menuItemId: item.menuItem.id,
    menuItemName: item.menuItem.name,
    quantity: item.quantity,
    unitPrice: getEffectivePrice(item.menuItem),
    notes: item.specialInstructions,
  });

  const buildLocalOrderItem = (item: CartItem) => ({
    id: `local-${item.menuItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    menuItem: item.menuItem,
    menuItemId: item.menuItem.id,
    menuItemName: item.menuItem.name,
    quantity: item.quantity,
    unitPrice: getEffectivePrice(item.menuItem),
    totalPrice: getEffectivePrice(item.menuItem) * item.quantity,
    specialInstructions: item.specialInstructions,
    status: 'pending',
  });

  const addOrder = useCallback(
    async (
      tableNumber: number,
      items: CartItem[],
      specialInstructions?: string,
      customer?: Customer | null,
      delivery?: { provider: string; address: string },
      loyaltyRewardId?: string
    ): Promise<Order> => {
      const currentRestaurantId = resolveRestaurantId();
      if (!currentRestaurantId) {
        throw new Error('Cannot place order: restaurant context is missing. Please scan the restaurant QR code.');
      }
      ensureInventoryInitialized();

      const requiresKitchen = isFoodOrder(items);
      const payloadItems = items.map(buildOrderItemPayload);
      const localItems = items.map(buildLocalOrderItem);

      decrementInventoryForOrder(
        localItems.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }))
      );

      const subtotal = localItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const total = subtotal;
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

      let savedOrder: Order = localOrder;
      try {
        const createdOrder = await OfflineAwareAPI.createOrder({
          tableNumber,
          customerName: customer?.name || 'Walk-in',
          customerId: customer?.id,
          restaurantId: currentRestaurantId,
          items: payloadItems,
          notes: specialInstructions,
          requiresKitchen,
          deliveryProvider: delivery?.provider,
          deliveryAddress: delivery?.address,
          loyaltyRewardId
        });

        savedOrder = normalizeOrderPayload(createdOrder) ?? localOrder;
        setOrders((prev) => prev.map((order) => (order.id === localOrderId ? savedOrder : order)));
      } catch (e) {
        console.warn('Failed to create order:', e);
      }

      return savedOrder;
    },
    [restaurantId]
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      try {
        await OfflineAwareAPI.updateOrderStatus(orderId, { status, assignedTo: opts?.assignedWaiterId });
      } catch (e) {
        console.warn('Failed to update order status:', e);
      }

      // Always update local state
      setOrders((prev) =>
        prev.map((order) => {
          if (order.id !== orderId) return order;

          const updates: Partial<Order> = {
            status,
            updatedAt: new Date(),
            assignedWaiterId: opts?.assignedWaiterId ?? order.assignedWaiterId
          };

          if (status === 'verified' || status === 'preparing') updates.updatedAt = new Date();
          if (status === 'ready') updates.updatedAt = new Date();
          if (status === 'served') updates.updatedAt = new Date();

          return { ...order, ...updates };
        })
      );
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
