import React, { useState } from 'react';
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
  Area } from
'recharts';
import { CalendarIcon, TrendingUpIcon, TrendingDownIcon } from 'lucide-react';
import {
  weeklyRevenue,
  hourlyOrders,
  categoryRevenue,
  monthlyComparison,
  peakHoursData } from
'../../data/analyticsData';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { formatPrice } from '../../utils/currency';
export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('week');
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