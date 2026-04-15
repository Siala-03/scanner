import { supabaseAdmin } from '../lib/supabase';

function getRestaurantId(): string | null {
  if (typeof window === 'undefined') return null;

  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (authUserRaw) {
    try {
      const authUser = JSON.parse(authUserRaw);
      const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
      if (typeof fallbackId === 'string' && fallbackId.trim()) {
        localStorage.setItem('restaurantId', fallbackId);
        return fallbackId;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

export interface WeeklyRevenue {
  thisWeek: RevenueData[];
  lastWeek: RevenueData[];
  totalThisWeek: number;
  totalLastWeek: number;
  growth: number;
}

export interface KPIMetrics {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  popularItems: Array<{ name: string; count: number; revenue: number }>;
  peakHours: Array<{ hour: number; orders: number }>;
}

export async function fetchTodayKPIs(): Promise<KPIMetrics> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', today.toISOString());

  if (error) throw error;

  const list = orders || [];
  const totalOrders = list.length;
  const servedOrders = list.filter((o: any) => o.status === 'served');
  const totalRevenue = servedOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
  const avgOrderValue = servedOrders.length > 0 ? totalRevenue / servedOrders.length : 0;

  // Peak hours
  const hourMap = new Map<number, number>();
  list.forEach((o: any) => {
    const h = new Date(o.created_at).getHours();
    hourMap.set(h, (hourMap.get(h) || 0) + 1);
  });
  const peakHours = Array.from(hourMap.entries())
    .map(([hour, count]) => ({ hour, orders: count }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 3);

  // Popular items from order items array
  const itemMap = new Map<string, { count: number; revenue: number }>();
  list.forEach((o: any) => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach((item: any) => {
      const name = item.menu_item_name || item.menuItemName || 'Unknown';
      const cur = itemMap.get(name) || { count: 0, revenue: 0 };
      cur.count += item.quantity || 1;
      cur.revenue += item.total_price || item.totalPrice || 0;
      itemMap.set(name, cur);
    });
  });
  const popularItems = Array.from(itemMap.entries())
    .map(([name, v]) => ({ name, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { totalRevenue, totalOrders, avgOrderValue, popularItems, peakHours };
}

export async function fetchWeeklyRevenue(): Promise<WeeklyRevenue> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');

  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('total, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', twoWeeksAgo.toISOString());

  if (error) throw error;

  const list = orders || [];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const buildDayMap = (from: Date, to: Date) => {
    const map = new Map<string, RevenueData>();
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = cursor.toISOString().split('T')[0];
      map.set(key, { date: key, revenue: 0, orders: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return map;
  };

  const thisWeekMap = buildDayMap(weekAgo, now);
  const lastWeekMap = buildDayMap(twoWeeksAgo, weekAgo);

  list.forEach((o: any) => {
    const key = o.created_at.split('T')[0];
    if (thisWeekMap.has(key)) {
      const d = thisWeekMap.get(key)!;
      d.revenue += o.total || 0;
      d.orders += 1;
    } else if (lastWeekMap.has(key)) {
      const d = lastWeekMap.get(key)!;
      d.revenue += o.total || 0;
      d.orders += 1;
    }
  });

  const thisWeek = Array.from(thisWeekMap.values());
  const lastWeek = Array.from(lastWeekMap.values());
  const totalThisWeek = thisWeek.reduce((s, d) => s + d.revenue, 0);
  const totalLastWeek = lastWeek.reduce((s, d) => s + d.revenue, 0);
  const growth = totalLastWeek > 0 ? ((totalThisWeek - totalLastWeek) / totalLastWeek) * 100 : 0;

  return { thisWeek, lastWeek, totalThisWeek, totalLastWeek, growth };
}

export async function fetchRevenueByDateRange(startDate: string, endDate: string): Promise<RevenueData[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('total, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) return [];

  const dayMap = new Map<string, RevenueData>();
  (orders || []).forEach((o: any) => {
    const key = o.created_at.split('T')[0];
    const cur = dayMap.get(key) || { date: key, revenue: 0, orders: 0 };
    cur.revenue += o.total || 0;
    cur.orders += 1;
    dayMap.set(key, cur);
  });

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
