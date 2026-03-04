import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer } from
'recharts';
import { StarIcon, TrophyIcon, ClockIcon, DollarSignIcon } from 'lucide-react';
import { mockStaff, getWaiters } from '../../data/staffData';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPrice } from '../../utils/currency';
export function StaffPerformance() {
  const waiters = getWaiters();
  const sortedByRating = [...waiters].sort(
    (a, b) => b.performance.rating - a.performance.rating
  );
  const chartData = waiters.map((w) => ({
    name: w.name.split(' ')[0],
    orders: w.performance.ordersServed,
    revenue: w.performance.totalRevenue,
    rating: w.performance.rating
  }));
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Staff Performance</h1>
          <p className="text-slate-400">Track and compare team performance</p>
        </div>

        {/* Leaderboard */}
        <Card className="bg-slate-800 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrophyIcon className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white">Leaderboard</h3>
          </div>
          <div className="space-y-3">
            {sortedByRating.map((waiter, index) =>
            <div
              key={waiter.id}
              className={`flex items-center gap-4 p-3 rounded-lg ${index === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-700/30'}`}>

                <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${index === 0 ? 'bg-amber-500 text-white' : index === 1 ? 'bg-slate-400 text-white' : index === 2 ? 'bg-orange-700 text-white' : 'bg-slate-600 text-slate-300'}`}>

                  {index + 1}
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium">
                  {waiter.name.
                split(' ').
                map((n) => n[0]).
                join('')}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{waiter.name}</p>
                  <div className="flex items-center gap-1">
                    {Array.from({
                    length: 5
                  }).map((_, i) =>
                  <StarIcon
                    key={i}
                    className={`w-3 h-3 ${i < Math.floor(waiter.performance.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />

                  )}
                    <span className="text-sm text-slate-400 ml-1">
                      {waiter.performance.rating}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-400">
                    {formatPrice(waiter.performance.totalRevenue)}
                  </p>
                  <p className="text-sm text-slate-400">
                    {waiter.performance.ordersServed} orders
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Performance Charts */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Orders Served
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#64748b"
                    fontSize={12}
                    width={60} />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }} />

                  <Bar dataKey="orders" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Revenue Generated
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />

                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#64748b"
                    fontSize={12}
                    width={60} />

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

                  <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Staff Cards */}
        <h3 className="text-lg font-semibold text-white mb-4">
          Individual Performance
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {waiters.map((waiter) =>
          <Card key={waiter.id} className="bg-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium text-lg">
                  {waiter.name.
                split(' ').
                map((n) => n[0]).
                join('')}
                </div>
                <div>
                  <p className="font-semibold text-white">{waiter.name}</p>
                  <Badge
                  variant={waiter.isOnDuty ? 'ready' : 'served'}
                  size="sm">

                    {waiter.isOnDuty ? 'On Duty' : 'Off Duty'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <StarIcon className="w-4 h-4" />
                    <span className="text-sm">Rating</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({
                    length: 5
                  }).map((_, i) =>
                  <StarIcon
                    key={i}
                    className={`w-4 h-4 ${i < Math.floor(waiter.performance.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />

                  )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <ClockIcon className="w-4 h-4" />
                    <span className="text-sm">Avg Service Time</span>
                  </div>
                  <span className="text-white font-medium">
                    {waiter.performance.avgServiceTime} min
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <DollarSignIcon className="w-4 h-4" />
                    <span className="text-sm">Total Revenue</span>
                  </div>
                  <span className="text-amber-400 font-medium">
                    {formatPrice(waiter.performance.totalRevenue)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-700">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Orders Served</span>
                    <span className="text-white">
                      {waiter.performance.ordersServed}
                    </span>
                  </div>
                  <ProgressBar
                  value={waiter.performance.ordersServed}
                  max={1000}
                  size="sm" />

                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>);

}