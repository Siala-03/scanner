import React, { useState } from 'react';
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
import { CalendarIcon, DownloadIcon, TrendingUpIcon, TrendingDownIcon } from 'lucide-react';
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
export function RevenueReports() {
  const [dateRange, setDateRange] = useState('week');
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
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Revenue Reports</h1>
            <p className="text-slate-400">Detailed financial analytics and insights</p>
          </div>
          <Button variant="secondary" className="flex items-center gap-2">
            <DownloadIcon className="w-4 h-4" />
            Export
          </Button>
        </motion.div>

        {/* Date Range Selector */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
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
                  <span className="text-3xl w-10 text-center">
                    {item.item.emoji}
                  </span>
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
      </div>
    </div>);

}