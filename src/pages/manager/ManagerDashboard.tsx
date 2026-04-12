import React from 'react';
import { Button } from '../../components/ui/Button';
import { MenuIcon, QrCodeIcon } from 'lucide-react';
import { AIInsightsChat } from '../../components/manager/AIInsightsChat';
import { useInventoryData } from '../../hooks/useInventory';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';

interface ManagerDashboardProps {
  onNavigate: (page: 'dashboard' | 'menu' | 'staff' | 'analytics' | 'performance' | 'qrcodes' | 'inventory' | 'history') => void;
  totalOrders: number;
  activeOrders: number;
  servedOrders: number;
  todaysRevenue: number;
  tableCount: number;
  ordersByHour: { hour: string; orders: number }[];
  statusBreakdown: { status: string; count: number }[];
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  verified: '#6366f1',
  preparing: '#10b981',
  ready: '#14b8a6',
  served: '#22c55e'
};

export function ManagerDashboard({ onNavigate, totalOrders, activeOrders, servedOrders, todaysRevenue, tableCount, ordersByHour, statusBreakdown }: ManagerDashboardProps) {
  const { forecasts, forecastAlerts, isGeneratingForecasts, runForecasting } = useInventoryData();

  return (
    <div className="bg-slate-900 text-slate-100 p-4 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-100">Manager Dashboard</h1>
            <p className="text-slate-300">High-level operations overview for your restaurant.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onNavigate('menu')}>
              <MenuIcon className="w-4 h-4 mr-1" /> Manage Menu
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('qrcodes')}>
              <QrCodeIcon className="w-4 h-4 mr-1" /> QR Codes
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total Orders</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{totalOrders}</div>
            <div className="text-xs text-slate-300 mt-1">All-time</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Active Orders</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{activeOrders}</div>
            <div className="text-xs text-slate-300 mt-1">In kitchen + ready</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Served Orders</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{servedOrders}</div>
            <div className="text-xs text-slate-300 mt-1">Completed today</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Tables</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{tableCount}</div>
            <div className="text-xs text-slate-300 mt-1">Configured tables</div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Orders Trend</div>
                <div className="text-lg font-semibold text-gray-100">Last 12 hours</div>
              </div>
              <div className="text-xs text-slate-300">Live updates</div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ordersByHour}>
                  <defs>
                    <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="orders" stroke="#38bdf8" fill="url(#ordersGradient)" fillOpacity={1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Order Status Breakdown</div>
              <div className="text-lg font-semibold text-gray-100">Current</div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="count" nameKey="status" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {statusBreakdown.map((entry) => (
                      <Cell key={entry.status} fill={statusColors[entry.status] ?? '#8b5cf6'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Revenue</div>
          <div className="text-lg font-semibold text-gray-100">Today: ${(todaysRevenue / 100).toFixed(2)}</div>
          <div className="mt-2 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ordersByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Insights Chat */}
      <AIInsightsChat
        forecasts={forecasts}
        alerts={forecastAlerts}
        onGenerateForecasts={runForecasting}
        isGenerating={isGeneratingForecasts}
      />
    </div>
  );
}
