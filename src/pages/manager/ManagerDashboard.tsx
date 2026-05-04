import { useMemo, useEffect, useState, useCallback } from 'react';
import { Button } from '../../components/ui/Button';
import { MenuIcon, QrCodeIcon, ClockIcon, CheckCircleIcon, BellIcon, XIcon } from 'lucide-react';
import { AIInsightsChat } from '../../components/manager/AIInsightsChat';
import { useInventoryData } from '../../hooks/useInventory';
import { formatPrice } from '../../utils/currency';
import { supabase } from '../../lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';

interface PaymentNotification {
  id: string;
  orderNumber: string;
  amount: number;
  confirmedByName?: string;
  at: Date;
}

interface ManagerDashboardProps {
  onNavigate: (page: 'dashboard' | 'menu' | 'staff' | 'analytics' | 'performance' | 'qrcodes' | 'inventory' | 'history') => void;
  totalOrders: number;
  activeOrders: number;
  servedOrders: number;
  todaysRevenue: number;
  ordersByHour: { hour: string; orders: number; revenue: number }[];
  statusBreakdown: { status: string; count: number }[];
  pendingPaymentCount?: number;
  pendingPaymentTotal?: number;
  confirmedPaymentCount?: number;
  confirmedPaymentTotal?: number;
  restaurantId?: string;
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  verified: '#6366f1',
  preparing: '#10b981',
  ready: '#14b8a6',
  served: '#22c55e'
};

export function ManagerDashboard({ onNavigate, totalOrders, activeOrders, servedOrders, todaysRevenue, ordersByHour, statusBreakdown, pendingPaymentCount = 0, pendingPaymentTotal = 0, confirmedPaymentCount = 0, confirmedPaymentTotal = 0, restaurantId }: ManagerDashboardProps) {
  const { forecasts, forecastAlerts, isGeneratingForecasts, runForecasting, analytics, inventory } = useInventoryData();
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Realtime subscription — fires when any order's payment_status changes to 'confirmed'
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`manager-payment-notify-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.payment_status === 'confirmed' && (payload.old as any).payment_status !== 'confirmed') {
            const notif: PaymentNotification = {
              id: row.id,
              orderNumber: row.order_number || row.id.slice(-6).toUpperCase(),
              amount: row.total ?? 0,
              confirmedByName: row.payment_confirmed_by_name || undefined,
              at: new Date(),
            };
            setNotifications((prev) => [notif, ...prev].slice(0, 5));
            // Auto-dismiss after 8 seconds
            setTimeout(() => dismissNotification(row.id), 8000);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, dismissNotification]);
  const trackedInventoryCount = useMemo(
    () => new Set(inventory.map((item) => item.menuItemId).filter(Boolean)).size,
    [inventory]
  );

  return (
    <div className="bg-slate-900 text-slate-100 p-3 md:p-4 min-h-screen">
      {/* Payment confirmation toast notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 bg-emerald-900/90 border border-emerald-500/40 rounded-xl p-3 shadow-xl">
              <BellIcon className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-300">Payment Confirmed</p>
                <p className="text-xs text-slate-300">Order #{n.orderNumber} · {formatPrice(n.amount)}</p>
                {n.confirmedByName && <p className="text-xs text-slate-400">by {n.confirmedByName}</p>}
              </div>
              <button onClick={() => dismissNotification(n.id)} className="text-slate-400 hover:text-slate-200 shrink-0">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-100">Manager Dashboard</h1>
            <p className="text-slate-300 text-sm md:text-base">High-level operations overview for your company.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('menu')}>
              <MenuIcon className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Manage Menu</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('inventory')}>
              <QrCodeIcon className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Inventory</span>
            </Button>
          </div>
        </div>

        {/* Order KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Orders Today</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{totalOrders}</div>
            <div className="text-xs text-slate-300 mt-1">Daily order count</div>
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
          <div className="rounded-xl border border-emerald-500/30 p-3 bg-emerald-500/5">
            <div className="text-xs uppercase tracking-wide text-emerald-400">Revenue Today</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-400">{formatPrice(todaysRevenue)}</div>
            <div className="text-xs text-slate-300 mt-1">Confirmed payments only</div>
          </div>
        </div>

        {/* Payment status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-amber-500/30 p-4 bg-amber-500/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <ClockIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-amber-400">Pending Payments</div>
              <div className="text-2xl font-bold text-amber-300 mt-0.5">{pendingPaymentCount} orders</div>
              <div className="text-sm text-amber-200/70">{formatPrice(pendingPaymentTotal)} outstanding</div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 p-4 bg-emerald-500/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-emerald-400">Confirmed Payments</div>
              <div className="text-2xl font-bold text-emerald-300 mt-0.5">{confirmedPaymentCount} orders</div>
              <div className="text-sm text-emerald-200/70">{formatPrice(confirmedPaymentTotal)} collected</div>
            </div>
          </div>
        </div>

        {/* Inventory KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <button 
            onClick={() => onNavigate('inventory')}
            className="rounded-xl border border-slate-700 p-3 bg-slate-800/70 hover:bg-slate-800 transition text-left"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400">Inventory Items</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{trackedInventoryCount}</div>
            <div className="text-xs text-slate-300 mt-1">Tracked items</div>
          </button>
          <button 
            onClick={() => onNavigate('inventory')}
            className="rounded-xl border border-amber-500/30 p-3 bg-amber-500/5 hover:bg-amber-500/10 transition text-left"
          >
            <div className="text-xs uppercase tracking-wide text-amber-400">Low Stock</div>
            <div className="mt-2 text-2xl font-semibold text-amber-400">{analytics.lowStockCount}</div>
            <div className="text-xs text-slate-300 mt-1">Need attention</div>
          </button>
          <button 
            onClick={() => onNavigate('inventory')}
            className="rounded-xl border border-red-500/30 p-3 bg-red-500/5 hover:bg-red-500/10 transition text-left"
          >
            <div className="text-xs uppercase tracking-wide text-red-400">Out of Stock</div>
            <div className="mt-2 text-2xl font-semibold text-red-400">{analytics.outOfStockCount}</div>
            <div className="text-xs text-slate-300 mt-1">Immediate action</div>
          </button>
          <button
            onClick={() => onNavigate('analytics')}
            className="rounded-xl border border-sky-500/30 p-3 bg-sky-500/5 hover:bg-sky-500/10 transition text-left"
          >
            <div className="text-xs uppercase tracking-wide text-sky-400">Stock Value</div>
            <div className="mt-2 text-2xl font-semibold text-sky-400">{formatPrice(analytics.totalStockValue)}</div>
            <div className="text-xs text-slate-300 mt-1">Current inventory value</div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Orders Trend</div>
                <div className="text-lg font-semibold text-gray-100">Last 12 hours</div>
              </div>
              <div className="text-xs text-slate-300">Live updates</div>
            </div>
            <div className="h-48 md:h-52">
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
          <div className="text-lg font-semibold text-gray-100">Today: {formatPrice(todaysRevenue)}</div>
          <div className="mt-2 h-40 md:h-32">
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
