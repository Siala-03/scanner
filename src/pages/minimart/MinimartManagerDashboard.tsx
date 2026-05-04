import { useState, useEffect, useCallback } from 'react';
import {
  LogOutIcon, RefreshCwIcon, TrendingUpIcon, ReceiptIcon,
  ShoppingBagIcon, UsersIcon, PlusIcon, TrashIcon, EyeIcon, EyeOffIcon,
  PackageIcon,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { signUpStaff, deleteStaff, fetchAllStaff } from '../../api/auth';
import { formatPrice } from '../../utils/currency';
import { InventoryManagement } from '../shared/InventoryManagement';
import { MinimartProductManagement } from './MinimartProductManagement';
import type { Staff } from '../../types';

interface Transaction {
  id: string;
  orderNumber: string;
  cashierName: string;
  total: number;
  paymentMethod: string;
  itemCount: number;
  items: any[];
  createdAt: string;
}

interface DailyBar {
  day: string;
  revenue: number;
  count: number;
}

interface ProductStat {
  name: string;
  qty: number;
  revenue: number;
}

interface Summary {
  revenue: number;
  transactions: number;
  avgSale: number;
  byCashier: Record<string, { count: number; revenue: number }>;
  byPayment: Record<string, { count: number; revenue: number }>;
  dailyBars: DailyBar[];
  topProducts: ProductStat[];
}

interface AddForm {
  name: string;
  username: string;
  password: string;
  phone: string;
}

const EMPTY_FORM: AddForm = { name: '', username: '', password: '', phone: '' };

interface Props {
  restaurantId: string;
  restaurantName: string;
  manager: Staff;
  onLogout: () => void;
}

type DateFilter = 'today' | '7d' | '30d';
type Page = 'dashboard' | 'transactions' | 'products' | 'inventory' | 'cashiers';

const PAYMENT_LABEL: Record<string, string> = {
  '01': 'Cash', '02': 'Card', '04': 'Mobile Money',
};

function buildDailyBars(txns: Transaction[], days: number): DailyBar[] {
  const bars: DailyBar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    bars.push({
      day: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      revenue: 0,
      count: 0,
    });
  }
  txns.forEach((t) => {
    const key = new Date(t.createdAt).toLocaleDateString('en-US', {
      weekday: 'short', month: 'numeric', day: 'numeric',
    });
    const bar = bars.find((b) => b.day === key);
    if (bar) { bar.revenue += t.total; bar.count += 1; }
  });
  return bars;
}

export function MinimartManagerDashboard({ restaurantId, restaurantName, manager, onLogout }: Props) {
  const [page, setPage] = useState<Page>('dashboard');
  const [dateFilter, setDateFilter] = useState<DateFilter>('7d');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({
    revenue: 0, transactions: 0, avgSale: 0,
    byCashier: {}, byPayment: {}, dailyBars: [], topProducts: [],
  });
  const [loading, setLoading] = useState(true);

  // Cashiers tab
  const [cashiers, setCashiers] = useState<Staff[]>([]);
  const [cashiersLoading, setCashiersLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now);
      if (dateFilter === 'today') {
        from.setHours(0, 0, 0, 0);
      } else if (dateFilter === '7d') {
        from.setDate(from.getDate() - 7);
      } else {
        from.setDate(from.getDate() - 30);
      }

      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total, payment_type, items, created_at, payment_confirmed_by_name')
        .eq('restaurant_id', restaurantId)
        .eq('payment_status', 'confirmed')
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const txns: Transaction[] = (data || []).map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number || o.id.slice(-6).toUpperCase(),
        cashierName: o.payment_confirmed_by_name || 'Cashier',
        total: o.total || 0,
        paymentMethod: PAYMENT_LABEL[o.payment_type] || o.payment_type || 'Cash',
        itemCount: Array.isArray(o.items)
          ? o.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0)
          : 0,
        items: Array.isArray(o.items) ? o.items : [],
        createdAt: o.created_at,
      }));

      const revenue = txns.reduce((s, t) => s + t.total, 0);

      const byCashier: Record<string, { count: number; revenue: number }> = {};
      const byPayment: Record<string, { count: number; revenue: number }> = {};
      const productMap: Record<string, { qty: number; revenue: number }> = {};

      txns.forEach((t) => {
        if (!byCashier[t.cashierName]) byCashier[t.cashierName] = { count: 0, revenue: 0 };
        byCashier[t.cashierName].count += 1;
        byCashier[t.cashierName].revenue += t.total;

        const pm = t.paymentMethod;
        if (!byPayment[pm]) byPayment[pm] = { count: 0, revenue: 0 };
        byPayment[pm].count += 1;
        byPayment[pm].revenue += t.total;

        t.items.forEach((item: any) => {
          const name = item.menu_item_name || item.menuItemName || item.name || 'Unknown';
          const qty = item.quantity || 1;
          const rev = item.total_price || item.totalPrice || item.unit_price * qty || 0;
          if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
          productMap[name].qty += qty;
          productMap[name].revenue += rev;
        });
      });

      const topProducts = Object.entries(productMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      const days = dateFilter === 'today' ? 1 : dateFilter === '7d' ? 7 : 30;
      const dailyBars = buildDailyBars(txns, days);

      setTransactions(txns);
      setSummary({
        revenue,
        transactions: txns.length,
        avgSale: txns.length > 0 ? revenue / txns.length : 0,
        byCashier, byPayment, dailyBars, topProducts,
      });
    } catch (err) {
      console.error('Failed to load minimart transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, dateFilter]);

  const loadCashiers = useCallback(async () => {
    setCashiersLoading(true);
    try {
      const all = await fetchAllStaff();
      setCashiers(all.filter((s) => s.role === 'cashier' && s.restaurantId === restaurantId));
    } catch (err) {
      console.error('Failed to load cashiers:', err);
    } finally {
      setCashiersLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (page === 'cashiers') loadCashiers(); }, [page, loadCashiers]);

  const handleAddCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.name.trim() || !addForm.username.trim() || !addForm.password.trim()) {
      setAddError('Name, username and password are required.');
      return;
    }
    setAddSaving(true);
    try {
      await signUpStaff({
        name: addForm.name.trim(),
        username: addForm.username.trim(),
        password: addForm.password,
        phone: addForm.phone.trim(),
        email: '',
        role: 'cashier',
        restaurantId,
      });
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      loadCashiers();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to create cashier account.');
    } finally {
      setAddSaving(false);
    }
  };

  const handleDeleteCashier = async (id: string) => {
    if (!window.confirm('Remove this cashier account?')) return;
    setDeletingId(id);
    try {
      await deleteStaff(id);
      setCashiers((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Failed to remove cashier.');
    } finally {
      setDeletingId(null);
    }
  };

  const maxBarRevenue = Math.max(...summary.dailyBars.map((b) => b.revenue), 1);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium">Minimart Manager</p>
            <p className="font-semibold text-slate-100 truncate">{restaurantName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 hidden sm:block">{manager.name}</span>
            <button
              onClick={load}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onLogout} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 transition-colors">
              <LogOutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 pb-3 flex gap-1 overflow-x-auto">
          {(['dashboard', 'transactions', 'products', 'inventory', 'cashiers'] as Page[]).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                page === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">

        {/* ── Dashboard ── */}
        {page === 'dashboard' && (
          <>
            {/* Date filter */}
            <div className="flex gap-2 mb-6">
              {(['today', '7d', '30d'] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    dateFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'today' ? 'Today' : f === '7d' ? 'Last 7 days' : 'Last 30 days'}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-slate-400">
                <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : (
              <div className="space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <TrendingUpIcon className="w-3.5 h-3.5" /> Revenue
                    </div>
                    <p className="text-2xl font-bold">{formatPrice(summary.revenue)}</p>
                    <p className="text-xs text-slate-500 mt-1">Confirmed sales only</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <ReceiptIcon className="w-3.5 h-3.5" /> Transactions
                    </div>
                    <p className="text-2xl font-bold">{summary.transactions}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <ShoppingBagIcon className="w-3.5 h-3.5" /> Avg. Sale
                    </div>
                    <p className="text-2xl font-bold">{formatPrice(summary.avgSale)}</p>
                  </div>
                </div>

                {/* Revenue bar chart */}
                {summary.dailyBars.length > 1 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-4">Daily Revenue</p>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary.dailyBars} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
                          <XAxis
                            dataKey="day"
                            stroke="#64748b"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #4f46e5', borderRadius: 10, color: '#fff' }}
                            formatter={(v: number) => [formatPrice(v), 'Revenue']}
                            labelStyle={{ color: '#818cf8' }}
                          />
                          <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                            {summary.dailyBars.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={entry.revenue === maxBarRevenue && entry.revenue > 0 ? '#6366f1' : '#334155'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Payment breakdown */}
                  {Object.keys(summary.byPayment).length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-4">Payment Methods</p>
                      <div className="space-y-3">
                        {Object.entries(summary.byPayment)
                          .sort((a, b) => b[1].revenue - a[1].revenue)
                          .map(([method, stats]) => {
                            const pct = summary.revenue > 0 ? (stats.revenue / summary.revenue) * 100 : 0;
                            return (
                              <div key={method}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-300">{method}</span>
                                  <span className="text-slate-400">{stats.count} sales · {formatPrice(stats.revenue)}</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full">
                                  <div
                                    className="h-1.5 bg-indigo-500 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Top products */}
                  {summary.topProducts.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-4">
                        <PackageIcon className="w-3.5 h-3.5" /> Top Products
                      </div>
                      <div className="space-y-2">
                        {summary.topProducts.map((p, i) => (
                          <div key={p.name} className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 w-4 shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-200 truncate">{p.name}</p>
                              <p className="text-xs text-slate-500">{p.qty} sold</p>
                            </div>
                            <p className="text-xs font-semibold text-indigo-400 shrink-0">{formatPrice(p.revenue)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cashier activity */}
                {Object.keys(summary.byCashier).length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-4">
                      <UsersIcon className="w-3.5 h-3.5" /> Cashier Activity
                    </div>
                    <div className="space-y-3">
                      {Object.entries(summary.byCashier)
                        .sort((a, b) => b[1].revenue - a[1].revenue)
                        .map(([name, stats]) => (
                          <div key={name} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-200">{name}</p>
                              <p className="text-xs text-slate-500">{stats.count} transaction{stats.count !== 1 ? 's' : ''}</p>
                            </div>
                            <p className="text-sm font-semibold text-indigo-400">{formatPrice(stats.revenue)}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {summary.transactions === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                    <ReceiptIcon className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No sales recorded for this period</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Transactions ── */}
        {page === 'transactions' && (
          <>
            <div className="flex gap-2 mb-6">
              {(['today', '7d', '30d'] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    dateFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'today' ? 'Today' : f === '7d' ? 'Last 7 days' : 'Last 30 days'}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-slate-400">
                  <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                  <ReceiptIcon className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No transactions found</p>
                </div>
              ) : (
                transactions.map((t) => (
                  <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-100">#{t.orderNumber}</p>
                        <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full">{t.paymentMethod}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.cashierName} · {t.itemCount} item{t.itemCount !== 1 ? 's' : ''} ·{' '}
                        {new Date(t.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400 shrink-0">{formatPrice(t.total)}</p>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ── Products ── */}
        {page === 'products' && (
          <MinimartProductManagement />
        )}

        {/* ── Inventory ── */}
        {page === 'inventory' && (
          <InventoryManagement role="manager" />
        )}

        {/* ── Cashiers ── */}
        {page === 'cashiers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Cashier Accounts</h2>
              <button
                onClick={() => { setShowAddForm((v) => !v); setAddError(''); setAddForm(EMPTY_FORM); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                <PlusIcon className="w-4 h-4" /> Add Cashier
              </button>
            </div>

            {showAddForm && (
              <form
                onSubmit={handleAddCashier}
                className="bg-slate-900 border border-indigo-600/40 rounded-2xl p-5 space-y-4"
              >
                <p className="text-sm font-semibold text-slate-200">New Cashier Account</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Full Name *</label>
                    <input
                      value={addForm.name}
                      onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Jane Doe"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Phone</label>
                    <input
                      value={addForm.phone}
                      onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="e.g. 0788000000"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Username *</label>
                    <input
                      value={addForm.username}
                      onChange={(e) => setAddForm((p) => ({ ...p, username: e.target.value }))}
                      placeholder="Login username"
                      autoComplete="off"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Password *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={addForm.password}
                        onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Set a password"
                        autoComplete="new-password"
                        className="w-full px-3 py-2 pr-9 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                {addError && <p className="text-red-400 text-xs">{addError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={addSaving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {addSaving ? 'Creating…' : 'Create Account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {cashiersLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : cashiers.length === 0 && !showAddForm ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                <UsersIcon className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No cashier accounts yet</p>
                <p className="text-xs mt-1">Click "Add Cashier" to create the first one</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cashiers.map((c) => (
                  <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-600/40 flex items-center justify-center text-indigo-300 text-sm font-bold shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{c.name}</p>
                      {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.isOnDuty ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                      {c.isOnDuty ? 'On duty' : 'Off duty'}
                    </span>
                    <button
                      onClick={() => handleDeleteCashier(c.id)}
                      disabled={deletingId === c.id}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
