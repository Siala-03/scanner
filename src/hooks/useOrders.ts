import { useState, useCallback, useEffect } from 'react';
import { Order, OrderStatus, CartItem, MenuItem } from '../types';
import { mockOrders } from '../data/orderData';
import { getEffectivePrice } from '../utils/pricing';
import { decrementInventoryForOrder, ensureInventoryInitialized } from '../utils/inventoryStorage';
import { fetchOrders, createOrder as apiCreateOrder, updateOrderStatus as apiUpdateOrderStatus } from '../api/orders';

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

export function useOrders(): UseOrdersReturn {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  // Load orders from backend on mount
  useEffect(() => {
    async function loadOrders() {
      try {
        const backendOrders = await fetchOrders('all');
        if (backendOrders.length > 0) {
          // Convert backend orders to frontend format
          const convertedOrders: Order[] = (backendOrders as any[]).map((o: any) => ({
            id: o.id,
            tableNumber: o.table_number,
            items: Array.isArray(o.items) ? o.items.map((item: any) => ({
              menuItem: {
                id: item.menu_item_id || 'unknown',
                name: item.menu_item_name || 'Unknown Item',
                price: item.unit_price ? item.unit_price / 100 : 0,
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
          setOrders(convertedOrders);
        }
      } catch (err) {
        console.warn('Failed to load orders from backend, using local data:', err);
      }
    }
    loadOrders();
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
      try {
        const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;
        const backendOrder = await apiCreateOrder({
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
        } as any);
        // Update with order number from backend
        newOrder.id = backendOrder.id;
        setOrders((prev) => [newOrder, ...prev]);
        return newOrder;
      } catch (err) {
        console.warn('Failed to sync order to backend, using local only:', err);
        // Fall back to local-only order
        setOrders((prev) => [newOrder, ...prev]);
        return newOrder;
      }
    },
    []
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      // Map frontend status to backend status
      const backendStatus = status === 'verified' ? 'preparing' : status;
      
      // Try to sync with backend first
      try {
        await apiUpdateOrderStatus(orderId, { status: backendStatus } as any);
      } catch (err) {
        console.warn('Failed to sync order status to backend:', err);
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

          if (status === 'verified') updates.updatedAt = new Date();
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
