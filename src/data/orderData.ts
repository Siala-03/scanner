import { Order, OrderStatus } from '../types';
import { menuItems } from './menuData';

const getRandomItems = (count: number) => {
  const shuffled = [...menuItems].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const createOrder = (
id: string,
tableNumber: number,
status: OrderStatus,
minutesAgo: number,
waiterId?: string,
itemCount: number = 3)
: Order => {
  const items = getRandomItems(itemCount).map((item) => ({
    menuItem: item,
    quantity: Math.floor(Math.random() * 2) + 1
  }));

  const subtotal = items.reduce(
    (sum, item) => sum + item.menuItem.price * item.quantity,
    0
  );
  const serviceCharge = subtotal * 0.1;
  const total = subtotal + serviceCharge;

  const createdAt = new Date(Date.now() - minutesAgo * 60 * 1000);
  const requiresKitchen = items.some((item) =>
  ['breakfast', 'lunch', 'dinner'].includes(item.menuItem.category)
  );

  return {
    id,
    tableNumber,
    items,
    status,
    createdAt,
    updatedAt: new Date(),
    assignedWaiterId: waiterId,
    subtotal: Math.round(subtotal * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    total: Math.round(total * 100) / 100,
    requiresKitchen,
    ...(status !== 'pending' && {
      verifiedAt: new Date(createdAt.getTime() + 2 * 60 * 1000)
    }),
    ...(status === 'ready' || status === 'served' ?
    { readyAt: new Date(createdAt.getTime() + 15 * 60 * 1000) } :
    {}),
    ...(status === 'served' ?
    { servedAt: new Date(createdAt.getTime() + 18 * 60 * 1000) } :
    {})
  };
};

export const mockOrders: Order[] = [
// Pending orders (new, need verification)
createOrder('ORD-001', 5, 'pending', 2, 'staff-001', 3),
createOrder('ORD-002', 12, 'pending', 5, 'staff-002', 2),
createOrder('ORD-003', 8, 'pending', 8, 'staff-001', 4),

// Verified orders (approved, being prepared)
createOrder('ORD-004', 3, 'verified', 12, 'staff-003', 3),
createOrder('ORD-005', 15, 'verified', 15, 'staff-002', 2),

// Preparing orders (in kitchen/bar)
createOrder('ORD-006', 7, 'preparing', 20, 'staff-001', 4),
createOrder('ORD-007', 1, 'preparing', 18, 'staff-003', 3),
createOrder('ORD-008', 10, 'preparing', 22, 'staff-002', 5),

// Ready orders (waiting for pickup)
createOrder('ORD-009', 4, 'ready', 30, 'staff-001', 2),
createOrder('ORD-010', 9, 'ready', 28, 'staff-003', 3),

// Served orders (completed)
createOrder('ORD-011', 2, 'served', 45, 'staff-001', 4),
createOrder('ORD-012', 6, 'served', 60, 'staff-002', 3),
createOrder('ORD-013', 11, 'served', 90, 'staff-003', 2),
createOrder('ORD-014', 14, 'served', 120, 'staff-001', 5),
createOrder('ORD-015', 16, 'served', 150, 'staff-002', 3),

// Cancelled order
createOrder('ORD-016', 13, 'cancelled', 35, 'staff-003', 2)];


export const getOrdersByStatus = (status: OrderStatus): Order[] => {
  return mockOrders.filter((order) => order.status === status);
};

export const getOrdersByTable = (tableNumber: number): Order[] => {
  return mockOrders.filter((order) => order.tableNumber === tableNumber);
};

export const getOrdersByWaiter = (waiterId: string): Order[] => {
  return mockOrders.filter((order) => order.assignedWaiterId === waiterId);
};

export const getPendingOrders = (): Order[] => {
  return mockOrders.filter((order) => order.status === 'pending');
};

export const getActiveOrders = (): Order[] => {
  return mockOrders.filter((order) =>
  ['pending', 'verified', 'preparing', 'ready'].includes(order.status)
  );
};

export const getTodaysOrders = (): Order[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return mockOrders.filter((order) => order.createdAt >= today);
};

export const getTodaysRevenue = (): number => {
  return getTodaysOrders().
  filter((order) => order.status === 'served').
  reduce((sum, order) => sum + order.total, 0);
};