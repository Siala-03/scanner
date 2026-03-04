import {
  DailyRevenue,
  HourlyOrders,
  CategoryRevenue,
  PopularItem,
  TablePerformance,
  Activity,
  KPI } from
'../types';
import { menuItems } from './menuData';
import { formatPrice } from '../utils/currency';

// Last 7 days revenue data (Scaled to RWF)
export const weeklyRevenue: DailyRevenue[] = [
{ date: '2026-02-26', revenue: 5525000, orders: 68, avgOrderValue: 81250 },
{ date: '2026-02-27', revenue: 6656000, orders: 82, avgOrderValue: 81170 },
{ date: '2026-02-28', revenue: 8957000, orders: 98, avgOrderValue: 91390 },
{ date: '2026-03-01', revenue: 9685000, orders: 112, avgOrderValue: 86470 },
{ date: '2026-03-02', revenue: 10660000, orders: 125, avgOrderValue: 85280 },
{ date: '2026-03-03', revenue: 7384000, orders: 89, avgOrderValue: 82960 },
{ date: '2026-03-04', revenue: 6357000, orders: 76, avgOrderValue: 83640 }];


// Hourly order distribution (typical day)
export const hourlyOrders: HourlyOrders[] = [
{ hour: 8, orders: 12, revenue: 546000 },
{ hour: 9, orders: 25, revenue: 1137500 },
{ hour: 10, orders: 18, revenue: 819000 },
{ hour: 11, orders: 32, revenue: 1664000 },
{ hour: 12, orders: 58, revenue: 3393000 },
{ hour: 13, orders: 65, revenue: 3802500 },
{ hour: 14, orders: 42, revenue: 2457000 },
{ hour: 15, orders: 28, revenue: 1456000 },
{ hour: 16, orders: 22, revenue: 1144000 },
{ hour: 17, orders: 35, revenue: 2047500 },
{ hour: 18, orders: 72, revenue: 5148000 },
{ hour: 19, orders: 85, revenue: 6077500 },
{ hour: 20, orders: 78, revenue: 5577000 },
{ hour: 21, orders: 55, revenue: 3932500 },
{ hour: 22, orders: 32, revenue: 2288000 }];


// Revenue by category
export const categoryRevenue: CategoryRevenue[] = [
{ category: 'dinner', revenue: 16250000, orders: 185, percentage: 30 },
{ category: 'lunch', revenue: 11570000, orders: 245, percentage: 21 },
{ category: 'beers', revenue: 9800000, orders: 380, percentage: 18 },
{
  category: 'alcoholic-drinks',
  revenue: 6500000,
  orders: 220,
  percentage: 12
},
{ category: 'wine', revenue: 7540000, orders: 180, percentage: 14 },
{ category: 'breakfast', revenue: 4160000, orders: 125, percentage: 8 },
{ category: 'soft-drinks', revenue: 1950000, orders: 310, percentage: 4 }];


// Popular items ranking
export const popularItems: PopularItem[] = [
{
  item: menuItems.find((i) => i.id === 'dinner-001')!,
  orderCount: 145,
  revenue: 4060000
},
{
  item: menuItems.find((i) => i.id === 'lunch-001')!,
  orderCount: 132,
  revenue: 1716000
},
{
  item: menuItems.find((i) => i.id === 'beer-001')!,
  orderCount: 328,
  revenue: 820000
},
{
  item: menuItems.find((i) => i.id === 'dinner-002')!,
  orderCount: 98,
  revenue: 2156000
},
{
  item: menuItems.find((i) => i.id === 'bfast-001')!,
  orderCount: 87,
  revenue: 957000
},
{
  item: menuItems.find((i) => i.id === 'wine-001')!,
  orderCount: 72,
  revenue: 4680000
},
{
  item: menuItems.find((i) => i.id === 'lunch-002')!,
  orderCount: 68,
  revenue: 646000
},
{
  item: menuItems.find((i) => i.id === 'alc-006')!,
  orderCount: 65,
  revenue: 780000
},
{
  item: menuItems.find((i) => i.id === 'dinner-003')!,
  orderCount: 58,
  revenue: 1508000
},
{
  item: menuItems.find((i) => i.id === 'soft-001')!,
  orderCount: 156,
  revenue: 624000
}];


// Table performance
export const tablePerformance: TablePerformance[] = Array.from(
  { length: 20 },
  (_, i) => ({
    tableNumber: i + 1,
    totalOrders: Math.floor(Math.random() * 50) + 20,
    totalRevenue: Math.floor(Math.random() * 3900000) + 1950000,
    avgOrderValue: Math.floor(Math.random() * 39000) + 65000,
    avgTurnoverTime: Math.floor(Math.random() * 30) + 45
  })
);

// Recent activity feed
export const recentActivity: Activity[] = [
{
  id: 'act-001',
  type: 'order_placed',
  description: 'New order placed at Table 5',
  timestamp: new Date(Date.now() - 2 * 60 * 1000),
  metadata: { tableNumber: 5, total: 102050 }
},
{
  id: 'act-002',
  type: 'order_verified',
  description: 'Order #ORD-004 verified by Marcus',
  timestamp: new Date(Date.now() - 5 * 60 * 1000),
  metadata: { orderId: 'ORD-004', waiterId: 'staff-001' }
},
{
  id: 'act-003',
  type: 'order_ready',
  description: 'Order #ORD-009 ready for pickup',
  timestamp: new Date(Date.now() - 8 * 60 * 1000),
  metadata: { orderId: 'ORD-009' }
},
{
  id: 'act-004',
  type: 'staff_clock_in',
  description: 'David Williams clocked in',
  timestamp: new Date(Date.now() - 15 * 60 * 1000),
  metadata: { staffId: 'staff-003' }
},
{
  id: 'act-005',
  type: 'order_served',
  description: 'Order #ORD-011 served at Table 2',
  timestamp: new Date(Date.now() - 20 * 60 * 1000),
  metadata: { orderId: 'ORD-011', tableNumber: 2 }
},
{
  id: 'act-006',
  type: 'menu_updated',
  description: 'Ribeye Steak marked as unavailable',
  timestamp: new Date(Date.now() - 30 * 60 * 1000),
  metadata: { itemId: 'dinner-001' }
},
{
  id: 'act-007',
  type: 'order_cancelled',
  description: 'Order #ORD-016 cancelled at Table 13',
  timestamp: new Date(Date.now() - 35 * 60 * 1000),
  metadata: { orderId: 'ORD-016', tableNumber: 13 }
},
{
  id: 'act-008',
  type: 'table_assigned',
  description: 'Tables 11-15 assigned to David',
  timestamp: new Date(Date.now() - 45 * 60 * 1000),
  metadata: { waiterId: 'staff-003', tables: [11, 12, 13, 14, 15] }
}];


// KPIs for dashboard
export const todayKPIs: KPI[] = [
{ label: 'Revenue Today', value: 'RWF 6,357,000', change: 12.5, trend: 'up' },
{ label: 'Total Orders', value: 76, change: 8.2, trend: 'up' },
{
  label: 'Avg Order Value',
  value: 'RWF 83,640',
  change: -2.1,
  trend: 'down'
},
{ label: 'Avg Wait Time', value: '12 min', change: -15.3, trend: 'up' },
{ label: 'Staff On Duty', value: 6, change: 0, trend: 'neutral' },
{ label: 'Customer Rating', value: '4.8', change: 3.2, trend: 'up' }];


// Monthly comparison data
export const monthlyComparison = {
  currentMonth: {
    revenue: 185250000,
    orders: 2180,
    avgOrderValue: 85020,
    newCustomers: 890
  },
  previousMonth: {
    revenue: 167570000,
    orders: 1950,
    avgOrderValue: 85930,
    newCustomers: 780
  }
};

// Peak hours data
export const peakHoursData = [
{ day: 'Mon', hours: [12, 13, 19, 20] },
{ day: 'Tue', hours: [12, 13, 18, 19] },
{ day: 'Wed', hours: [12, 13, 19, 20] },
{ day: 'Thu', hours: [12, 13, 18, 19, 20] },
{ day: 'Fri', hours: [12, 13, 18, 19, 20, 21] },
{ day: 'Sat', hours: [11, 12, 13, 18, 19, 20, 21] },
{ day: 'Sun', hours: [11, 12, 13, 18, 19, 20] }];