import React, { useState } from 'react';
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
import { CalendarIcon, DownloadIcon, TrendingUpIcon } from 'lucide-react';
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
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Revenue Reports</h1>
            <p className="text-slate-400">Detailed financial analytics</p>
          </div>
          <Button variant="secondary">
            <DownloadIcon className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Date Range Selector */}
        <div className="mb-6">
          <Tabs
            tabs={dateRangeTabs}
            activeTab={dateRange}
            onTabChange={setDateRange}
            variant="pills" />

        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Total Revenue</p>
            <p className="text-2xl font-bold text-white">
              {formatPrice(totalRevenue)}
            </p>
            <div className="flex items-center gap-1 text-green-400 text-sm mt-1">
              <TrendingUpIcon className="w-4 h-4" />
              <span>+12.5% vs last week</span>
            </div>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Total Orders</p>
            <p className="text-2xl font-bold text-white">{totalOrders}</p>
            <div className="flex items-center gap-1 text-green-400 text-sm mt-1">
              <TrendingUpIcon className="w-4 h-4" />
              <span>+8.2% vs last week</span>
            </div>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Avg Order Value</p>
            <p className="text-2xl font-bold text-white">
              {formatPrice(totalRevenue / totalOrders)}
            </p>
          </Card>
          <Card className="bg-slate-800">
            <p className="text-sm text-slate-400 mb-1">Peak Day</p>
            <p className="text-2xl font-bold text-white">Saturday</p>
            <p className="text-sm text-slate-400">
              {formatPrice(8957000)} revenue
            </p>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Revenue by Day */}
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
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

                  <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Revenue by Category */}
          <Card className="bg-slate-800">
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
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [
                    formatPrice(value),
                    'Revenue']
                    } />

                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {categoryData.map((cat, i) =>
                <div key={cat.category} className="flex items-center gap-2">
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
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Top Selling Items */}
        <Card className="bg-slate-800 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Top Selling Items
          </h3>
          <div className="space-y-4">
            {popularItems.slice(0, 5).map((item, index) =>
            <div key={item.item.id} className="flex items-center gap-4">
                <span className="text-2xl w-10 text-center">
                  {item.item.emoji}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">
                      {item.item.name}
                    </span>
                    <span className="text-amber-400 font-semibold">
                      {formatPrice(item.revenue)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar
                    value={item.orderCount}
                    max={popularItems[0].orderCount}
                    size="sm"
                    className="flex-1" />

                    <span className="text-sm text-slate-400 w-20 text-right">
                      {item.orderCount} orders
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Table Performance */}
        <Card className="bg-slate-800">
          <h3 className="text-lg font-semibold text-white mb-4">
            Table Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
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
              <tbody className="divide-y divide-slate-700">
                {tablePerformance.slice(0, 10).map((table) =>
                <tr key={table.tableNumber} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      Table {table.tableNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {table.totalOrders}
                    </td>
                    <td className="px-4 py-3 text-sm text-amber-400 font-medium">
                      {formatPrice(table.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatPrice(table.avgOrderValue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {table.avgTurnoverTime} min
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>);

}