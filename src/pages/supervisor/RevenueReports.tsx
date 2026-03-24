import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell } from
'recharts';
import { CalendarIcon, DownloadIcon, TrendingUpIcon, TrendingDownIcon, FileTextIcon, FilterIcon } from 'lucide-react';
import { fetchOrders } from '../../api/orders';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPrice } from '../../utils/currency';
import { downloadCsv, buildOrdersCsv } from '../../utils/csv';
import type { Order } from '../../types/orders';

export function RevenueReports() {
  const [dateRange, setDateRange] = useState('week');
  const [activeView, setActiveView] = useState<'revenue' | 'orders'>('revenue');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const dateRangeTabs = [
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
  }];

  const viewTabs = [
    { id: 'revenue', label: 'Revenue' },
    { id: 'orders', label: 'Orders' }
  ];

  // Fetch orders on mount (use API data)
  useEffect(() => {
    async function loadOrders() {
      setOrdersLoading(true);
      try {
        const data = await fetchOrders('all');
        setOrders(data);
      } catch (err) {
        console.warn('Failed to load orders for revenue reports:', err);
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    }
    loadOrders();
  }, []);

  // Filter orders by date range
  const filteredOrders = orders.filter(order => {
    const orderDate = new Date(order.createdAt);
    const now = new Date();
    
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    
    if (dateRange === 'today') {
      return orderDate.toDateString() === now.toDateString();
    } else if (dateRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return orderDate >= weekAgo;
    } else if (dateRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return orderDate >= monthAgo;
    }
    return true;
  });

  const handleExportOrders = () => {
    const csv = buildOrdersCsv(filteredOrders);
    const filename = `orders-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsv(filename, csv);
  };

  const filteredByRange = orders.filter((order) => {
    const orderDate = new Date(order.createdAt);
    const now = new Date();
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (dateRange === 'today') {
      return orderDate.toDateString() === now.toDateString();
    }
    if (dateRange === 'week') {
      return orderDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (dateRange === 'month') {
      return orderDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return true;
  });

  const totalRevenue = filteredByRange.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = filteredByRange.length;
  const dailyRevenue = [...Array(7)].map((_, idx) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - idx));
    const dayKey = day.toDateString();
    const revenue = filteredByRange
      .filter((o) => new Date(o.createdAt).toDateString() === dayKey)
      .reduce((sum, o) => sum + o.total, 0);
    return { date: dayKey, revenue };
  });

  const categoryMap = new Map<string, { revenue: number; orders: number }>();
  const itemMap = new Map<string, { revenue: number; orderCount: number }>();
  const tableMap = new Map<number, { totalRevenue: number; totalOrders: number }>();
  filteredByRange.forEach((order) => {
    order.items?.forEach((item) => {
      const category = item.menuItemName || item.menuItemId || 'Unknown';
      const current = categoryMap.get(category) || { revenue: 0, orders: 0 };
      current.revenue += item.totalPrice || item.unitPrice * item.quantity || 0;
      current.orders += 1;
      categoryMap.set(category, current);

      const itemCurrent = itemMap.get(item.menuItemName || item.menuItemId || 'Unknown') || { revenue: 0, orderCount: 0 };
      itemCurrent.revenue += item.totalPrice || item.unitPrice * item.quantity || 0;
      itemCurrent.orderCount += item.quantity || 1;
      itemMap.set(item.menuItemName || item.menuItemId || 'Unknown', itemCurrent);
    });

    if (order.tableNumber != null) {
      const tableStats = tableMap.get(order.tableNumber) || { totalRevenue: 0, totalOrders: 0 };
      tableStats.totalRevenue += order.total;
      tableStats.totalOrders += 1;
      tableMap.set(order.tableNumber, tableStats);
    }
  });

  const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#6b7280'];
  const categoryData = Array.from(categoryMap.entries()).map(([category, value], index) => ({
    category,
    revenue: value.revenue,
    percentage: totalRevenue > 0 ? Math.round((value.revenue / totalRevenue) * 100) : 0,
    color: COLORS[index % COLORS.length]
  }));
  const popularItems = Array.from(itemMap.entries())
    .map(([name, v]) => ({ item: { name }, revenue: v.revenue, orderCount: v.orderCount }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const tablePerformance = Array.from(tableMap.entries())
    .map(([tableNumber, v]) => ({
      tableNumber,
      totalOrders: v.totalOrders,
      totalRevenue: v.totalRevenue,
      avgOrderValue: v.totalOrders > 0 ? v.totalRevenue / v.totalOrders : 0,
      avgTurnoverTime: 25
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const now = new Date();
  const rangeDays = dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30;
  const rangeStart = new Date(now.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);
  const previousStart = new Date(rangeStart.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  const revenueInRange = filteredByRange.reduce((sum, order) => sum + order.total, 0);
  const revenuePrevious = orders
    .filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= previousStart && createdAt < rangeStart;
    })
    .reduce((sum, order) => sum + order.total, 0);

  const revenueChange = revenuePrevious > 0 ? ((revenueInRange - revenuePrevious) / revenuePrevious) * 100 : 0;
  const formattedChange = revenuePrevious > 0 ? `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% vs last period` : 'No prior period data';

  const ordersPrevious = orders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt >= previousStart && createdAt < rangeStart;
  }).length;
  const orderChange = ordersPrevious > 0 ? ((filteredByRange.length - ordersPrevious) / ordersPrevious) * 100 : 0;
  const formattedOrderChange = ordersPrevious > 0 ? `${orderChange >= 0 ? '+' : ''}${orderChange.toFixed(1)}% vs last period` : 'No prior period data';

  const peakDayData = dailyRevenue.reduce(
    (best, day) => (day.revenue > best.revenue ? day : best),
    { date: dailyRevenue[0]?.date || now.toDateString(), revenue: 0 }
  );
  const peakDayLabel = peakDayData?.date ? new Date(peakDayData.date).toLocaleDateString('en-US', { weekday: 'long' }) : 'N/A';
  const peakDayRevenue = peakDayData?.revenue || 0;

  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-100 mb-2">
              {activeView === 'orders' ? 'Orders' : 'Revenue Reports'}
            </h1>
            <p className="text-slate-400">
              {activeView === 'orders' ? 'View and export order history' : 'Detailed financial analytics and insights'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="secondary" 
              className="flex items-center gap-2"
              onClick={activeView === 'orders' ? handleExportOrders : undefined}
            >
              <DownloadIcon className="w-4 h-4" />
              {activeView === 'orders' ? 'Export CSV' : 'Export'}
            </Button>
          </div>
        </motion.div>

        {/* View Toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6">
          <Tabs
            tabs={viewTabs}
            activeTab={activeView}
            onTabChange={(id) => setActiveView(id as 'revenue' | 'orders')}
            variant="pills" />
        </motion.div>

        {/* Date Range Selector */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mb-6">
          <Tabs
            tabs={dateRangeTabs}
            activeTab={dateRange}
            onTabChange={setDateRange}
            variant="pills" />

        </motion.div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Total Revenue</p>
              <p className="text-2xl font-bold text-white">
                {formatPrice(totalRevenue)}
              </p>
              <div className="flex items-center gap-1 text-green-400 text-xs mt-2">
                <TrendingUpIcon className="w-3.5 h-3.5" />
                <span className="font-medium">{formattedChange}</span>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Total Orders</p>
              <p className="text-2xl font-bold text-white">{totalOrders}</p>
              <div className="flex items-center gap-1 text-green-400 text-xs mt-2">
                <TrendingUpIcon className="w-3.5 h-3.5" />
                <span className="font-medium">{formattedOrderChange}</span>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Avg Order Value</p>
              <p className="text-2xl font-bold text-white">
                {formatPrice(totalOrders > 0 ? totalRevenue / totalOrders : 0)}
              </p>
              <p className="text-xs text-slate-400 mt-2">Per order</p>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Peak Day</p>
              <p className="text-2xl font-bold text-white">{peakDayLabel}</p>
              <p className="text-xs text-amber-300 font-medium mt-2">
                {peakDayRevenue > 0 ? `${formatPrice(peakDayRevenue)} revenue` : 'No revenue data'}
              </p>
            </Card>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Revenue by Day */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUpIcon className="w-5 h-5 text-amber-400" />
                Daily Revenue
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyRevenue.map((d) => ({
                      ...d,
                      date: new Date(d.date).toLocaleDateString('en-US', {
                        weekday: 'short'
                      })
                    }))}>

                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />

                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '2px solid #f59e0b',
                        borderRadius: '12px',
                        color: '#fff'
                      }}
                      formatter={(value: number) => [
                      formatPrice(value),
                      'Revenue']
                      } />

                    <Bar dataKey="revenue" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Revenue by Category */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4">
                Revenue by Category
              </h3>
              <div className="h-64 flex items-center">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="revenue">

                      {categoryData.map((entry, index) =>
                      <Cell key={`cell-${index}`} fill={entry.color} />
                      )}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '2px solid #f59e0b',
                        borderRadius: '12px'
                      }}
                      formatter={(value: number) => [
                      formatPrice(value),
                      'Revenue']
                      } />

                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {categoryData.map((cat, i) =>
                  <motion.div key={cat.category} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + i * 0.05 }} className="flex items-center gap-2">
                      <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: cat.color
                      }} />

                      <span className="text-sm text-slate-300 flex-1">
                        {cat.name}
                      </span>
                      <span className="text-sm font-medium text-gray-100">
                        {cat.percentage}%
                      </span>
                    </motion.div>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Top Selling Items */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-amber-400" />
              Top Selling Items
            </h3>
            <div className="space-y-4">
              {popularItems.length === 0 ? (
                <div className="p-4 text-slate-300">No revenue item data available yet.</div>
              ) : popularItems.slice(0, 5).map((item, index) =>
              <motion.div key={`${item.item.name}-${index}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.55 + index * 0.05 }} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-700/30 transition">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-100">
                        {item.item.name}
                      </span>
                      <span className="text-amber-400 font-bold">
                        {formatPrice(item.revenue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                      value={item.orderCount}
                      max={popularItems[0]?.orderCount || 1}
                      size="sm"
                      className="flex-1" />

                      <span className="text-xs text-slate-400 w-20 text-right">
                        {item.orderCount} orders
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Table Performance */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">
              Table Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Table
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Avg Order
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Turnover
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {tablePerformance.slice(0, 10).map((table, idx) =>
                  <motion.tr key={table.tableNumber} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + idx * 0.02 }} className="hover:bg-slate-700/30 transition">
                      <td className="px-4 py-3 text-sm font-bold text-white">
                        Table {table.tableNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {table.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-400">
                        {formatPrice(table.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {formatPrice(table.avgOrderValue)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {table.avgTurnoverTime} min
                      </td>
                    </motion.tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* ORDERS VIEW */}
        {activeView === 'orders' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Status Filter */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <FilterIcon className="w-4 h-4" />
                <span className="text-sm">Status:</span>
              </div>
              <div className="flex gap-2">
                {['all', 'pending', 'preparing', 'ready', 'served', 'cancelled'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === status
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders Table */}
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Order #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Table</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {ordersLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          Loading orders...
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          No orders found for the selected filters
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order, idx) => (
                        <motion.tr
                          key={order.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="hover:bg-slate-700/30 transition"
                        >
                          <td className="px-4 py-3 text-sm font-bold text-white">
                            {order.orderNumber}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {order.tableNumber ? `Table ${order.tableNumber}` : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              order.status === 'served' ? 'bg-green-500/20 text-green-400' :
                              order.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                              order.status === 'preparing' ? 'bg-amber-500/20 text-amber-400' :
                              order.status === 'pending' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {order.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {order.items.map(i => `${i.quantity}× ${i.menuItemName}`).join(', ')}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-amber-400">
                            {formatPrice(order.total)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {new Date(order.createdAt).toLocaleTimeString()}
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Summary */}
              <div className="border-t border-slate-700 p-4 flex items-center justify-between">
                <div className="text-sm text-slate-400">
                  Showing <span className="text-gray-100 font-bold">{filteredOrders.length}</span> orders
                </div>
                <div className="text-sm text-slate-400">
                  Total: <span className="text-amber-400 font-bold">{formatPrice(filteredOrders.reduce((sum, o) => sum + o.total, 0))}</span>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>);

}