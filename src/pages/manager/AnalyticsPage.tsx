import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area } from 'recharts';
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react';
import { fetchOrders } from '../../api/orders';
import { useMenu } from '../../hooks/useMenu';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { formatPrice } from '../../utils/currency';

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>('week');
  const [comparisonMode, setComparisonMode] = useState<'previousMonth' | 'lastYear'>('previousMonth');
  const [dateWindow, setDateWindow] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { menuItems } = useMenu();
  const menuById = useMemo(() => Object.fromEntries(menuItems.map((item) => [item.id, item])), [menuItems]);

  // KPI targets — persisted per restaurant in localStorage
  const [kpiTargets, setKpiTargetsState] = useState(() => {
    try {
      const rid = localStorage.getItem('restaurantId') || 'default';
      const saved = localStorage.getItem(`kpiTargets_${rid}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { revenue: 150000, orders: 3200, avgOrderValue: 45 };
  });

  const setKpiTargets = (updater: ((prev: typeof kpiTargets) => typeof kpiTargets) | typeof kpiTargets) => {
    setKpiTargetsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        const rid = localStorage.getItem('restaurantId') || 'default';
        localStorage.setItem(`kpiTargets_${rid}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const normalizeOrderItems = (rawItems: any): any[] => {
    if (Array.isArray(rawItems)) return rawItems;
    if (typeof rawItems === 'string') {
      try {
        const parsed = JSON.parse(rawItems);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await fetchOrders();
        if (active) setOrders(data);
      } catch (e) {
        console.error(e);
        if (active) setLoadError('Unable to load analytics data right now.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const parseOrderDate = (order: any) => {
    const parsed = new Date(order.createdAt ?? order.created_at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // Compute the [start, end] window for the selected timeRange tab
  const periodWindow = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (timeRange === 'week') {
      const day = start.getDay(); // 0=Sun
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1)); // back to Monday
    } else if (timeRange === 'month') {
      start.setDate(1);
    } else if (timeRange === 'year') {
      start.setMonth(0, 1);
    }
    return { start, end: now };
  }, [timeRange]);

  // Orders within the selected timeRange
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const d = parseOrderDate(order);
      return d ? d >= periodWindow.start && d <= periodWindow.end : false;
    });
  }, [orders, periodWindow]);

  // KPI metrics for the selected period, with correct "new customers" detection
  const periodMetrics = useMemo(() => {
    // Customers who placed any order BEFORE this period
    const priorCustomers = new Set<string>();
    orders.forEach((order) => {
      const d = parseOrderDate(order);
      if (!d || d >= periodWindow.start) return;
      const key = order.customerId ?? order.customer_id ?? order.customerName ?? order.customer_name;
      if (key) priorCustomers.add(String(key));
    });

    let revenue = 0;
    let orderCount = 0;
    const periodCustomers = new Set<string>();

    filteredOrders.forEach((order) => {
      orderCount += 1;
      if ((order as any).payment_status === 'confirmed' || (order as any).paymentStatus === 'confirmed') revenue += order.total ?? order.total_price ?? 0;
      const key = order.customerId ?? order.customer_id ?? order.customerName ?? order.customer_name;
      if (key) periodCustomers.add(String(key));
    });

    // New customers = those seen in this period for the first time ever
    let newCustomers = 0;
    periodCustomers.forEach((key) => {
      if (!priorCustomers.has(key)) newCustomers += 1;
    });

    return {
      revenue,
      orders: orderCount,
      avgOrderValue: orderCount ? revenue / orderCount : 0,
      newCustomers,
    };
  }, [orders, filteredOrders, periodWindow]);

  // Metrics for the equivalent prior period (same duration, immediately before)
  const previousPeriodMetrics = useMemo(() => {
    const durationMs = periodWindow.end.getTime() - periodWindow.start.getTime();
    const prevEnd = new Date(periodWindow.start.getTime());
    const prevStart = new Date(periodWindow.start.getTime() - durationMs);
    let revenue = 0;
    let orderCount = 0;
    orders.forEach((order) => {
      const d = parseOrderDate(order);
      if (!d || d < prevStart || d >= prevEnd) return;
      orderCount += 1;
      if ((order as any).payment_status === 'confirmed' || (order as any).paymentStatus === 'confirmed') revenue += order.total ?? order.total_price ?? 0;
    });
    return { revenue, orders: orderCount };
  }, [orders, periodWindow]);

  const revenueChange = previousPeriodMetrics.revenue > 0
    ? Math.round((periodMetrics.revenue - previousPeriodMetrics.revenue) / previousPeriodMetrics.revenue * 100)
    : 0;
  const ordersChange = previousPeriodMetrics.orders > 0
    ? Math.round((periodMetrics.orders - previousPeriodMetrics.orders) / previousPeriodMetrics.orders * 100)
    : 0;

  const weeklyRevenue = useMemo(() => {
    const now = new Date();
    const rows: Array<{ date: string; label: string; revenue: number; orders: number; avgOrderValue: number }> = [];

    if (dateWindow === '7d' || dateWindow === '30d') {
      const days = dateWindow === '7d' ? 7 : 30;
      for (let i = days - 1; i >= 0; i -= 1) {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        dayStart.setDate(dayStart.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const inBucket = orders.filter((order) => {
          const d = parseOrderDate(order);
          return d ? d >= dayStart && d < dayEnd : false;
        });

        const ordersCount = inBucket.length;
        const revenue = inBucket
          .filter((order) => (order as any).payment_status === 'confirmed' || (order as any).paymentStatus === 'confirmed')
          .reduce((sum, order) => sum + (order.total ?? order.total_price ?? 0), 0);

        rows.push({
          date: dayStart.toISOString().slice(0, 10),
          label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue,
          orders: ordersCount,
          avgOrderValue: ordersCount ? revenue / ordersCount : 0,
        });
      }
      return rows;
    }

    if (dateWindow === '90d') {
      for (let i = 12; i >= 0; i -= 1) {
        const weekStart = new Date(now);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - (i * 7 + 6));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const inBucket = orders.filter((order) => {
          const d = parseOrderDate(order);
          return d ? d >= weekStart && d < weekEnd : false;
        });

        const ordersCount = inBucket.length;
        const revenue = inBucket
          .filter((order) => (order as any).payment_status === 'confirmed' || (order as any).paymentStatus === 'confirmed')
          .reduce((sum, order) => sum + (order.total ?? order.total_price ?? 0), 0);

        rows.push({
          date: weekStart.toISOString().slice(0, 10),
          label: `W${13 - i}`,
          revenue,
          orders: ordersCount,
          avgOrderValue: ordersCount ? revenue / ordersCount : 0,
        });
      }
      return rows;
    }

    // 1y -> 12 monthly buckets
    for (let i = 11; i >= 0; i -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const inBucket = orders.filter((order) => {
        const d = parseOrderDate(order);
        return d ? d >= monthStart && d < monthEnd : false;
      });

      const ordersCount = inBucket.length;
      const revenue = inBucket
        .filter((order) => order.status === 'served')
        .reduce((sum, order) => sum + (order.total ?? order.total_price ?? 0), 0);

      rows.push({
        date: monthStart.toISOString().slice(0, 10),
        label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        revenue,
        orders: ordersCount,
        avgOrderValue: ordersCount ? revenue / ordersCount : 0,
      });
    }
    return rows;
  }, [orders, dateWindow]);

  const hourlyOrders = useMemo(() => {
    const now = new Date();
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, orders: 0, revenue: 0 }));
    const todayKey = now.toISOString().slice(0, 10);
    orders.forEach((order) => {
      const d = new Date(order.createdAt ?? order.created_at);
      if (Number.isNaN(d.getTime())) return;
      if (d.toISOString().slice(0, 10) !== todayKey) return;
      const row = hours[d.getHours()];
      row.orders += 1;
      if ((order as any).payment_status === 'confirmed' || (order as any).paymentStatus === 'confirmed') row.revenue += order.total ?? order.total_price ?? 0;
    });
    return hours.slice(8, 23);
  }, [orders]);

  // Category revenue filtered to current period
  const categoryRevenue = useMemo(() => {
    const map = new Map<string, { category: string; revenue: number; orders: number; percentage: number }>();
    let totalRevenue = 0;
    filteredOrders.forEach((order) => {
      if ((order as any).payment_status !== 'confirmed' && (order as any).paymentStatus !== 'confirmed') return;
      const items = normalizeOrderItems(order.items);

      items.forEach((item: any) => {
        const menuItemId = item.menuItemId ?? item.menu_item_id;
        const fallbackCategory = item.category ?? item.menuItem?.category ?? item.menu_item?.category;
        const category = menuById[menuItemId]?.category ?? fallbackCategory ?? 'other';
        const existing = map.get(category) ?? { category, revenue: 0, orders: 0, percentage: 0 };
        const itemRev =
          item.totalPrice ??
          item.total_price ??
          (item.unitPrice ?? item.unit_price ?? 0) * (item.quantity ?? 1);
        existing.revenue += itemRev;
        existing.orders += item.quantity ?? 1;
        map.set(category, existing);
        totalRevenue += itemRev;
      });
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, percentage: totalRevenue ? Math.round((r.revenue / totalRevenue) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredOrders, menuById]);

  const peakHoursData = useMemo(() => {
    const byDay: Record<string, Set<number>> = {};
    orders.forEach((order) => {
      const d = new Date(order.createdAt ?? order.created_at);
      if (Number.isNaN(d.getTime())) return;
      const day = d.toLocaleDateString('en-US', { weekday: 'short' });
      if (!byDay[day]) byDay[day] = new Set();
      byDay[day].add(d.getHours());
    });
    return Object.entries(byDay).map(([day, hours]) => ({ day, hours: Array.from(hours).sort((a, b) => a - b) }));
  }, [orders]);

  const timeRangeTabs = [
  {
    id: 'today',
    label: 'Today'
  },
  {
    id: 'week',
    label: 'This Week'
  },
  {
    id: 'month',
    label: 'This Month'
  },
  {
    id: 'year',
    label: 'This Year'
  }];

  const COLORS = [
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#6b7280'];

  const categoryData = categoryRevenue.map((c, i) => ({
    ...c,
    name: c.category.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    color: COLORS[i % COLORS.length]
  }));

  const revenueProgress = Math.min(100, (periodMetrics.revenue / kpiTargets.revenue) * 100);
  const ordersProgress = Math.min(100, (periodMetrics.orders / kpiTargets.orders) * 100);
  const avgOrderValueProgress = Math.min(100, (periodMetrics.avgOrderValue / kpiTargets.avgOrderValue) * 100);

  // Sales funnel filtered to current period
  const salesFunnel = useMemo(() => {
    const statuses = { pending: 0, verified: 0, preparing: 0, ready: 0, served: 0, cancelled: 0 } as Record<string, number>;
    filteredOrders.forEach((order) => {
      const status = order.status ?? 'pending';
      statuses[status] = (statuses[status] ?? 0) + 1;
    });
    return statuses;
  }, [filteredOrders]);

  // Top items filtered to current period
  const topItems = useMemo(() => {
    const itemStats = new Map<string, { name: string; revenue: number; orders: number }>();
    filteredOrders.forEach((order) => {
      const items = normalizeOrderItems(order.items);
      items.forEach((item: any) => {
        const menuItemId = String(item.menuItemId ?? item.menu_item_id ?? item.id ?? '').trim();
        const menuItemName = String(
          item.menuItemName ?? item.menu_item_name ?? item.menuItem?.name ?? item.menu_item?.name ?? ''
        ).trim();
        const key = menuItemId || menuItemName || 'unknown';
        const menuItem = menuItemId ? menuById[menuItemId] : undefined;

        const quantity = Number(item.quantity ?? 1) || 1;
        const unitPrice = Number(
          item.unitPrice ??
            item.unit_price ??
            item.menuItem?.price ??
            item.menu_item?.price ??
            menuItem?.price ??
            0
        );
        const totalPrice = Number(
          item.totalPrice ?? item.total_price ?? (Number.isFinite(unitPrice) ? unitPrice * quantity : 0)
        );

        const stat = itemStats.get(key) ?? {
          name: menuItem?.name ?? (menuItemName || key),
          revenue: 0,
          orders: 0,
        };
        stat.revenue += Number.isFinite(totalPrice) ? totalPrice : 0;
        stat.orders += quantity;
        itemStats.set(key, stat);
      });
    });
    return Array.from(itemStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredOrders, menuById]);

  const highDemandItems = useMemo(
    () => topItems.filter((item) => item.orders >= 3).slice(0, 5),
    [topItems]
  );

  const inventoryRiskItems = menuItems
    .filter((item) => !item.isAvailable)
    .slice(0, 5);

  const attributionHealth = useMemo(() => {
    const now = new Date();
    const start = new Date(now);

    if (dateWindow === '7d') {
      start.setDate(start.getDate() - 7);
    } else if (dateWindow === '30d') {
      start.setDate(start.getDate() - 30);
    } else if (dateWindow === '90d') {
      start.setDate(start.getDate() - 90);
    } else {
      start.setFullYear(start.getFullYear() - 1);
    }
    start.setHours(0, 0, 0, 0);

    const servedInWindow = orders.filter((order) => {
      if ((order as any).payment_status !== 'confirmed' && (order as any).paymentStatus !== 'confirmed') return false;
      const createdAt = new Date(order.createdAt ?? order.created_at);
      if (Number.isNaN(createdAt.getTime())) return false;
      return createdAt >= start && createdAt <= now;
    });

    const missingCount = servedInWindow.filter((order) => {
      const assignedWaiter = String(order.assignedWaiterId ?? order.assigned_waiter_id ?? '').trim();
      const assignedTo = String(order.assignedTo ?? order.assigned_to ?? '').trim();
      const createdBy = String(order.createdBy ?? order.created_by ?? '').trim();
      return !assignedWaiter && !assignedTo && !createdBy;
    }).length;

    const servedCount = servedInWindow.length;
    const healthPct = servedCount > 0 ? Math.round(((servedCount - missingCount) / servedCount) * 100) : 100;

    return { servedCount, missingCount, healthPct };
  }, [orders, dateWindow]);

  const totalWeeklyRevenue = weeklyRevenue.reduce((sum, d) => sum + d.revenue, 0);
  const avgDailyRevenue = weeklyRevenue.length ? totalWeeklyRevenue / weeklyRevenue.length : 0;
  const dailyRevenueChanges = weeklyRevenue.slice(1).map((d, i) => d.revenue - weeklyRevenue[i].revenue);
  const avgDailyGrowth = dailyRevenueChanges.length
    ? dailyRevenueChanges.reduce((sum, ch) => sum + ch, 0) / dailyRevenueChanges.length
    : 0;

  const predictedRevenueData = weeklyRevenue.map((d, index) => ({
    date: d.label,
    actual: d.revenue,
    predicted: d.revenue + avgDailyGrowth * (index + 1),
    orders: d.orders
  }));

  const predictedNextWeekRevenue = weeklyRevenue.length
    ? weeklyRevenue[weeklyRevenue.length - 1].revenue + avgDailyGrowth * 7
    : 0;

  const selectedWindowLabel =
    dateWindow === '7d'
      ? '7D'
      : dateWindow === '30d'
      ? '30D'
      : dateWindow === '90d'
      ? '90D'
      : '1Y';

  const alerts = [] as string[];
  if (revenueChange <= -10) alerts.push('Revenue is down over 10% vs previous period.');
  if (ordersChange <= -10) alerts.push('Orders are down over 10% vs previous period.');
  if (salesFunnel.cancelled > 5) alerts.push(`${salesFunnel.cancelled} cancelled orders this period. Review process.`);
  const avgDailyGrowthPct = avgDailyRevenue > 0 ? (avgDailyGrowth / avgDailyRevenue) * 100 : 0;
  if (avgDailyGrowthPct > 20) alerts.push('High growth: consider expanding staffing and inventory.');
  if (avgDailyGrowthPct < -15) alerts.push('Declining growth: evaluate promotions and offer incentives.');

  const decomposedTrend = {
    shortMA: (weeklyRevenue.slice(-7).reduce((sum, d) => sum + d.revenue, 0) / Math.min(7, weeklyRevenue.length)) || 0,
    mediumMA: (weeklyRevenue.slice(-14).reduce((sum, d) => sum + d.revenue, 0) / Math.min(14, weeklyRevenue.length)) || 0,
    trend: avgDailyGrowth >= 0 ? 'Upward' : 'Downward'
  };

  const periodLabel =
    timeRange === 'today' ? 'Today'
    : timeRange === 'week' ? 'This Week'
    : timeRange === 'month' ? 'This Month'
    : 'This Year';

  const comparisonData = comparisonMode === 'lastYear'
    ? `${formatPrice(periodMetrics.revenue)} (${periodLabel}) vs last year (N/A)`
    : `${formatPrice(periodMetrics.revenue)} (${periodLabel}) vs previous period: ${formatPrice(previousPeriodMetrics.revenue)}`;

  const predictiveRecommendations = {
    staffing:
      avgDailyGrowthPct > 20
        ? 'Increase staff by 10% to handle surge'
        : avgDailyGrowthPct < -15
        ? 'Optimize labor schedule for lower demand'
        : 'Maintain current staffing levels',
    inventory:
      highDemandItems.length > 0
        ? `High demand items: ${highDemandItems.slice(0, 3).map((item) => item.name).join(', ')}. Order additional stock for these items.`
        : avgDailyGrowthPct > 20
        ? 'Order additional stock for high-demand items'
        : 'Continue regular inventory refresh cycle',
    marketing:
      avgDailyGrowthPct < 0
        ? 'Run promotions to boost off-peak revenue'
        : 'Reinforce high-performing menu items in campaigns'
  };

  const downloadCSV = () => {
    const header = 'date,revenue,orders\n';
    const rows = weeklyRevenue.map((d) => `${d.date},${d.revenue},${d.orders}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'weekly_revenue.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dark min-h-screen bg-slate-900 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100">Analytics</h1>
            <p className="text-slate-400">
              Deep dive into your business metrics
            </p>
          </div>
        </div>

        {/* Time Range */}
        <div className="mb-6">
          <Tabs
            tabs={timeRangeTabs}
            activeTab={timeRange}
            onTabChange={setTimeRange}
            variant="pills" />

        </div>

        {/* Date Window + Comparison Mode */}
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-2">
            {['7d', '30d', '90d', '1y'].map((window) => (
              <button
                key={window}
                className={`px-3 py-1 rounded text-sm ${dateWindow === window ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'}`}
                onClick={() => setDateWindow(window as '7d' | '30d' | '90d' | '1y')}>
                {window}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`px-3 py-1 rounded text-sm ${comparisonMode === 'previousMonth' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-200'}`}
              onClick={() => setComparisonMode('previousMonth')}>
              Prev Period
            </button>
            <button
              className={`px-3 py-1 rounded text-sm ${comparisonMode === 'lastYear' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-200'}`}
              onClick={() => setComparisonMode('lastYear')}>
              Last Year
            </button>
          </div>
        </div>

        {/* KPI targets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400">Revenue Target ({periodLabel})</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl md:text-2xl font-bold text-gray-100">{formatPrice(periodMetrics.revenue)} / {formatPrice(kpiTargets.revenue)}</p>
              <input
                type="number"
                min={0}
                value={kpiTargets.revenue}
                onChange={(e) => setKpiTargets((prev) => ({ ...prev, revenue: Number(e.target.value) }))}
                className="w-20 md:w-24 bg-slate-700 text-white px-2 py-1 rounded text-xs"
              />
            </div>
            <div className="h-2 bg-slate-700 rounded mt-2 overflow-hidden">
              <div style={{ width: `${revenueProgress}%` }} className="h-full bg-emerald-400" />
            </div>
          </Card>
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400">Orders Target ({periodLabel})</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl md:text-2xl font-bold text-gray-100">{periodMetrics.orders.toLocaleString()} / {kpiTargets.orders}</p>
              <input
                type="number"
                min={0}
                value={kpiTargets.orders}
                onChange={(e) => setKpiTargets((prev) => ({ ...prev, orders: Number(e.target.value) }))}
                className="w-16 md:w-20 bg-slate-700 text-white px-2 py-1 rounded text-xs"
              />
            </div>
            <div className="h-2 bg-slate-700 rounded mt-2 overflow-hidden">
              <div style={{ width: `${ordersProgress}%` }} className="h-full bg-blue-400" />
            </div>
          </Card>
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400">Avg Order Value Target</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl md:text-2xl font-bold text-gray-100">{formatPrice(periodMetrics.avgOrderValue)} / {formatPrice(kpiTargets.avgOrderValue)}</p>
              <input
                type="number"
                min={0}
                step={1}
                value={kpiTargets.avgOrderValue}
                onChange={(e) => setKpiTargets((prev) => ({ ...prev, avgOrderValue: Number(e.target.value) }))}
                className="w-16 md:w-20 bg-slate-700 text-white px-2 py-1 rounded text-xs"
              />
            </div>
            <div className="h-2 bg-slate-700 rounded mt-2 overflow-hidden">
              <div style={{ width: `${avgOrderValueProgress}%` }} className="h-full bg-amber-400" />
            </div>
          </Card>
        </div>

        <div className="mb-6 bg-slate-800 p-3 rounded-lg">
          <p className="text-xs text-slate-400 mb-1">Comparison</p>
          <p className="text-sm text-white">{comparisonData}</p>
        </div>

        {/* Period summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">
              {timeRange === 'today'
                ? 'Revenue Today'
                : timeRange === 'week'
                ? 'Revenue This Week'
                : timeRange === 'year'
                ? 'Revenue This Year'
                : 'Revenue This Month'}
            </p>
            <p className="text-2xl font-bold text-gray-100">
              {formatPrice(periodMetrics.revenue)}
            </p>
            <div
              className={`flex items-center gap-1 text-sm mt-1 ${revenueChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>

              {revenueChange >= 0 ?
              <TrendingUpIcon className="w-4 h-4" /> :

              <TrendingDownIcon className="w-4 h-4" />
              }
              <span>{revenueChange}% vs prev period</span>
            </div>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">
              {timeRange === 'today'
                ? 'Orders Today'
                : timeRange === 'week'
                ? 'Orders This Week'
                : timeRange === 'year'
                ? 'Orders This Year'
                : 'Orders This Month'}
            </p>
            <p className="text-2xl font-bold text-gray-100">
              {periodMetrics.orders.toLocaleString()}
            </p>
            <div
              className={`flex items-center gap-1 text-sm mt-1 ${ordersChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>

              {ordersChange >= 0 ?
              <TrendingUpIcon className="w-4 h-4" /> :

              <TrendingDownIcon className="w-4 h-4" />
              }
              <span>{ordersChange}% vs prev period</span>
            </div>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Avg Order Value</p>
            <p className="text-2xl font-bold text-white">
              {formatPrice(periodMetrics.avgOrderValue)}
            </p>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">New Customers</p>
            <p className="text-2xl font-bold text-white">
              {periodMetrics.newCustomers}
            </p>
            <p className="text-xs text-slate-400 mt-1">First-time buyers</p>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Attribution Health</p>
            <p className="text-2xl font-bold text-white">{attributionHealth.healthPct}%</p>
            <p className="text-xs text-slate-400 mt-1">
              Missing: {attributionHealth.missingCount}/{attributionHealth.servedCount} served
            </p>
          </Card>
        </div>

        {/* BI improved analytics: predictions and recommendations */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Avg Daily Revenue</p>
            <p className="text-2xl font-bold text-gray-100">{formatPrice(avgDailyRevenue)}</p>
          </Card>
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Next Week Forecast</p>
            <p className="text-2xl font-bold text-gray-100">{formatPrice(predictedNextWeekRevenue)}</p>
          </Card>
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Staffing Insight</p>
            <p className="text-sm text-slate-200">{predictiveRecommendations.staffing}</p>
          </Card>
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Inventory Insight</p>
            <p className="text-sm text-slate-200">{predictiveRecommendations.inventory}</p>
          </Card>
        </div>

        {/* Additional BI improvements */}
        <div className="grid sm:grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Sales Funnel ({periodLabel})</h3>
            <ul className="space-y-1 text-sm text-slate-300">
              <li>Pending: {salesFunnel.pending}</li>
              <li>Verified: {salesFunnel.verified}</li>
              <li>Preparing: {salesFunnel.preparing}</li>
              <li>Ready: {salesFunnel.ready}</li>
              <li>Served: {salesFunnel.served}</li>
              <li>Cancelled: {salesFunnel.cancelled}</li>
            </ul>
          </Card>
          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Top 5 Menu Items ({periodLabel})</h3>
            <ol className="text-sm text-slate-300 list-decimal list-inside space-y-1">
              {topItems.map((item) => (
                <li key={item.name}>{item.name}: {formatPrice(item.revenue)} ({item.orders} orders)</li>
              ))}
            </ol>
          </Card>
          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Inventory Risk</h3>
            {inventoryRiskItems.length ? (
              <ul className="text-sm text-slate-300 space-y-1">
                {inventoryRiskItems.map((item) => (
                  <li key={item.id}>{item.name} (unavailable)</li>
                ))}
              </ul>
            ) : highDemandItems.length ? (
              <ul className="text-sm text-amber-300 space-y-1">
                {highDemandItems.map((item) => (
                  <li key={item.name}>{item.name} ({item.orders} orders)</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No items currently flagged</p>
            )}
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Alerts</h3>
            {alerts.length ? (
              <ul className="text-sm text-amber-300 space-y-1">
                {alerts.map((alert, idx) => <li key={idx}>{alert}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">All metrics within expected thresholds.</p>
            )}
          </Card>
          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Trend Decomposition</h3>
            <p className="text-sm text-slate-300">7d MA: {formatPrice(decomposedTrend.shortMA)}</p>
            <p className="text-sm text-slate-300">14d MA: {formatPrice(decomposedTrend.mediumMA)}</p>
            <p className="text-sm text-slate-300">Direction: {decomposedTrend.trend}</p>
            <button
              className="mt-3 px-3 py-1 bg-blue-500 rounded text-white text-xs"
              onClick={downloadCSV}
            >
              Export Weekly Revenue CSV
            </button>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Revenue Trend */}
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">
              Revenue Trend ({selectedWindowLabel})
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={weeklyRevenue}>

                  <defs>
                    <linearGradient
                      id="revenueGradient2"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1">

                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [
                    formatPrice(value),
                    'Revenue']
                    } />

                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#revenueGradient2)" />

                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Orders by Hour */}
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">
              Orders by Hour (Today)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyOrders}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="hour"
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(h) => `${h}:00`} />

                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    labelFormatter={(h) => `${h}:00 - ${h + 1}:00`} />

                  <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Revenue by Category */}
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">
              Revenue by Category ({periodLabel})
            </h3>
            <div className="h-72 flex items-center">
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="revenue">

                    {categoryData.map((entry, index) =>
                    <Cell key={`cell-${index}`} fill={entry.color} />
                    )}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [
                    formatPrice(value),
                    'Revenue']
                    } />

                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {categoryData.map((cat) =>
                <div
                  key={cat.category}
                  className="flex items-center justify-between">

                    <div className="flex items-center gap-2">
                      <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: cat.color
                      }} />

                      <span className="text-sm text-slate-300">{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-200">
                        {formatPrice(cat.revenue)}
                      </span>
                      <span className="text-xs text-slate-400 ml-2">
                        ({cat.percentage}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Peak Hours Heatmap */}
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">
              Peak Hours
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-xs text-slate-400 pb-2">
                      Day
                    </th>
                    {Array.from(
                      {
                        length: 14
                      },
                      (_, i) => i + 8
                    ).map((hour) =>
                    <th
                      key={hour}
                      className="text-center text-xs text-slate-400 pb-2 px-1">

                        {hour}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {peakHoursData.map((day) =>
                  <tr key={day.day}>
                      <td className="text-sm text-slate-300 py-1">{day.day}</td>
                      {Array.from(
                      {
                        length: 14
                      },
                      (_, i) => i + 8
                    ).map((hour) => {
                      const isPeak = day.hours.includes(hour);
                      return (
                        <td key={hour} className="p-1">
                            <div
                            className={`w-6 h-6 rounded ${isPeak ? 'bg-amber-500' : 'bg-slate-700'}`} />

                          </td>);

                    })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-500" />
                <span className="text-slate-400">Peak hours</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-700" />
                <span className="text-slate-400">Normal hours</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Orders Trend */}
        <Card className="bg-slate-800">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Daily Orders & Revenue ({selectedWindowLabel})
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={weeklyRevenue}>

                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                <YAxis yAxisId="left" stroke="#64748b" fontSize={12} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />

                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px'
                  }} />

                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="orders"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{
                    fill: '#3b82f6'
                  }}
                  name="Orders" />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{
                    fill: '#f59e0b'
                  }}
                  name="Revenue" />

              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Predicted vs Actual Revenue */}
        <Card className="bg-slate-800 mt-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Predicted vs Actual Revenue ({selectedWindowLabel})</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={predictedRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => formatPrice(v)} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [formatPrice(value), 'Revenue']}
                />
                <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} name="Actual" />
                <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#f59e0b' }} name="Predicted" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>);

}
