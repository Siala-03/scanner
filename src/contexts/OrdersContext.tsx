import { createContext, useContext, ReactNode } from 'react';
import { useOrders } from '../hooks/useOrders';

// Derive the type directly from the hook — stays in sync automatically with no manual upkeep
type UseOrdersReturn = ReturnType<typeof useOrders>;

// Non-null default: context is never null, so the error can never be thrown.
// If somehow the provider is missing, the app shows empty orders rather than crashing.
const stub = {
  orders: [],
  addOrder: async () => { throw new Error('OrdersProvider not mounted'); },
  updateOrderStatus: async () => {},
  getOrdersByTable: () => [],
  getOrdersByWaiter: () => [],
  getPendingOrders: () => [],
  getActiveOrders: () => [],
  getOrderById: () => undefined,
  getTodaysOrders: () => [],
  getTodaysRevenue: () => 0,
} as unknown as UseOrdersReturn;

const OrdersContext = createContext<UseOrdersReturn>(stub);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const value = useOrders();
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): UseOrdersReturn {
  return useContext(OrdersContext);
}
