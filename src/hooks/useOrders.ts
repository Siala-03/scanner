import { useState, useCallback, useEffect } from 'react';
import { Order, OrderStatus, CartItem, MenuItem } from '../types';
import { mockOrders } from '../data/orderData';
import { getEffectivePrice } from '../utils/pricing';
import { decrementInventoryForOrder, ensureInventoryInitialized } from '../utils/inventoryStorage';

// Backend API URL
const API_BASE = '/api';

interface UseOrdersReturn {
  orders: Order[];
  addOrder: (
    tableNumber: number,
    items: CartItem[],
    specialInstructions?: string
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
async function fetchOrdersAPI(status?: string): Promise<Order[]> {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE}/orders${query}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  const data = await res.json();
  return data.map((o: any) => ({
    id: o.id,
    tableNumber: o.table_number,
    items: Array.isArray(o.items) ? o.items.map((item: any) => ({
      menuItem: {
        id: item.menuItemId || 'unknown',
        name: item.menuItemName || 'Unknown',
        price: item.unitPrice ? item.unitPrice / 100 : 0,
        category: 'other',
        description: '',
        available: true
      },
      quantity: item.quantity,
      specialInstructions: item.notes
    })) : [],
    status: o.status,
    createdAt: new Date(o.created_at),
    updatedAt: new Date(o.updated_at),
    subtotal: o.subtotal ? o.subtotal / 100 : 0,
    serviceCharge: 0,
    total: o.total ? o.total / 100 : 0,
    specialInstructions: o.notes,
    requiresKitchen: true
  }));
}

async function createOrderAPI(order: any): Promise<Order> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order)
  });
  if (!res.ok) throw new Error('Failed to create order');
  return res.json();
}

async function updateOrderStatusAPI(orderId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error('Failed to update order');
}

export function useOrders(): UseOrdersReturn {
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [backendAvailable, setBackendAvailable] = useState(false);

  // Try to load from backend on mount
  useEffect(() => {
    async function loadFromBackend() {
      try {
        const backendOrders = await fetchOrdersAPI('all');
        if (backendOrders.length > 0) {
          setOrders(backendOrders);
          setBackendAvailable(true);
        }
      } catch (e) {
        console.warn('Backend not available, using local orders');
        setBackendAvailable(false);
      }
    }
    loadFromBackend();
  }, []);

  const addOrder = useCallback(
    async (
      tableNumber: number,
      items: CartItem[],
      specialInstructions?: string
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

      const newOrder: Order = {
        id: `ORD-${Date.now()}`,
        tableNumber,
        items: orderItems,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        subtotal,
        serviceCharge: 0,
        total,
        specialInstructions,
        requiresKitchen: true
      };

      // Try to sync with backend
      if (backendAvailable) {
        try {
          const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;
          await createOrderAPI({
            order_number: orderNumber,
            table_number: tableNumber,
            items: orderItems.map(item => ({
              menuItemId: item.menuItem.id,
              menuItemName: item.menuItem.name,
              quantity: item.quantity,
              unitPrice: Math.round(getEffectivePrice(item.menuItem) * 100),
              totalPrice: Math.round(getEffectivePrice(item.menuItem) * item.quantity * 100),
              notes: item.specialInstructions
            })),
            subtotal: Math.round(subtotal * 100),
            tax: 0,
            total: Math.round(total * 100),
            status: 'pending',
            notes: specialInstructions
          });
        } catch (e) {
          console.warn('Failed to sync order to backend:', e);
        }
      }

      setOrders((prev) => [newOrder, ...prev]);
      return newOrder;
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
          await updateOrderStatusAPI(orderId, backendStatus);
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
