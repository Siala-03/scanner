import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
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
  const [backendAvailable, setBackendAvailable] = useState(true);
  const { socket, joinOrders, joinRestaurant } = useSocket();

  const resolveRestaurantId = () => {
    const storedRestaurantId = localStorage.getItem('restaurantId');
    if (storedRestaurantId) return storedRestaurantId;

    const storedAuthUser = localStorage.getItem('authUser');
    if (storedAuthUser) {
      try {
        const parsed = JSON.parse(storedAuthUser);
        if (parsed?.restaurantId) {
          return parsed.restaurantId;
        }
      } catch {
        // ignore invalid JSON
      }
    }

    return 'default_restaurant';
  };

  const restaurantId = resolveRestaurantId();

  useEffect(() => {
    async function loadFromBackend() {
      try {
        const backendOrders = await OfflineAwareAPI.fetchOrders('all', restaurantId);
        setOrders(backendOrders);
        setBackendAvailable(true);
      } catch (e) {
        console.warn('Failed to load orders from backend', e);
        setOrders([]);
        setBackendAvailable(false);
      }
    }

    loadFromBackend();
    joinOrders();
    joinRestaurant(restaurantId);

    const handleOrderUpdate = (data: any) => {
      const updatedOrder = normalizeOrderPayload(data?.order);
      console.log('[useOrders] Socket order:update received', {
        type: data?.type,
        orderId: updatedOrder?.id,
        orderRestaurant: updatedOrder?.restaurantId,
        currentRestaurant: restaurantId,
        orderNumber: updatedOrder?.orderNumber,
        status: updatedOrder?.status,
        matches: updatedOrder?.restaurantId === restaurantId
      });

      if (!updatedOrder) {
        console.log('[useOrders] Skipping order update - missing order payload');
        return;
      }
      if (updatedOrder.restaurantId !== restaurantId) {
        console.log('[useOrders] Skipping order update - restaurantId mismatch');
        return;
      }

      setOrders((prevOrders) => {
        const orderExists = prevOrders.some((order) => order.id === updatedOrder.id);

        if (data.type === 'create') {
          if (orderExists) {
            return prevOrders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order));
          }
          console.log('[useOrders] Creating new order:', updatedOrder.id);
          return [updatedOrder, ...prevOrders];
        }

        if (data.type === 'update' || data.type === 'status') {
          console.log('[useOrders] Updating order:', updatedOrder.id);
          if (!orderExists) {
            return [updatedOrder, ...prevOrders];
          }
          return prevOrders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order));
        }

        return prevOrders;
      });
    };

    socket.on('order:update', handleOrderUpdate);
    return () => {
      socket.off('order:update', handleOrderUpdate);
    };
  }, [restaurantId, joinOrders, joinRestaurant, socket]);

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
      const category = String(item.menuItem.category ?? '').toLowerCase();
      return category === '' || !drinkCategories.has(category);
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
      ensureInventoryInitialized();
      const orderItems = items.map((item) => ({
        menuItem: item.menuItem,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions
      }));

      decrementInventoryForOrder(
        orderItems.map((i) => ({ menuItemId: i.menuItem.id, quantity: i.quantity }))
      );

      const subtotal = orderItems.reduce(
        (sum, item) => sum + getEffectivePrice(item.menuItem) * item.quantity,
        0
      );
      const total = subtotal;

      const requiresKitchen = isFoodOrder(items);
      const localOrder: Order = {
        id: `ORD-${Date.now()}`,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        tableNumber,
        customerName: customer?.name,
        customerId: customer?.id,
        restaurantId,
        items: orderItems,
        status: 'pending',
        subtotal,
        tax: 0,
        total,
        notes: specialInstructions,
        requiresKitchen,
        deliveryProvider: delivery?.provider,
        deliveryAddress: delivery?.address,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Order;

      let savedOrder: Order = localOrder;
      try {
        savedOrder = await OfflineAwareAPI.createOrder({
          tableNumber,
          customerName: customer?.name || 'Walk-in',
          customerId: customer?.id,
          restaurantId,
          items: orderItems.map(item => ({
            menuItemId: item.menuItem.id,
            menuItemName: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: Math.round(getEffectivePrice(item.menuItem) * 100)
          })),
          notes: specialInstructions,
          requiresKitchen,
          deliveryProvider: delivery?.provider,
          deliveryAddress: delivery?.address,
          loyaltyRewardId
        });
      } catch (e) {
        console.warn('Failed to create order:', e);
        savedOrder = localOrder;
      }

      setOrders((prev) => [savedOrder, ...prev]);
      return savedOrder;
    },
    [backendAvailable, restaurantId]
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
