import { createContext, useContext, ReactNode } from 'react';
import { useOrders } from '../hooks/useOrders';
import { Order, OrderStatus, CartItem, Customer } from '../types';

type UseOrdersReturn = {
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
};

const OrdersContext = createContext<UseOrdersReturn | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const orders = useOrders();
  return <OrdersContext.Provider value={orders}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): UseOrdersReturn {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrdersContext must be used within <OrdersProvider>');
  return ctx;
}
