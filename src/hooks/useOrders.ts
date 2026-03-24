import { useState, useCallback, useEffect } from 'react';
import { Order, OrderStatus, CartItem, Customer } from '../types';
import { getEffectivePrice } from '../utils/pricing';
import { decrementInventoryForOrder, ensureInventoryInitialized } from '../utils/inventoryStorage';
import { fetchOrders as fetchOrdersApi, createOrder as createOrderApi, updateOrderStatus as updateOrderStatusApi } from '../api/orders';

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

  useEffect(() => {
    async function loadFromBackend() {
      try {
        const backendOrders = await fetchOrdersApi('all');
        setOrders(backendOrders);
        setBackendAvailable(true);
      } catch (e) {
        console.warn('Failed to load orders from backend', e);
        setOrders([]);
        setBackendAvailable(false);
      }
    }
    loadFromBackend();
  }, []);

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

      const localOrder: Order = {
        id: `ORD-${Date.now()}`,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        tableNumber,
        customerName: customer?.name,
        customerId: customer?.id,
        items: orderItems,
        status: 'pending',
        subtotal,
        tax: 0,
        total,
        notes: specialInstructions,
        deliveryProvider: delivery?.provider,
        deliveryAddress: delivery?.address,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Order;

      let savedOrder: Order = localOrder;
      if (backendAvailable) {
        try {
          savedOrder = await createOrderApi({
            tableNumber,
            customerName: customer?.name || 'Walk-in',
            customerId: customer?.id,
            items: orderItems.map(item => ({
              menuItemId: item.menuItem.id,
              menuItemName: item.menuItem.name,
              quantity: item.quantity,
              unitPrice: Math.round(getEffectivePrice(item.menuItem) * 100)
            })),
            notes: specialInstructions,
            deliveryProvider: delivery?.provider,
            deliveryAddress: delivery?.address,
            loyaltyRewardId
          });
        } catch (e) {
          console.warn('Failed to sync order to backend:', e);
          savedOrder = localOrder;
        }
      }

      setOrders((prev) => [savedOrder, ...prev]);
      return savedOrder;
    },
    [backendAvailable]
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      // Map frontend status to backend status
      const backendStatus = status === 'verified' ? 'preparing' : status;
      
      // Try to sync with backend
      if (backendAvailable) {
        try {
          await updateOrderStatusApi(orderId, { status: backendStatus });
        } catch (e) {
          console.warn('Failed to sync order status to backend:', e);
        }
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
    [backendAvailable]
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
