import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  CalendarIcon, DownloadIcon, TrendingUpIcon, TrendingDownIcon,
  ShoppingCartIcon, DollarSignIcon, UsersIcon, CreditCardIcon,
  XCircleIcon, ReceiptIcon,
} from 'lucide-react';
import { fetchOrdersByDateRange } from '../../api/orders';
import { fetchExpenses, fetchExpenseCategories } from '../../api/expenses';
import { fetchWaiters } from '../../api/staff';
import { useMenu } from '../../hooks/useMenu';
import { formatPrice } from '../../utils/currency';
import { downloadCsv } from '../../utils/csv';
import type { Expense, ExpenseCategory } from '../../types/expenses';
import type { Staff } from '../../types';

// ─── Types & constants ──────────────────────────────────────────────────────

type FilterMode = 'today' | 'week' | 'month' | 'custom';

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#f97316'];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  '01': 'Cash', cash: 'Cash',
  '02': 'Card', card: 'Card', credit_card: 'Card', debit_card: 'Card',
  '03': 'Cheque', cheque: 'Cheque', check: 'Cheque',
  '04': 'Mobile Money', 'mobile money': 'Mobile Money', momo: 'Mobile Money',
  'bank transfer': 'Bank Transfer', bank_transfer: 'Bank Transfer',
};

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  Cash: '#10b981', Card: '#3b82f6', 'Mobile Money': '#f59e0b',
  Cheque: '#8b5cf6', 'Bank Transfer': '#06b6d4',
};

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#94a3b8' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPeriodWindow(mode: FilterMode, customStart: string, customEnd: string) {
  const now = new Date();
  if (mode === 'custom' && customStart && customEnd) {
    const s = new Date(customStart); s.setHours(0, 0, 0, 0);
    const e = new Date(customEnd);   e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (mode === 'week') {
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  } else if (mode === 'month') {
    start.setDate(1);
  }
  return { start, end: now };
}

function getPriorPeriodWindow(mode: FilterMode, current: { start: Date; end: Date }) {
  const duration = current.end.getTime() - current.start.getTime();
  const priorEnd = new Date(current.start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - duration);
  if (mode === 'today') {
    priorStart.setHours(0, 0, 0, 0);
    priorEnd.setHours(23, 59, 59, 999);
  }
  return { start: priorStart, end: priorEnd };
}

function parseOrderDate(order: any): Date | null {
  const d = new Date(order.createdAt ?? order.created_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isConfirmed(order: any) {
  return order.payment_status === 'confirmed' || order.paymentStatus === 'confirmed';
}

function normalizeItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { /* ignore */ }
  }
  return [];
}

function parseBreakdown(raw: any): any[] | null {
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return p; } catch { /* ignore */ }
  }
  return null;
}

function resolveMethodLabel(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const key = raw.toLowerCase().trim();
  return PAYMENT_METHOD_LABELS[key] ?? PAYMENT_METHOD_LABELS[raw] ??
    raw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function pctDelta(current: number, prior: number): { pct: number; up: boolean } {
  if (prior === 0) return { pct: current > 0 ? 100 : 0, up: current >= 0 };
  const pct = Math.round(((current - prior) / prior) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function periodLabel(mode: FilterMode, window: { start: Date; end: Date }): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (mode === 'today') return 'Today';
  if (mode === 'week') return `${fmt(window.start)} – ${fmt(window.end)}`;
  if (mode === 'month') return window.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}

// ─── Section download helper ────────────────────────────────────────────────

function SectionHeader({ title, onDownload }: { title: string; onDownload?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>
      {onDownload && (
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
        >
          <DownloadIcon className="w-3.5 h-3.5" /> CSV
        </button>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReportsPage() {
  const [filterMode, setFilterMode] = useState<FilterMode>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [priorOrders, setPriorOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [waiters, setWaiters] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { menuItems } = useMenu();

  const menuById = useMemo(
    () => Object.fromEntries(menuItems.map((item) => [item.id, item])),
    [menuItems],
  );

  const periodWindow = useMemo(
    () => getPeriodWindow(filterMode, customStart, customEnd),
    [filterMode, customStart, customEnd],
  );

  const priorWindow = useMemo(
    () => getPriorPeriodWindow(filterMode, periodWindow),
    [filterMode, periodWindow],
  );

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const toISO = (d: Date) => d.toISOString();
        const [currentOrders, prevOrders, expData, catData, waiterData] = await Promise.all([
          fetchOrdersByDateRange(toISO(periodWindow.start), toISO(periodWindow.end)),
          fetchOrdersByDateRange(toISO(priorWindow.start), toISO(priorWindow.end)),
          fetchExpenses({
            startDate: periodWindow.start.toISOString().split('T')[0],
            endDate: periodWindow.end.toISOString().split('T')[0],
          }),
          fetchExpenseCategories(),
          fetchWaiters(),
        ]);
        if (!active) return;
        setOrders(currentOrders);
        setPriorOrders(prevOrders);
        setExpenses(expData);
        setExpenseCategories(catData);
        setWaiters(waiterData);
      } catch (e) {
        console.error('Reports fetch error:', e);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [periodWindow, priorWindow]);

  // ─── Filtered orders ──────────────────────────────────────────────────────

  const filteredOrders = useMemo(
    () => orders.filter((o) => {
      const d = parseOrderDate(o);
      return d ? d >= periodWindow.start && d <= periodWindow.end : false;
    }),
    [orders, periodWindow],
  );

  const filteredPriorOrders = useMemo(
    () => priorOrders.filter((o) => {
      const d = parseOrderDate(o);
      return d ? d >= priorWindow.start && d <= priorWindow.end : false;
    }),
    [priorOrders, priorWindow],
  );

  // ─── 1. Executive Summary ─────────────────────────────────────────────────

  const metrics = useMemo(() => {
    let revenue = 0, orderCount = 0;
    filteredOrders.forEach((o) => {
      orderCount++;
      if (isConfirmed(o)) revenue += o.total ?? 0;
    });
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
    return {
      revenue, orders: orderCount,
      avgOrderValue: orderCount > 0 ? revenue / orderCount : 0,
      expenses: totalExpenses,
      netProfit: revenue - totalExpenses,
    };
  }, [filteredOrders, expenses]);

  const priorMetrics = useMemo(() => {
    let revenue = 0, orderCount = 0;
    filteredPriorOrders.forEach((o) => {
      orderCount++;
      if (isConfirmed(o)) revenue += o.total ?? 0;
    });
    return { revenue, orders: orderCount, avgOrderValue: orderCount > 0 ? revenue / orderCount : 0 };
  }, [filteredPriorOrders]);

  // ─── 2. Revenue & Orders Trend ────────────────────────────────────────────

  const periodRevenue = useMemo(() => {
    if (filterMode === 'today') {
      return Array.from({ length: 18 }, (_, i) => {
        const hour = i + 6;
        let revenue = 0, cnt = 0;
        filteredOrders.forEach((o) => {
          const d = parseOrderDate(o);
          if (!d || d.getHours() !== hour) return;
          cnt++;
          if (isConfirmed(o)) revenue += o.total ?? 0;
        });
        return { label: `${hour}:00`, revenue, orders: cnt };
      });
    }
    if (filterMode === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(periodWindow.start);
        day.setDate(day.getDate() + i);
        const s = new Date(day); s.setHours(0, 0, 0, 0);
        const e = new Date(day); e.setHours(23, 59, 59, 999);
        const bucket = filteredOrders.filter((o) => {
          const d = parseOrderDate(o); return d ? d >= s && d <= e : false;
        });
        return {
          label: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          revenue: bucket.filter(isConfirmed).reduce((sum, o) => sum + (o.total ?? 0), 0),
          orders: bucket.length,
        };
      });
    }
    const rangeDays = Math.ceil((periodWindow.end.getTime() - periodWindow.start.getTime()) / 86_400_000);
    const step = rangeDays > 60 ? 7 : 1;
    const rows: { label: string; revenue: number; orders: number }[] = [];
    const cursor = new Date(periodWindow.start); cursor.setHours(0, 0, 0, 0);
    while (cursor <= periodWindow.end) {
      const s = new Date(cursor);
      const e = new Date(cursor); e.setDate(e.getDate() + step - 1); e.setHours(23, 59, 59, 999);
      if (e > periodWindow.end) e.setTime(periodWindow.end.getTime());
      const bucket = filteredOrders.filter((o) => {
        const d = parseOrderDate(o); return d ? d >= s && d <= e : false;
      });
      const label = step > 1
        ? `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      rows.push({
        label,
        revenue: bucket.filter(isConfirmed).reduce((sum, o) => sum + (o.total ?? 0), 0),
        orders: bucket.length,
      });
      cursor.setDate(cursor.getDate() + step);
    }
    return rows;
  }, [filteredOrders, filterMode, periodWindow]);

  // ─── 3. Revenue by Category ───────────────────────────────────────────────

  const categoryRevenue = useMemo(() => {
    const map = new Map<string, { category: string; revenue: number; qty: number }>();
    let total = 0;
    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      normalizeItems(o.items).forEach((item: any) => {
        const mid = item.menuItemId ?? item.menu_item_id;
        const cat = menuById[mid]?.category ?? item.category ?? item.menuItem?.category ?? 'other';
        const rev = Number(item.totalPrice ?? item.total_price ?? ((item.unitPrice ?? item.unit_price ?? 0) * (item.quantity ?? 1))) || 0;
        const existing = map.get(cat) ?? { category: cat, revenue: 0, qty: 0 };
        existing.revenue += rev;
        existing.qty += Number(item.quantity ?? 1);
        map.set(cat, existing);
        total += rev;
      });
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, percentage: total > 0 ? Math.round((r.revenue / total) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, menuById]);

  // ─── 4. Top Selling Items ─────────────────────────────────────────────────

  const topItems = useMemo(() => {
    const stats = new Map<string, { name: string; revenue: number; qty: number; orders: number }>();
    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      const seenKeys = new Set<string>();
      normalizeItems(o.items).forEach((item: any) => {
        const mid = item.menuItemId ?? item.menu_item_id ?? '';
        const key = mid || (item.menuItemName ?? item.menu_item_name ?? 'unknown');
        const name = menuById[mid]?.name ?? item.menuItemName ?? item.menu_item_name ?? key;
        const qty = Number(item.quantity ?? 1) || 1;
        const up = Number(item.unitPrice ?? item.unit_price ?? menuById[mid]?.price ?? 0);
        const rev = Number(item.totalPrice ?? item.total_price ?? up * qty) || 0;
        const s = stats.get(key) ?? { name, revenue: 0, qty: 0, orders: 0 };
        s.revenue += rev; s.qty += qty;
        if (!seenKeys.has(key)) { s.orders += 1; seenKeys.add(key); }
        stats.set(key, s);
      });
    });
    return Array.from(stats.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
  }, [filteredOrders, menuById]);

  // ─── 5. Staff Performance ─────────────────────────────────────────────────

  const staffPerformance = useMemo(() => {
    const waiterIds = new Set(waiters.map(w => w.id));
    const tableToWaiter = new Map<number, string>();
    waiters.forEach(w => {
      (w.assignedTables || []).forEach((t: number) => tableToWaiter.set(t, w.id));
    });

    const map = new Map<string, { name: string; ordersServed: number; revenue: number }>();
    filteredOrders.forEach((order) => {
      if (order.status !== 'served') return;
      const o = order as any;
      const waiterId =
        (order.assignedWaiterId && waiterIds.has(order.assignedWaiterId) ? order.assignedWaiterId : null) ??
        (o.assigned_waiter_id && waiterIds.has(o.assigned_waiter_id) ? o.assigned_waiter_id : null) ??
        (o.created_by && waiterIds.has(o.created_by) ? o.created_by : null) ??
        (order.tableNumber != null ? tableToWaiter.get(order.tableNumber) ?? null : null);
      if (!waiterId) return;

      const waiter = waiters.find(w => w.id === waiterId);
      const name = waiter?.name || 'Unknown';
      const cur = map.get(waiterId) ?? { name, ordersServed: 0, revenue: 0 };
      cur.ordersServed++;
      cur.revenue += order.total ?? 0;
      map.set(waiterId, cur);
    });

    return Array.from(map.values())
      .map(s => ({ ...s, avgOrderValue: s.ordersServed > 0 ? s.revenue / s.ordersServed : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, waiters]);

  // ─── 6. Payment Method Distribution ───────────────────────────────────────

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; total: number; orders: number; color: string }>();
    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      const breakdown = parseBreakdown(o.payment_breakdown ?? o.paymentBreakdown);
      const orderTotal = Number(o.total) || 0;

      if (breakdown) {
        breakdown.forEach((entry: any) => {
          const label = resolveMethodLabel(entry.method);
          const amount = Number(entry.amount) || 0;
          const existing = map.get(label) ?? { label, total: 0, orders: 0, color: PAYMENT_METHOD_COLORS[label] ?? '#6b7280' };
          existing.total += amount;
          existing.orders++;
          map.set(label, existing);
        });
      } else {
        const label = resolveMethodLabel(o.payment_type ?? o.paymentType ?? null);
        const existing = map.get(label) ?? { label, total: 0, orders: 0, color: PAYMENT_METHOD_COLORS[label] ?? '#6b7280' };
        existing.total += orderTotal;
        existing.orders++;
        map.set(label, existing);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  const paymentTotal = paymentBreakdown.reduce((s, m) => s + m.total, 0);

  // ─── 7. Order Status & Cancellations ──────────────────────────────────────

  const orderStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      const status = o.status ?? 'pending';
      counts[status] = (counts[status] ?? 0) + 1;
    });
    const total = filteredOrders.length;
    const cancelled = counts['cancelled'] ?? 0;
    return {
      total,
      served: counts['served'] ?? 0,
      pending: (counts['pending'] ?? 0) + (counts['verified'] ?? 0) + (counts['preparing'] ?? 0) + (counts['ready'] ?? 0),
      cancelled,
      cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
    };
  }, [filteredOrders]);

  // ─── 8. Expenses Summary ──────────────────────────────────────────────────

  const expenseSummary = useMemo(() => {
    const catMap = new Map(expenseCategories.map(c => [c.id, c.name]));
    const map = new Map<string, { category: string; total: number; count: number }>();
    expenses.forEach((e) => {
      const catName = catMap.get(e.categoryId) ?? 'Uncategorized';
      const existing = map.get(catName) ?? { category: catName, total: 0, count: 0 };
      existing.total += e.amount ?? 0;
      existing.count++;
      map.set(catName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, expenseCategories]);

  // ─── Download helpers ─────────────────────────────────────────────────────

  const dlTrend = () => downloadCsv(`report_trend_${filterMode}.csv`, [
    ['Period', 'Revenue', 'Orders'],
    ...periodRevenue.map(d => [d.label, String(d.revenue), String(d.orders)]),
  ]);
  const dlCategory = () => downloadCsv(`report_categories_${filterMode}.csv`, [
    ['Category', 'Revenue', 'Qty Sold', 'Percentage'],
    ...categoryRevenue.map(c => [c.category, String(c.revenue), String(c.qty), `${c.percentage}%`]),
  ]);
  const dlTopItems = () => downloadCsv(`report_top_items_${filterMode}.csv`, [
    ['Rank', 'Item', 'Qty Sold', 'Revenue'],
    ...topItems.map((t, i) => [String(i + 1), t.name, String(t.qty), String(t.revenue)]),
  ]);
  const dlStaff = () => downloadCsv(`report_staff_${filterMode}.csv`, [
    ['Waiter', 'Orders Served', 'Revenue', 'Avg Order Value'],
    ...staffPerformance.map(s => [s.name, String(s.ordersServed), String(Math.round(s.revenue)), String(Math.round(s.avgOrderValue))]),
  ]);
  const dlPayment = () => downloadCsv(`report_payment_${filterMode}.csv`, [
    ['Payment Method', 'Amount', 'Orders', 'Percentage'],
    ...paymentBreakdown.map(p => [p.label, String(Math.round(p.total)), String(p.orders), paymentTotal > 0 ? `${Math.round((p.total / paymentTotal) * 100)}%` : '0%']),
  ]);
  const dlStatus = () => downloadCsv(`report_order_status_${filterMode}.csv`, [
    ['Status', 'Count', 'Percentage'],
    ['Served', String(orderStatus.served), `${orderStatus.total > 0 ? Math.round((orderStatus.served / orderStatus.total) * 100) : 0}%`],
    ['Pending', String(orderStatus.pending), `${orderStatus.total > 0 ? Math.round((orderStatus.pending / orderStatus.total) * 100) : 0}%`],
    ['Cancelled', String(orderStatus.cancelled), `${orderStatus.cancellationRate}%`],
  ]);
  const dlExpenses = () => downloadCsv(`report_expenses_${filterMode}.csv`, [
    ['Category', 'Total', 'Count'],
    ...expenseSummary.map(e => [e.category, String(Math.round(e.total)), String(e.count)]),
    ['TOTAL', String(Math.round(metrics.expenses)), String(expenses.length)],
  ]);

  const dlFullReport = () => {
    const rows: string[][] = [];
    const sep = (title: string) => { rows.push([]); rows.push([`── ${title} ──`]); };

    rows.push(['Report Period', periodLabel(filterMode, periodWindow)]);
    rows.push(['Generated', new Date().toLocaleString()]);

    sep('EXECUTIVE SUMMARY');
    rows.push(['Metric', 'Value']);
    rows.push(['Total Revenue', String(Math.round(metrics.revenue))]);
    rows.push(['Total Orders', String(metrics.orders)]);
    rows.push(['Avg Order Value', String(Math.round(metrics.avgOrderValue))]);
    rows.push(['Total Expenses', String(Math.round(metrics.expenses))]);
    rows.push(['Net Profit', String(Math.round(metrics.netProfit))]);

    sep('REVENUE & ORDERS TREND');
    rows.push(['Period', 'Revenue', 'Orders']);
    periodRevenue.forEach(d => rows.push([d.label, String(d.revenue), String(d.orders)]));

    sep('REVENUE BY CATEGORY');
    rows.push(['Category', 'Revenue', 'Qty Sold', 'Percentage']);
    categoryRevenue.forEach(c => rows.push([c.category, String(c.revenue), String(c.qty), `${c.percentage}%`]));

    sep('TOP SELLING ITEMS');
    rows.push(['Rank', 'Item', 'Qty Sold', 'Revenue']);
    topItems.forEach((t, i) => rows.push([String(i + 1), t.name, String(t.qty), String(t.revenue)]));

    sep('STAFF PERFORMANCE');
    rows.push(['Waiter', 'Orders Served', 'Revenue', 'Avg Order Value']);
    staffPerformance.forEach(s => rows.push([s.name, String(s.ordersServed), String(Math.round(s.revenue)), String(Math.round(s.avgOrderValue))]));

    sep('PAYMENT METHOD DISTRIBUTION');
    rows.push(['Payment Method', 'Amount', 'Orders', 'Percentage']);
    paymentBreakdown.forEach(p => rows.push([p.label, String(Math.round(p.total)), String(p.orders), paymentTotal > 0 ? `${Math.round((p.total / paymentTotal) * 100)}%` : '0%']));

    sep('ORDER STATUS');
    rows.push(['Status', 'Count']);
    rows.push(['Served', String(orderStatus.served)]);
    rows.push(['Pending', String(orderStatus.pending)]);
    rows.push(['Cancelled', String(orderStatus.cancelled)]);
    rows.push(['Cancellation Rate', `${orderStatus.cancellationRate}%`]);

    sep('EXPENSES');
    rows.push(['Category', 'Total', 'Count']);
    expenseSummary.forEach(e => rows.push([e.category, String(Math.round(e.total)), String(e.count)]));
    rows.push(['TOTAL', String(Math.round(metrics.expenses)), String(expenses.length)]);

    downloadCsv(`full_report_${filterMode}_${new Date().toISOString().split('T')[0]}.csv`, rows);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const revDelta = pctDelta(metrics.revenue, priorMetrics.revenue);
  const ordDelta = pctDelta(metrics.orders, priorMetrics.orders);
  const avgDelta = pctDelta(metrics.avgOrderValue, priorMetrics.avgOrderValue);

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-2">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400 mt-0.5">{periodLabel(filterMode, periodWindow)}</p>
        </div>
        <button
          onClick={dlFullReport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition"
        >
          <DownloadIcon className="w-4 h-4" />
          Download Full Report
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'custom'] as FilterMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterMode === m
                ? 'bg-amber-500 text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            {m === 'today' ? 'Today' : m === 'week' ? 'This Week' : m === 'month' ? 'This Month' : 'Custom'}
          </button>
        ))}
        {filterMode === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <CalendarIcon className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}
      </div>

      {/* ── 1. Executive Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard icon={<DollarSignIcon className="w-5 h-5" />} label="Revenue" value={formatPrice(metrics.revenue)} delta={revDelta} />
        <KPICard icon={<ShoppingCartIcon className="w-5 h-5" />} label="Orders" value={String(metrics.orders)} delta={ordDelta} />
        <KPICard icon={<TrendingUpIcon className="w-5 h-5" />} label="Avg Order" value={formatPrice(metrics.avgOrderValue)} delta={avgDelta} />
        <KPICard icon={<ReceiptIcon className="w-5 h-5" />} label="Expenses" value={formatPrice(metrics.expenses)} />
        <KPICard icon={<DollarSignIcon className="w-5 h-5" />} label="Net Profit" value={formatPrice(metrics.netProfit)} tone={metrics.netProfit >= 0 ? 'green' : 'red'} />
      </div>

      {/* ── 2. Revenue & Orders Trend ── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
        <SectionHeader title="Revenue & Orders Trend" onDownload={dlTrend} />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={periodRevenue} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} />
              <YAxis yAxisId="rev" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <YAxis yAxisId="ord" orientation="right" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(value: number, name: string) => [name === 'Revenue' ? formatPrice(value) : value, name]} />
              <Bar yAxisId="rev" dataKey="revenue" fill="#10b981" name="Revenue" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="ord" dataKey="orders" fill="#38bdf8" name="Orders" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 3 & 4: Category + Top Items side by side ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Category Revenue */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <SectionHeader title="Revenue by Category" onDownload={dlCategory} />
          {categoryRevenue.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No category data for this period.</p>
          ) : (
            <div className="flex gap-4">
              <div className="w-36 h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryRevenue} dataKey="revenue" nameKey="category" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                      {categoryRevenue.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => formatPrice(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-44">
                {categoryRevenue.map((c, i) => (
                  <div key={c.category} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-300 capitalize">{c.category.replace(/-/g, ' ')}</span>
                    </div>
                    <span className="text-slate-400 font-medium">{formatPrice(c.revenue)} ({c.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Selling Items */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <SectionHeader title="Top Selling Items" onDownload={dlTopItems} />
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No item data for this period.</p>
          ) : (
            <div className="overflow-y-auto max-h-52">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wide border-b border-slate-700">
                    <th className="text-left py-1.5 font-semibold">#</th>
                    <th className="text-left py-1.5 font-semibold">Item</th>
                    <th className="text-right py-1.5 font-semibold">Qty</th>
                    <th className="text-right py-1.5 font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((t, i) => (
                    <tr key={t.name} className="border-b border-slate-700/50">
                      <td className="py-1.5 text-slate-500">{i + 1}</td>
                      <td className="py-1.5 text-slate-200">{t.name}</td>
                      <td className="py-1.5 text-right text-slate-400">{t.qty}</td>
                      <td className="py-1.5 text-right text-slate-200 font-medium">{formatPrice(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Staff Performance ── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
        <SectionHeader title="Staff Performance" onDownload={dlStaff} />
        {staffPerformance.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No staff data for this period.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffPerformance} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} tick={{ fill: '#94a3b8' }} width={55} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number, name: string) => [name === 'Revenue' ? formatPrice(value) : value, name]} />
                  <Bar dataKey="revenue" fill="#f59e0b" name="Revenue" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-y-auto max-h-52">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wide border-b border-slate-700">
                    <th className="text-left py-1.5 font-semibold">Waiter</th>
                    <th className="text-right py-1.5 font-semibold">Orders</th>
                    <th className="text-right py-1.5 font-semibold">Revenue</th>
                    <th className="text-right py-1.5 font-semibold">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPerformance.map((s) => (
                    <tr key={s.name} className="border-b border-slate-700/50">
                      <td className="py-1.5 text-slate-200 flex items-center gap-1.5">
                        <UsersIcon className="w-3 h-3 text-slate-500" />{s.name}
                      </td>
                      <td className="py-1.5 text-right text-slate-400">{s.ordersServed}</td>
                      <td className="py-1.5 text-right text-slate-200 font-medium">{formatPrice(s.revenue)}</td>
                      <td className="py-1.5 text-right text-slate-400">{formatPrice(s.avgOrderValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 6 & 7: Payment + Order Status side by side ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Payment Method Distribution */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <SectionHeader title="Payment Methods" onDownload={dlPayment} />
          {paymentBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No payment data for this period.</p>
          ) : (
            <div className="space-y-3">
              {paymentBreakdown.map((p) => {
                const pct = paymentTotal > 0 ? (p.total / paymentTotal) * 100 : 0;
                return (
                  <div key={p.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-200 font-medium">{p.label}</span>
                        <span className="text-slate-500">({p.orders} orders)</span>
                      </div>
                      <span className="text-slate-300 font-semibold">{formatPrice(p.total)}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                    </div>
                    <div className="text-right text-[10px] text-slate-500 mt-0.5">{Math.round(pct)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Order Status & Cancellations */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <SectionHeader title="Order Status & Cancellations" onDownload={dlStatus} />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatusCard label="Total Orders" value={orderStatus.total} color="text-white" />
            <StatusCard label="Served" value={orderStatus.served} color="text-emerald-400" />
            <StatusCard label="Pending" value={orderStatus.pending} color="text-amber-400" />
            <StatusCard label="Cancelled" value={orderStatus.cancelled} color="text-red-400" />
          </div>
          <div className="flex items-center gap-3 bg-slate-900/60 rounded-xl p-3">
            <XCircleIcon className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Cancellation Rate</p>
              <p className={`text-lg font-bold ${orderStatus.cancellationRate > 10 ? 'text-red-400' : orderStatus.cancellationRate > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {orderStatus.cancellationRate}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 8. Expenses Summary ── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
        <SectionHeader title="Expenses Summary" onDownload={dlExpenses} />
        {expenseSummary.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No expenses recorded for this period.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="overflow-y-auto max-h-48">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wide border-b border-slate-700">
                    <th className="text-left py-1.5 font-semibold">Category</th>
                    <th className="text-right py-1.5 font-semibold">Amount</th>
                    <th className="text-right py-1.5 font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseSummary.map((e) => (
                    <tr key={e.category} className="border-b border-slate-700/50">
                      <td className="py-1.5 text-slate-200">{e.category}</td>
                      <td className="py-1.5 text-right text-slate-200 font-medium">{formatPrice(e.total)}</td>
                      <td className="py-1.5 text-right text-slate-400">{e.count}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-600">
                    <td className="py-2 text-slate-200 font-bold">Total</td>
                    <td className="py-2 text-right text-white font-bold">{formatPrice(metrics.expenses)}</td>
                    <td className="py-2 text-right text-slate-300 font-bold">{expenses.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 bg-slate-900/60 rounded-xl p-4">
              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Revenue</p>
                <p className="text-lg font-bold text-emerald-400">{formatPrice(metrics.revenue)}</p>
              </div>
              <div className="text-slate-600 text-lg">−</div>
              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Expenses</p>
                <p className="text-lg font-bold text-red-400">{formatPrice(metrics.expenses)}</p>
              </div>
              <div className="w-full border-t border-slate-700 pt-2 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Net Profit</p>
                <p className={`text-xl font-bold ${metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatPrice(metrics.netProfit)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KPICard({ icon, label, value, delta, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: { pct: number; up: boolean };
  tone?: 'green' | 'red';
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${tone === 'green' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : 'text-white'}`}>
        {value}
      </p>
      {delta && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${delta.up ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta.up ? <TrendingUpIcon className="w-3 h-3" /> : <TrendingDownIcon className="w-3 h-3" />}
          <span>{delta.pct}% vs prior period</span>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900/60 rounded-xl p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
