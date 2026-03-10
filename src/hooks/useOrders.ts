import { useState, useCallback, useMemo } from 'react';
import { Order, OrderStatus, CartItem, MenuItem } from '../types';
import { mockOrders } from '../data/orderData';
import { getEffectivePrice } from '../utils/pricing';
import { decrementInventoryForOrder, ensureInventoryInitialized } from '../utils/inventoryStorage';

interface UseOrdersReturn {
  orders: Order[];
  addOrder: (
  tableNumber: number,
  items: CartItem[],
  specialInstructions?: string)
  => Order;
  updateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    opts?: { assignedWaiterId?: string }
  ) => void;
  getOrdersByTable: (tableNumber: number) => Order[];
  getOrdersByWaiter: (waiterId: string) => Order[];
  getPendingOrders: () => Order[];
  getActiveOrders: () => Order[];
  getOrderById: (orderId: string) => Order | undefined;
  getTodaysOrders: () => Order[];
  getTodaysRevenue: () => number;
}

export function useOrders(): UseOrdersReturn {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  const addOrder = useCallback(
    (
    tableNumber: number,
    items: CartItem[],
    specialInstructions?: string)
    : Order => {
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
      const serviceCharge = 0;
      const total = subtotal;

      const requiresKitchen = orderItems.some((item) =>
      ['breakfast', 'lunch', 'dinner'].includes(item.menuItem.category)
      );

      const newOrder: Order = {
        id: `ORD-${String(orders.length + 1).padStart(3, '0')}`,
        tableNumber,
        items: orderItems,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        subtotal: Math.round(subtotal * 100) / 100,
        serviceCharge: Math.round(serviceCharge * 100) / 100,
        total: Math.round(total * 100) / 100,
        specialInstructions,
        requiresKitchen
      };

      setOrders((prev) => [newOrder, ...prev]);
      return newOrder;
    },
    [orders.length]
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;

        const updates: Partial<Order> = {
          status,
          updatedAt: new Date(),
          assignedWaiterId: opts?.assignedWaiterId ?? order.assignedWaiterId
        };

        if (status === 'verified') updates.verifiedAt = new Date();
        if (status === 'ready') updates.readyAt = new Date();
        if (status === 'served') updates.servedAt = new Date();

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
    return orders.filter((order) => order.createdAt >= today);
  }, [orders]);

  const getTodaysRevenue = useCallback(() => {
    return getTodaysOrders().
    filter((order) => order.status === 'served').
    reduce((sum, order) => sum + order.total, 0);
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