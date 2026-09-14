import { createContext, useContext, useMemo, ReactNode } from 'react';
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
  const hook = useOrders();
  // Memoize so the context value reference is stable across renders where
  // only internal hook state (not orders/functions) changed.
  const value = useMemo(() => hook, [
    hook.orders,
    hook.addOrder,
    hook.updateOrderStatus,
    hook.getOrdersByTable,
    hook.getOrdersByWaiter,
    hook.getPendingOrders,
    hook.getActiveOrders,
    hook.getOrderById,
    hook.getTodaysOrders,
    hook.getTodaysRevenue,
  ]);
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): UseOrdersReturn {
  return useContext(OrdersContext);
}
