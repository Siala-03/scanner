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
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { menuItems } = useMenu();
  const menuById = useMemo(() => Object.fromEntries(menuItems.map((item) => [item.id, item])), [menuItems]);

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

  const now = new Date();
  const last7Days = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }, [now]);

  const weeklyRevenue = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; orders: number; avgOrderValue: number }>();
    last7Days.forEach((d) => map.set(d, { date: d, revenue: 0, orders: 0, avgOrderValue: 0 }));
    orders.forEach((order) => {
      const d = new Date(order.createdAt ?? order.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) return;
      const row = map.get(key)!;
      const total = order.total ?? order.total_price ?? 0;
      row.revenue += total;
      row.orders += 1;
    });
    return Array.from(map.values()).map((r) => ({ ...r, avgOrderValue: r.orders ? r.revenue / r.orders : 0 }));
  }, [last7Days, orders]);

  const monthlyComparison = useMemo(() => {
    const current = { revenue: 0, orders: 0, avgOrderValue: 0, newCustomers: 0 };
    const previous = { revenue: 0, orders: 0, avgOrderValue: 0, newCustomers: 0 };
    const currSet = new Set<string>();
    const prevSet = new Set<string>();
    const nowDate = new Date();
    const month = nowDate.getMonth();
    const year = nowDate.getFullYear();
    const prevDate = new Date(year, month - 1, 1);
    orders.forEach((order) => {
      const d = new Date(order.createdAt ?? order.created_at);
      if (Number.isNaN(d.getTime())) return;
      const total = order.total ?? order.total_price ?? 0;
      if (d.getMonth() === month && d.getFullYear() === year) {
        current.revenue += total;
        current.orders += 1;
        if (order.customerName) currSet.add(order.customerName);
      }
      if (d.getMonth() === prevDate.getMonth() && d.getFullYear() === prevDate.getFullYear()) {
        previous.revenue += total;
        previous.orders += 1;
        if (order.customerName) prevSet.add(order.customerName);
      }
    });
    current.avgOrderValue = current.orders ? current.revenue / current.orders : 0;
    previous.avgOrderValue = previous.orders ? previous.revenue / previous.orders : 0;
    current.newCustomers = currSet.size;
    previous.newCustomers = prevSet.size;
    return { currentMonth: current, previousMonth: previous };
  }, [orders]);

  const hourlyOrders = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, orders: 0, revenue: 0 }));
    const todayKey = now.toISOString().slice(0, 10);
    orders.forEach((order) => {
      const d = new Date(order.createdAt ?? order.created_at);
      if (Number.isNaN(d.getTime())) return;
      if (d.toISOString().slice(0, 10) !== todayKey) return;
      const row = hours[d.getHours()];
      row.orders += 1;
      row.revenue += order.total ?? order.total_price ?? 0;
    });
    return hours.slice(8, 23);
  }, [orders, now]);

  const categoryRevenue = useMemo(() => {
    const map = new Map<string, { category: string; revenue: number; orders: number; percentage: number }>();
    let totalRevenue = 0;
    orders.forEach((order) => {
      const total = order.total ?? order.total_price ?? 0;
      totalRevenue += total;
      (order.items || []).forEach((item: any) => {
        const category = menuById[item.menuItemId]?.category ?? 'other';
        const existing = map.get(category) ?? { category, revenue: 0, orders: 0, percentage: 0 };
        const itemRev = item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 1);
        existing.revenue += itemRev;
        existing.orders += item.quantity ?? 1;
        map.set(category, existing);
      });
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, percentage: totalRevenue ? Math.round((r.revenue / totalRevenue) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [orders, menuById]);

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
  const revenueChange = (
  (monthlyComparison.currentMonth.revenue -
  monthlyComparison.previousMonth.revenue) /
  monthlyComparison.previousMonth.revenue *
  100).
  toFixed(1);
  const ordersChange = (
  (monthlyComparison.currentMonth.orders -
  monthlyComparison.previousMonth.orders) /
  monthlyComparison.previousMonth.orders *
  100).
  toFixed(1);
  const currentRevenue =
    timeRange === 'today'
      ? weeklyRevenue[weeklyRevenue.length - 1]?.revenue ?? 0
      : timeRange === 'week'
      ? weeklyRevenue.reduce((s, d) => s + d.revenue, 0)
      : monthlyComparison.currentMonth.revenue;
  const currentOrders =
    timeRange === 'today'
      ? weeklyRevenue[weeklyRevenue.length - 1]?.orders ?? 0
      : timeRange === 'week'
      ? weeklyRevenue.reduce((s, d) => s + d.orders, 0)
      : monthlyComparison.currentMonth.orders;
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Analytics</h1>
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

        {/* Month Comparison */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">
              {timeRange === 'today'
                ? 'Revenue Today'
                : timeRange === 'week'
                ? 'Revenue This Week'
                : 'Monthly Revenue'}
            </p>
            <p className="text-2xl font-bold text-white">
              {formatPrice(currentRevenue)}
            </p>
            <div
              className={`flex items-center gap-1 text-sm mt-1 ${parseFloat(revenueChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>

              {parseFloat(revenueChange) >= 0 ?
              <TrendingUpIcon className="w-4 h-4" /> :

              <TrendingDownIcon className="w-4 h-4" />
              }
              <span>{revenueChange}% vs last month</span>
            </div>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">
              {timeRange === 'today'
                ? 'Orders Today'
                : timeRange === 'week'
                ? 'Orders This Week'
                : 'Monthly Orders'}
            </p>
            <p className="text-2xl font-bold text-white">
              {currentOrders.toLocaleString()}
            </p>
            <div
              className={`flex items-center gap-1 text-sm mt-1 ${parseFloat(ordersChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>

              {parseFloat(ordersChange) >= 0 ?
              <TrendingUpIcon className="w-4 h-4" /> :

              <TrendingDownIcon className="w-4 h-4" />
              }
              <span>{ordersChange}% vs last month</span>
            </div>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Avg Order Value</p>
            <p className="text-2xl font-bold text-white">
              {formatPrice(monthlyComparison.currentMonth.avgOrderValue)}
            </p>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">New Customers</p>
            <p className="text-2xl font-bold text-white">
              {monthlyComparison.currentMonth.newCustomers}
            </p>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Revenue Trend */}
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Revenue Trend
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={weeklyRevenue.map((d) => ({
                    ...d,
                    date: new Date(d.date).toLocaleDateString('en-US', {
                      weekday: 'short'
                    })
                  }))}>

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
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />

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
            <h3 className="text-lg font-semibold text-white mb-4">
              Orders by Hour
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
            <h3 className="text-lg font-semibold text-white mb-4">
              Revenue by Category
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
                      <span className="text-sm font-medium text-white">
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
            <h3 className="text-lg font-semibold text-white mb-4">
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
          <h3 className="text-lg font-semibold text-white mb-4">
            Daily Orders & Revenue
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={weeklyRevenue.map((d) => ({
                  ...d,
                  date: new Date(d.date).toLocaleDateString('en-US', {
                    weekday: 'short'
                  })
                }))}>

                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis yAxisId="left" stroke="#64748b" fontSize={12} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />

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
      </div>
    </div>);

}