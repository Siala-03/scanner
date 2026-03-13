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
import {
  weeklyRevenue,
  categoryRevenue,
  popularItems,
  tablePerformance } from
'../../data/analyticsData';
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

  // Fetch orders when switching to orders view
  useEffect(() => {
    if (activeView === 'orders' && orders.length === 0) {
      setOrdersLoading(true);
      fetch('/api/orders')
        .then(res => res.json())
        .then(data => {
          setOrders(data);
          setOrdersLoading(false);
        })
        .catch(() => {
          // Use mock data if API fails
          setOrders([
            {
              id: '1',
              orderNumber: 'ORD-001',
              tableNumber: 5,
              status: 'served',
              items: [{ id: '1', menuItemId: '1', menuItemName: 'Breakfast Platter', quantity: 2, unitPrice: 15000, totalPrice: 30000, status: 'served' }],
              subtotal: 30000,
              tax: 3000,
              total: 33000,
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: '2',
              orderNumber: 'ORD-002',
              tableNumber: 8,
              status: 'served',
              items: [{ id: '2', menuItemId: '2', menuItemName: 'Grilled Chicken', quantity: 1, unitPrice: 12000, totalPrice: 12000, status: 'served' }],
              subtotal: 12000,
              tax: 1200,
              total: 13200,
              createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: '3',
              orderNumber: 'ORD-003',
              tableNumber: 12,
              status: 'ready',
              items: [{ id: '3', menuItemId: '3', menuItemName: 'Fish and Chips', quantity: 2, unitPrice: 18000, totalPrice: 36000, status: 'ready' }],
              subtotal: 36000,
              tax: 3600,
              total: 39600,
              createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]);
          setOrdersLoading(false);
        });
    }
  }, [activeView]);

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

  const totalRevenue = weeklyRevenue.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = weeklyRevenue.reduce((sum, d) => sum + d.orders, 0);
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
  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
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
                <span className="font-medium">+12.5% vs last week</span>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Total Orders</p>
              <p className="text-2xl font-bold text-white">{totalOrders}</p>
              <div className="flex items-center gap-1 text-green-400 text-xs mt-2">
                <TrendingUpIcon className="w-3.5 h-3.5" />
                <span className="font-medium">+8.2% vs last week</span>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Avg Order Value</p>
              <p className="text-2xl font-bold text-white">
                {formatPrice(totalRevenue / totalOrders)}
              </p>
              <p className="text-xs text-slate-400 mt-2">Per order</p>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition">
              <p className="text-sm text-slate-400 font-medium mb-2">Peak Day</p>
              <p className="text-2xl font-bold text-white">Saturday</p>
              <p className="text-xs text-amber-300 font-medium mt-2">
                {formatPrice(8957000)} revenue
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
                    data={weeklyRevenue.map((d) => ({
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
                      <span className="text-sm font-medium text-white">
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
              {popularItems.slice(0, 5).map((item, index) =>
              <motion.div key={item.item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.55 + index * 0.05 }} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-700/30 transition">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-white">
                        {item.item.name}
                      </span>
                      <span className="text-amber-400 font-bold">
                        {formatPrice(item.revenue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                      value={item.orderCount}
                      max={popularItems[0].orderCount}
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
                  Showing <span className="text-white font-bold">{filteredOrders.length}</span> orders
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