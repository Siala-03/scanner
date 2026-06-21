import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  CalendarIcon, DownloadIcon, TrendingUpIcon, TrendingDownIcon,
  ShoppingCartIcon, DollarSignIcon, UsersIcon, CreditCardIcon,
  XCircleIcon, ReceiptIcon, FileTextIcon, ChevronDownIcon,
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
  '04': 'MoMo', 'mobile money': 'MoMo', momo: 'MoMo',
  '99': 'Other', other: 'Other',
  'bank transfer': 'Bank Transfer', bank_transfer: 'Bank Transfer',
};

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  Cash: '#10b981', Card: '#3b82f6', MoMo: '#f59e0b',
  Other: '#6b7280', Cheque: '#8b5cf6', 'Bank Transfer': '#06b6d4',
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
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (mode === 'today') return `Today — ${fmt(window.start)}`;
  if (mode === 'week') return `${fmt(window.start)} – ${fmt(window.end)}`;
  if (mode === 'month') return window.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}

// ─── PDF generator ──────────────────────────────────────────────────────────

function downloadPdf(reportRef: HTMLDivElement, title: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow pop-ups to download PDF.'); return; }

  printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.5; background: #fff; padding: 16px; }
    h1 { font-size: 16pt; margin-bottom: 4px; }
    h2 { font-size: 11pt; color: #334155; margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; letter-spacing: 1px; }
    .meta { font-size: 9pt; color: #64748b; margin-bottom: 12px; }
    .kpi-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .kpi { flex: 1; min-width: 120px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
    .kpi .label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi .value { font-size: 14pt; font-weight: 800; color: #0f172a; margin-top: 2px; }
    .kpi .delta { font-size: 8pt; margin-top: 2px; }
    .delta-up { color: #059669; }
    .delta-down { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9pt; }
    th { text-align: left; padding: 5px 6px; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #334155; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; }
    td { padding: 5px 6px; border-bottom: 1px solid #f1f5f9; }
    th:last-child, td:last-child { text-align: right; }
    tr:last-child td { border-bottom: none; }
    .total-row td { font-weight: 700; border-top: 2px solid #cbd5e1; }
    .bar-row { margin: 4px 0; }
    .bar-label { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 2px; }
    .bar-track { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .status-grid { display: flex; gap: 12px; margin: 8px 0; flex-wrap: wrap; }
    .status-card { flex: 1; min-width: 80px; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
    .status-card .val { font-size: 16pt; font-weight: 800; }
    .status-card .lbl { font-size: 8pt; color: #64748b; }
    .cancel-rate { display: inline-block; background: #fef2f2; color: #dc2626; padding: 4px 12px; border-radius: 6px; font-weight: 700; font-size: 10pt; margin-top: 6px; }
    @media print { body { padding: 0; } }
  </style></head><body>`);

  printWindow.document.write(reportRef.innerHTML);
  printWindow.document.write('</body></html>');
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 400);
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
  const [showDlMenu, setShowDlMenu] = useState(false);
  const { menuItems } = useMenu();
  const pdfRef = useRef<HTMLDivElement>(null);
  const dlMenuRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dlMenuRef.current && !dlMenuRef.current.contains(e.target as Node)) setShowDlMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    () => orders.filter((o) => { const d = parseOrderDate(o); return d ? d >= periodWindow.start && d <= periodWindow.end : false; }),
    [orders, periodWindow],
  );

  const filteredPriorOrders = useMemo(
    () => priorOrders.filter((o) => { const d = parseOrderDate(o); return d ? d >= priorWindow.start && d <= priorWindow.end : false; }),
    [priorOrders, priorWindow],
  );

  // ─── 1. Executive Summary ─────────────────────────────────────────────────

  const metrics = useMemo(() => {
    let revenue = 0, orderCount = 0;
    filteredOrders.forEach((o) => { orderCount++; if (isConfirmed(o)) revenue += o.total ?? 0; });
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
    return { revenue, orders: orderCount, avgOrderValue: orderCount > 0 ? revenue / orderCount : 0, expenses: totalExpenses };
  }, [filteredOrders, expenses]);

  const priorMetrics = useMemo(() => {
    let revenue = 0, orderCount = 0;
    filteredPriorOrders.forEach((o) => { orderCount++; if (isConfirmed(o)) revenue += o.total ?? 0; });
    return { revenue, orders: orderCount, avgOrderValue: orderCount > 0 ? revenue / orderCount : 0 };
  }, [filteredPriorOrders]);

  // ─── 2. Revenue & Orders Trend ────────────────────────────────────────────

  const periodRevenue = useMemo(() => {
    if (filterMode === 'today') {
      return Array.from({ length: 18 }, (_, i) => {
        const hour = i + 6;
        let revenue = 0, cnt = 0;
        filteredOrders.forEach((o) => { const d = parseOrderDate(o); if (!d || d.getHours() !== hour) return; cnt++; if (isConfirmed(o)) revenue += o.total ?? 0; });
        return { label: `${hour}:00`, revenue, orders: cnt };
      });
    }
    if (filterMode === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(periodWindow.start); day.setDate(day.getDate() + i);
        const s = new Date(day); s.setHours(0, 0, 0, 0);
        const e = new Date(day); e.setHours(23, 59, 59, 999);
        const bucket = filteredOrders.filter((o) => { const d = parseOrderDate(o); return d ? d >= s && d <= e : false; });
        return { label: day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), revenue: bucket.filter(isConfirmed).reduce((sum, o) => sum + (o.total ?? 0), 0), orders: bucket.length };
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
      const bucket = filteredOrders.filter((o) => { const d = parseOrderDate(o); return d ? d >= s && d <= e : false; });
      rows.push({ label: s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), revenue: bucket.filter(isConfirmed).reduce((sum, o) => sum + (o.total ?? 0), 0), orders: bucket.length });
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
        existing.revenue += rev; existing.qty += Number(item.quantity ?? 1);
        map.set(cat, existing); total += rev;
      });
    });
    return Array.from(map.values()).map((r) => ({ ...r, percentage: total > 0 ? Math.round((r.revenue / total) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
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
    waiters.forEach(w => { (w.assignedTables || []).forEach((t: number) => tableToWaiter.set(t, w.id)); });
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
      const cur = map.get(waiterId) ?? { name: waiter?.name || 'Unknown', ordersServed: 0, revenue: 0 };
      cur.ordersServed++; cur.revenue += order.total ?? 0;
      map.set(waiterId, cur);
    });
    return Array.from(map.values()).map(s => ({ ...s, avgOrderValue: s.ordersServed > 0 ? s.revenue / s.ordersServed : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, waiters]);

  // ─── 6. Payment Method Distribution ───────────────────────────────────────

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; total: number; orders: number; color: string }>();
    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      const breakdown = parseBreakdown(o.payment_breakdown ?? o.paymentBreakdown);
      if (breakdown) {
        breakdown.forEach((entry: any) => {
          const label = resolveMethodLabel(entry.method);
          const existing = map.get(label) ?? { label, total: 0, orders: 0, color: PAYMENT_METHOD_COLORS[label] ?? '#6b7280' };
          existing.total += Number(entry.amount) || 0; existing.orders++;
          map.set(label, existing);
        });
      } else {
        const label = resolveMethodLabel(o.payment_type ?? o.paymentType ?? null);
        const existing = map.get(label) ?? { label, total: 0, orders: 0, color: PAYMENT_METHOD_COLORS[label] ?? '#6b7280' };
        existing.total += Number(o.total) || 0; existing.orders++;
        map.set(label, existing);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  const paymentTotal = paymentBreakdown.reduce((s, m) => s + m.total, 0);

  // ─── 7. Order Status & Cancellations ──────────────────────────────────────

  const orderStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach((o) => { counts[o.status ?? 'pending'] = (counts[o.status ?? 'pending'] ?? 0) + 1; });
    const total = filteredOrders.length;
    const cancelled = counts['cancelled'] ?? 0;
    return { total, served: counts['served'] ?? 0, pending: (counts['pending'] ?? 0) + (counts['verified'] ?? 0) + (counts['preparing'] ?? 0) + (counts['ready'] ?? 0), cancelled, cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0 };
  }, [filteredOrders]);

  // ─── 8. Expenses Summary ──────────────────────────────────────────────────

  const expenseSummary = useMemo(() => {
    const catMap = new Map(expenseCategories.map(c => [c.id, c.name]));
    const map = new Map<string, { category: string; total: number; count: number }>();
    expenses.forEach((e) => {
      const catName = catMap.get(e.categoryId) ?? 'Uncategorized';
      const existing = map.get(catName) ?? { category: catName, total: 0, count: 0 };
      existing.total += e.amount ?? 0; existing.count++;
      map.set(catName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, expenseCategories]);

  // ─── Downloads ────────────────────────────────────────────────────────────

  const fileDate = new Date().toISOString().split('T')[0];

  const dlCsv = () => {
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

    downloadCsv(`report_${filterMode}_${fileDate}.csv`, rows);
    setShowDlMenu(false);
  };

  const dlPdf = () => {
    if (pdfRef.current) downloadPdf(pdfRef.current, `Report — ${periodLabel(filterMode, periodWindow)}`);
    setShowDlMenu(false);
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
  const pLabel = periodLabel(filterMode, periodWindow);

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-2">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400 mt-0.5">{pLabel}</p>
        </div>
        <div className="relative" ref={dlMenuRef}>
          <button
            onClick={() => setShowDlMenu(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition shadow-lg shadow-amber-500/20"
          >
            <DownloadIcon className="w-4 h-4" />
            Download Report
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          {showDlMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
              <button onClick={dlPdf} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-200 hover:bg-slate-700/60 transition">
                <FileTextIcon className="w-4 h-4 text-red-400" /> Download as PDF
              </button>
              <button onClick={dlCsv} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-200 hover:bg-slate-700/60 transition border-t border-slate-700">
                <FileTextIcon className="w-4 h-4 text-emerald-400" /> Download as CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-3 flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'custom'] as FilterMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filterMode === m
                ? 'bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {m === 'today' ? 'Today' : m === 'week' ? 'This Week' : m === 'month' ? 'This Month' : 'Custom'}
          </button>
        ))}
        {filterMode === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <span className="text-slate-600 text-xs">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        )}
      </div>

      {/* ── 1. Executive Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={<DollarSignIcon className="w-5 h-5" />} label="Revenue" value={formatPrice(metrics.revenue)} delta={revDelta} accent="emerald" />
        <KPICard icon={<ShoppingCartIcon className="w-5 h-5" />} label="Orders" value={String(metrics.orders)} delta={ordDelta} accent="blue" />
        <KPICard icon={<TrendingUpIcon className="w-5 h-5" />} label="Avg Order" value={formatPrice(metrics.avgOrderValue)} delta={avgDelta} accent="amber" />
        <KPICard icon={<ReceiptIcon className="w-5 h-5" />} label="Expenses" value={formatPrice(metrics.expenses)} accent="red" />
      </div>

      {/* ── 2. Revenue & Orders Trend ── */}
      <Section title="Revenue & Orders Trend">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={periodRevenue} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} />
              <YAxis yAxisId="rev" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <YAxis yAxisId="ord" orientation="right" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(value: number, name: string) => [name === 'Revenue' ? formatPrice(value) : value, name]} />
              <Bar yAxisId="rev" dataKey="revenue" fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="ord" dataKey="orders" fill="#38bdf8" name="Orders" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ── 3 & 4: Category + Top Items ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Revenue by Category">
          {categoryRevenue.length === 0 ? <Empty /> : (
            <div className="flex gap-5 items-start">
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryRevenue} dataKey="revenue" nameKey="category" cx="50%" cy="50%" innerRadius={32} outerRadius={60} paddingAngle={2} strokeWidth={0}>
                      {categoryRevenue.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => formatPrice(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto max-h-44 pr-1">
                {categoryRevenue.map((c, i) => (
                  <div key={c.category} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-300 capitalize truncate">{c.category.replace(/-/g, ' ')}</span>
                    </div>
                    <span className="text-slate-400 font-semibold whitespace-nowrap ml-2">{formatPrice(c.revenue)} <span className="text-slate-500 font-normal">({c.percentage}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Top Selling Items">
          {topItems.length === 0 ? <Empty /> : (
            <div className="overflow-y-auto max-h-56">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-700">
                  <th className="text-left py-2 font-semibold w-6">#</th>
                  <th className="text-left py-2 font-semibold">Item</th>
                  <th className="text-right py-2 font-semibold">Qty</th>
                  <th className="text-right py-2 font-semibold">Revenue</th>
                </tr></thead>
                <tbody>
                  {topItems.map((t, i) => (
                    <tr key={t.name} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="py-2 text-slate-600 font-bold">{i + 1}</td>
                      <td className="py-2 text-slate-200">{t.name}</td>
                      <td className="py-2 text-right text-slate-400">{t.qty}</td>
                      <td className="py-2 text-right text-white font-semibold">{formatPrice(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      {/* ── 5. Staff Performance ── */}
      <Section title="Staff Performance">
        {staffPerformance.length === 0 ? <Empty /> : (
          <div className="grid md:grid-cols-2 gap-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffPerformance} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#64748b" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} tick={{ fill: '#cbd5e1' }} width={65} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number, name: string) => [name === 'Revenue' ? formatPrice(value) : value, name]} />
                  <Bar dataKey="revenue" fill="#f59e0b" name="Revenue" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-y-auto max-h-56">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-700">
                  <th className="text-left py-2 font-semibold">Waiter</th>
                  <th className="text-right py-2 font-semibold">Orders</th>
                  <th className="text-right py-2 font-semibold">Revenue</th>
                  <th className="text-right py-2 font-semibold">Avg</th>
                </tr></thead>
                <tbody>
                  {staffPerformance.map((s, i) => (
                    <tr key={s.name} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="py-2 text-slate-200 flex items-center gap-2">
                        {i === 0 && <span className="text-amber-400 text-[10px]">&#9733;</span>}
                        <UsersIcon className="w-3 h-3 text-slate-500 shrink-0" />{s.name}
                      </td>
                      <td className="py-2 text-right text-slate-400">{s.ordersServed}</td>
                      <td className="py-2 text-right text-white font-semibold">{formatPrice(s.revenue)}</td>
                      <td className="py-2 text-right text-slate-400">{formatPrice(s.avgOrderValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── 6 & 7: Payment + Order Status ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Payment Methods">
          {paymentBreakdown.length === 0 ? <Empty /> : (
            <div className="space-y-4">
              {paymentBreakdown.map((p) => {
                const pct = paymentTotal > 0 ? (p.total / paymentTotal) * 100 : 0;
                return (
                  <div key={p.label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="w-3.5 h-3.5" style={{ color: p.color }} />
                        <span className="text-slate-200 font-medium">{p.label}</span>
                        <span className="text-slate-600 text-[10px]">{p.orders} orders</span>
                      </div>
                      <span className="text-white font-bold">{formatPrice(p.total)}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2.5">
                      <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: p.color }} />
                    </div>
                    <div className="text-right text-[10px] text-slate-500 mt-0.5 font-medium">{Math.round(pct)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Order Status & Cancellations">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatusCard label="Total Orders" value={orderStatus.total} color="text-white" bg="bg-slate-700/30" />
            <StatusCard label="Served" value={orderStatus.served} color="text-emerald-400" bg="bg-emerald-500/10" />
            <StatusCard label="Pending" value={orderStatus.pending} color="text-amber-400" bg="bg-amber-500/10" />
            <StatusCard label="Cancelled" value={orderStatus.cancelled} color="text-red-400" bg="bg-red-500/10" />
          </div>
          <div className="flex items-center gap-3 bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
            <XCircleIcon className="w-6 h-6 text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-slate-400 font-medium">Cancellation Rate</p>
              <p className={`text-2xl font-bold ${orderStatus.cancellationRate > 10 ? 'text-red-400' : orderStatus.cancellationRate > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {orderStatus.cancellationRate}%
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* ── 8. Expenses Summary ── */}
      <Section title="Expenses Summary">
        {expenseSummary.length === 0 ? <Empty msg="No expenses recorded for this period." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-700">
                <th className="text-left py-2 font-semibold">Category</th>
                <th className="text-right py-2 font-semibold">Amount</th>
                <th className="text-right py-2 font-semibold">Count</th>
              </tr></thead>
              <tbody>
                {expenseSummary.map((e) => (
                  <tr key={e.category} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="py-2 text-slate-200">{e.category}</td>
                    <td className="py-2 text-right text-white font-semibold">{formatPrice(e.total)}</td>
                    <td className="py-2 text-right text-slate-400">{e.count}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-600">
                  <td className="py-2.5 text-white font-bold">Total Expenses</td>
                  <td className="py-2.5 text-right text-amber-400 font-bold text-sm">{formatPrice(metrics.expenses)}</td>
                  <td className="py-2.5 text-right text-slate-300 font-bold">{expenses.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Hidden PDF-printable version ── */}
      <div className="hidden">
        <div ref={pdfRef}>
          <h1>Business Report</h1>
          <div className="meta">{pLabel} &mdash; Generated {new Date().toLocaleString()}</div>

          <div className="kpi-row">
            <div className="kpi"><div className="label">Revenue</div><div className="value">{formatPrice(metrics.revenue)}</div><div className={`delta ${revDelta.up ? 'delta-up' : 'delta-down'}`}>{revDelta.up ? '+' : '-'}{revDelta.pct}% vs prior</div></div>
            <div className="kpi"><div className="label">Orders</div><div className="value">{metrics.orders}</div><div className={`delta ${ordDelta.up ? 'delta-up' : 'delta-down'}`}>{ordDelta.up ? '+' : '-'}{ordDelta.pct}% vs prior</div></div>
            <div className="kpi"><div className="label">Avg Order</div><div className="value">{formatPrice(metrics.avgOrderValue)}</div><div className={`delta ${avgDelta.up ? 'delta-up' : 'delta-down'}`}>{avgDelta.up ? '+' : '-'}{avgDelta.pct}% vs prior</div></div>
            <div className="kpi"><div className="label">Expenses</div><div className="value">{formatPrice(metrics.expenses)}</div></div>
          </div>

          <h2>Revenue by Category</h2>
          <table><thead><tr><th>Category</th><th>Revenue</th><th>Qty</th><th style={{textAlign:'right'}}>%</th></tr></thead><tbody>
            {categoryRevenue.map(c => <tr key={c.category}><td style={{textTransform:'capitalize'}}>{c.category.replace(/-/g,' ')}</td><td>{formatPrice(c.revenue)}</td><td>{c.qty}</td><td style={{textAlign:'right'}}>{c.percentage}%</td></tr>)}
          </tbody></table>

          <h2>Top Selling Items</h2>
          <table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>
            {topItems.map((t,i) => <tr key={t.name}><td>{i+1}</td><td>{t.name}</td><td>{t.qty}</td><td>{formatPrice(t.revenue)}</td></tr>)}
          </tbody></table>

          <h2>Staff Performance</h2>
          <table><thead><tr><th>Waiter</th><th>Orders</th><th>Revenue</th><th>Avg</th></tr></thead><tbody>
            {staffPerformance.map(s => <tr key={s.name}><td>{s.name}</td><td>{s.ordersServed}</td><td>{formatPrice(s.revenue)}</td><td>{formatPrice(s.avgOrderValue)}</td></tr>)}
          </tbody></table>

          <h2>Payment Methods</h2>
          {paymentBreakdown.map(p => {
            const pct = paymentTotal > 0 ? Math.round((p.total / paymentTotal) * 100) : 0;
            return <div key={p.label} className="bar-row"><div className="bar-label"><span>{p.label} ({p.orders} orders)</span><span>{formatPrice(p.total)} — {pct}%</span></div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(pct,2)}%`,backgroundColor:p.color}}/></div></div>;
          })}

          <h2>Order Status</h2>
          <div className="status-grid">
            <div className="status-card"><div className="val">{orderStatus.total}</div><div className="lbl">Total</div></div>
            <div className="status-card"><div className="val" style={{color:'#059669'}}>{orderStatus.served}</div><div className="lbl">Served</div></div>
            <div className="status-card"><div className="val" style={{color:'#d97706'}}>{orderStatus.pending}</div><div className="lbl">Pending</div></div>
            <div className="status-card"><div className="val" style={{color:'#dc2626'}}>{orderStatus.cancelled}</div><div className="lbl">Cancelled</div></div>
          </div>
          <div>Cancellation Rate: <span className="cancel-rate">{orderStatus.cancellationRate}%</span></div>

          <h2>Expenses</h2>
          <table><thead><tr><th>Category</th><th>Amount</th><th>Count</th></tr></thead><tbody>
            {expenseSummary.map(e => <tr key={e.category}><td>{e.category}</td><td>{formatPrice(e.total)}</td><td>{e.count}</td></tr>)}
            <tr className="total-row"><td>Total</td><td>{formatPrice(metrics.expenses)}</td><td>{expenses.length}</td></tr>
          </tbody></table>
        </div>
      </div>

    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg?: string }) {
  return <p className="text-sm text-slate-500 text-center py-10">{msg || 'No data for this period.'}</p>;
}

function KPICard({ icon, label, value, delta, accent }: {
  icon: React.ReactNode; label: string; value: string;
  delta?: { pct: number; up: boolean }; accent?: string;
}) {
  const borderColor = accent === 'emerald' ? 'border-emerald-500/30' : accent === 'blue' ? 'border-blue-500/30' : accent === 'amber' ? 'border-amber-500/30' : accent === 'red' ? 'border-red-500/30' : 'border-slate-700';
  const iconColor = accent === 'emerald' ? 'text-emerald-400' : accent === 'blue' ? 'text-blue-400' : accent === 'amber' ? 'text-amber-400' : accent === 'red' ? 'text-red-400' : 'text-slate-400';
  return (
    <div className={`bg-slate-800/60 rounded-xl border ${borderColor} p-4 hover:bg-slate-800/80 transition-colors`}>
      <div className={`flex items-center gap-2 ${iconColor} mb-2`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {delta && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs font-semibold ${delta.up ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta.up ? <TrendingUpIcon className="w-3.5 h-3.5" /> : <TrendingDownIcon className="w-3.5 h-3.5" />}
          <span>{delta.pct}% vs prior period</span>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-3.5 text-center border border-slate-700/30`}>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
