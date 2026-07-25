import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CalendarIcon, Settings2Icon } from 'lucide-react';
import { fetchOrders, fetchOrdersByDateRange } from '../../api/orders';
import { useMenu } from '../../hooks/useMenu';
import { Card } from '../../components/ui/Card';
import { formatPrice } from '../../utils/currency';
import { SectionConfigModal } from '../../components/manager/SectionConfigModal';
import type { SectionGroup } from '../../components/manager/SectionConfigModal';

// ─── Section defaults (first-time seed) ──────────────────────────────────────

const DEFAULT_SECTIONS: SectionGroup[] = [
  { id: 'kitchen', name: 'Kitchen',  color: '#f59e0b', categories: ['food','kitchen','main-course','main course','mains','main','appetizer','appetizers','starter','starters','dessert','desserts','breakfast','lunch','dinner','grill','grills','pizza','pasta','seafood','fast food','snacks'] },
  { id: 'buffet',  name: 'Buffet',   color: '#10b981', categories: ['buffet','buffet items'] },
  { id: 'bar',     name: 'Bar',      color: '#3b82f6', categories: ['bar','drinks','beverages','cocktails','alcoholic-drinks','alcoholic drinks','beers','beer','wine','wines','spirits','soft-drinks','soft drinks','juices','juice','coffee','tea'] },
  { id: 'pool',    name: 'Pool',     color: '#06b6d4', categories: ['pool','pool-bar','pool bar'] },
];

const AUTO_COLORS = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#84cc16','#64748b'];
const CAT_COLORS  = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#6b7280'];

interface DynSectionDay {
  date: string; label: string; total: number;
  [section: string]: number | string;
}

// ─── Filter types & helpers ───────────────────────────────────────────────────

type FilterMode = 'today' | 'week' | 'month' | 'custom';

function getPeriodWindow(
  mode: FilterMode,
  customStart: string,
  customEnd: string,
): { start: Date; end: Date } {
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
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1)); // back to Monday
  } else if (mode === 'month') {
    start.setDate(1);
  }
  // 'today' → start is already today at 00:00

  return { start, end: now };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [filterMode, setFilterMode] = useState<FilterMode>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { menuItems } = useMenu();
  const [itemPageSize, setItemPageSize] = useState(10);
  const [itemPage, setItemPage] = useState(0);
  const [itemPaymentFilter, setItemPaymentFilter] = useState<string>('all');
  const [sectionPageSize, setSectionPageSize] = useState(10);
  const [sectionPage, setSectionPage] = useState(0);
  useEffect(() => { setItemPage(0); }, [filterMode, customStart, customEnd, itemPaymentFilter]);
  useEffect(() => { setSectionPage(0); }, [filterMode, customStart, customEnd]);
  const menuById = useMemo(
    () => Object.fromEntries(menuItems.map((item) => [item.id, item])),
    [menuItems],
  );

  // KPI targets — persisted per restaurant in localStorage
  const [kpiTargets, setKpiTargetsState] = useState(() => {
    try {
      const rid = localStorage.getItem('restaurantId') || 'default';
      const saved = localStorage.getItem(`kpiTargets_${rid}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { revenue: 1500000, orders: 200, avgOrderValue: 7500 };
  });

  const setKpiTargets = (
    updater: ((prev: typeof kpiTargets) => typeof kpiTargets) | typeof kpiTargets,
  ) => {
    setKpiTargetsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        const rid = localStorage.getItem('restaurantId') || 'default';
        localStorage.setItem(`kpiTargets_${rid}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // ─── Section groups — persisted per restaurant ──────────────────────────────
  const [showSectionConfig, setShowSectionConfig] = useState(false);
  const [sectionGroups, setSectionGroupsState] = useState<SectionGroup[]>(() => {
    try {
      const rid = localStorage.getItem('restaurantId') || 'default';
      const saved = localStorage.getItem(`sectionGroups_${rid}`);
      if (saved) return JSON.parse(saved) as SectionGroup[];
    } catch {}
    return DEFAULT_SECTIONS;
  });

  const saveSectionGroups = (groups: SectionGroup[]) => {
    setSectionGroupsState(groups);
    try {
      const rid = localStorage.getItem('restaurantId') || 'default';
      localStorage.setItem(`sectionGroups_${rid}`, JSON.stringify(groups));
    } catch {}
  };

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        let data: any[];
        if (filterMode === 'custom' && customStart && customEnd) {
          data = await fetchOrdersByDateRange(
            customStart + 'T00:00:00.000Z',
            customEnd + 'T23:59:59.999Z',
          );
        } else {
          data = await fetchOrders();
        }
        if (active) setOrders(data);
      } catch (e) {
        console.error(e);
        if (active) setLoadError('Unable to load analytics data. Please try again.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [filterMode, customStart, customEnd]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const parseOrderDate = (order: any): Date | null => {
    const d = new Date(order.createdAt ?? order.created_at);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const isConfirmed = (order: any) =>
    order.payment_status === 'confirmed' || order.paymentStatus === 'confirmed';

  const normalizeItems = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch {}
    }
    return [];
  };

  // ─── Core filter ───────────────────────────────────────────────────────────

  const periodWindow = useMemo(
    () => getPeriodWindow(filterMode, customStart, customEnd),
    [filterMode, customStart, customEnd],
  );

  // All orders in the selected period — single source of truth for every chart/KPI
  const filteredOrders = useMemo(
    () => orders.filter((o) => {
      const d = parseOrderDate(o);
      return d ? d >= periodWindow.start && d <= periodWindow.end : false;
    }),
    [orders, periodWindow],
  );

  // ─── KPI metrics ───────────────────────────────────────────────────────────

  const periodMetrics = useMemo(() => {
    // New-customer detection: only available when we have full history (non-custom)
    const priorCustomers = new Set<string>();
    if (filterMode !== 'custom') {
      orders.forEach((o) => {
        const d = parseOrderDate(o);
        if (!d || d >= periodWindow.start) return;
        const k = o.customerId ?? o.customer_id ?? o.customerName ?? o.customer_name;
        if (k) priorCustomers.add(String(k));
      });
    }

    let confirmedRevenue = 0;
    let unconfirmedRevenue = 0;
    let orderCount = 0;
    const periodCustomers = new Set<string>();

    filteredOrders.forEach((o) => {
      orderCount += 1;
      if (isConfirmed(o)) {
        confirmedRevenue += o.total ?? o.total_price ?? 0;
      } else if (o.status !== 'cancelled') {
        unconfirmedRevenue += o.total ?? o.total_price ?? 0;
      }
      const k = o.customerId ?? o.customer_id ?? o.customerName ?? o.customer_name;
      if (k) periodCustomers.add(String(k));
    });

    let newCustomers = 0;
    periodCustomers.forEach((k) => { if (!priorCustomers.has(k)) newCustomers++; });

    return {
      revenue: confirmedRevenue,
      confirmedRevenue,
      unconfirmedRevenue,
      totalRevenue: confirmedRevenue + unconfirmedRevenue,
      orders: orderCount,
      avgOrderValue: orderCount > 0 ? confirmedRevenue / orderCount : 0,
      newCustomers,
    };
  }, [orders, filteredOrders, periodWindow, filterMode]);

  // ─── Revenue chart (granularity adapts to period) ──────────────────────────

  const periodRevenue = useMemo(() => {
    if (filterMode === 'today') {
      // Hourly buckets 6 am → 11 pm
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
      // Daily Mon → Sun (7 buckets)
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
          revenue: bucket.filter(isConfirmed).reduce((s, o) => s + (o.total ?? 0), 0),
          orders: bucket.length,
        };
      });
    }

    // Month or custom: daily (or weekly if range > 60 days)
    const rangeDays = Math.ceil(
      (periodWindow.end.getTime() - periodWindow.start.getTime()) / 86_400_000,
    );
    const weekly = rangeDays > 60;
    const step = weekly ? 7 : 1;
    const rows: { label: string; revenue: number; orders: number }[] = [];
    const cursor = new Date(periodWindow.start); cursor.setHours(0, 0, 0, 0);

    while (cursor <= periodWindow.end) {
      const s = new Date(cursor);
      const e = new Date(cursor); e.setDate(e.getDate() + step - 1); e.setHours(23, 59, 59, 999);
      if (e > periodWindow.end) e.setTime(periodWindow.end.getTime());

      const bucket = filteredOrders.filter((o) => {
        const d = parseOrderDate(o); return d ? d >= s && d <= e : false;
      });

      const label = weekly
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

  // ─── Category revenue ──────────────────────────────────────────────────────

  const categoryRevenue = useMemo(() => {
    const map = new Map<string, { category: string; revenue: number; orders: number }>();
    let total = 0;
    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      normalizeItems(o.items).forEach((item: any) => {
        const mid = item.menuItemId ?? item.menu_item_id;
        const cat = menuById[mid]?.category ?? item.category ?? item.menuItem?.category ?? 'other';
        const rev = Number(item.totalPrice ?? item.total_price ?? ((item.unitPrice ?? item.unit_price ?? 0) * (item.quantity ?? 1))) || 0;
        const existing = map.get(cat) ?? { category: cat, revenue: 0, orders: 0 };
        existing.revenue += rev;
        existing.orders += Number(item.quantity ?? 1);
        map.set(cat, existing);
        total += rev;
      });
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, percentage: total > 0 ? Math.round((r.revenue / total) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [filteredOrders, menuById]);

  // ─── Top menu items ─────────────────────────────────────────────────────────

  const parseBreakdown = (raw: any): any[] | null => {
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return p; } catch {}
    }
    return null;
  };

  const resolvePaymentMethod = (o: any): string => {
    const methodMap: Record<string, string> = {
      cash: 'Cash', '01': 'Cash',
      card: 'Card', '02': 'Card', credit_card: 'Card', debit_card: 'Card',
      cheque: 'Cheque', check: 'Cheque', '03': 'Cheque',
      'mobile money': 'MoMo', momo: 'MoMo', '04': 'MoMo',
      other: 'Other', '99': 'Other',
      'bank transfer': 'Bank Transfer', bank_transfer: 'Bank Transfer',
    };
    const breakdown = parseBreakdown(o.payment_breakdown ?? o.paymentBreakdown);
    if (breakdown) {
      const raw = breakdown[0]?.method;
      if (!raw) return 'Other';
      return methodMap[String(raw).toLowerCase().trim()] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
    const raw = o.payment_type ?? o.paymentType;
    if (!raw) return 'Other';
    return methodMap[String(raw).toLowerCase().trim()] ?? String(raw).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  };

  const availablePaymentMethods = useMemo(() => {
    const methods = new Set<string>();
    filteredOrders.forEach((o) => { methods.add(resolvePaymentMethod(o)); });
    return Array.from(methods).sort();
  }, [filteredOrders]);

  const itemFilteredOrders = useMemo(
    () => itemPaymentFilter === 'all'
      ? filteredOrders
      : filteredOrders.filter((o) => resolvePaymentMethod(o) === itemPaymentFilter),
    [filteredOrders, itemPaymentFilter],
  );

  const allItemStats = useMemo(() => {
    const stats = new Map<string, { name: string; revenue: number; qty: number; orders: number }>();
    itemFilteredOrders.forEach((o) => {
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
    return Array.from(stats.values()).sort((a, b) => b.revenue - a.revenue);
  }, [itemFilteredOrders, menuById]);

  const topItems = useMemo(() => allItemStats.slice(0, 5), [allItemStats]);

  // ─── Sales funnel ──────────────────────────────────────────────────────────

  const salesFunnel = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach((o) => { counts[o.status ?? 'pending'] = (counts[o.status ?? 'pending'] ?? 0) + 1; });
    return counts;
  }, [filteredOrders]);

  // ─── Section revenue (Kitchen / Buffet / Bar / Pool) ───────────────────────

  // ─── Payment method breakdown ──────────────────────────────────────────────

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    '01': 'Cash',    cash: 'Cash',
    '02': 'Card',    card: 'Card',    credit_card: 'Card',    debit_card: 'Card',
    '03': 'Cheque',  cheque: 'Cheque', check: 'Cheque',
    '04': 'MoMo',    'mobile money': 'MoMo', momo: 'MoMo',
    '99': 'Other',   other: 'Other',
    'bank transfer': 'Bank Transfer', bank_transfer: 'Bank Transfer',
  };

  const PAYMENT_METHOD_COLORS: Record<string, string> = {
    'Cash':          '#10b981',
    'Card':          '#3b82f6',
    'MoMo':          '#f59e0b',
    'Other':         '#6b7280',
    'Cheque':        '#8b5cf6',
    'Bank Transfer': '#06b6d4',
  };

  function resolveMethodLabel(raw: string | null | undefined): string {
    if (!raw) return 'Other';
    const key = raw.toLowerCase().trim();
    return PAYMENT_METHOD_LABELS[key] ?? PAYMENT_METHOD_LABELS[raw] ??
      raw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  const paymentMethodBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; total: number; orders: number; color: string }>();

    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      const breakdown = parseBreakdown(o.payment_breakdown ?? o.paymentBreakdown);
      const orderTotal = Number(o.total) || 0;

      if (breakdown) {
        // Accurate split: each entry has exact method amount
        breakdown.forEach((entry: any) => {
          const label = resolveMethodLabel(entry.method);
          const amount = Number(entry.amount) || 0;
          const existing = map.get(label) ?? { label, total: 0, orders: 0, color: PAYMENT_METHOD_COLORS[label] ?? '#6b7280' };
          existing.total += amount;
          existing.orders += 1;
          map.set(label, existing);
        });
      } else {
        // Fallback: primary method code, whole order total
        const label = resolveMethodLabel(o.payment_type ?? o.paymentType ?? null);
        const existing = map.get(label) ?? { label, total: 0, orders: 0, color: PAYMENT_METHOD_COLORS[label] ?? '#6b7280' };
        existing.total += orderTotal;
        existing.orders += 1;
        map.set(label, existing);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  const paymentTotal = paymentMethodBreakdown.reduce((s, m) => s + m.total, 0);

  // ─── Dynamic section computations ──────────────────────────────────────────────────────────

  // All known categories from menu + current period's orders
  const knownCategories = useMemo(() => {
    const cats = new Set<string>();
    menuItems.forEach((item: any) => {
      const c = String(item.category ?? '').toLowerCase().trim();
      if (c) cats.add(c);
    });
    filteredOrders.forEach((o) => {
      normalizeItems(o.items).forEach((item: any) => {
        const c = String(item.category ?? item.menuItem?.category ?? item.menu_item?.category ?? '').toLowerCase().trim();
        if (c) cats.add(c);
      });
    });
    return Array.from(cats).sort();
  }, [menuItems, filteredOrders]);

  // category → section name lookup (from manager config)
  const categoryToSection = useMemo(() => {
    const map = new Map<string, string>();
    sectionGroups.forEach((g) => g.categories.forEach((c) => map.set(c, g.name)));
    return map;
  }, [sectionGroups]);

  // Resolve which display name an item's raw category maps to
  const resolveSection = (item: any): string => {
    const cat = String(item.category ?? item.menuItem?.category ?? item.menu_item?.category ?? '').toLowerCase().trim();
    if (!cat) return 'Other';
    const mapped = categoryToSection.get(cat);
    if (mapped) return mapped;
    // Not in any group → display as formatted category name
    return cat.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Ordered list of section names that have any data in this period + their colours
  const sectionRevenueByDay = useMemo((): DynSectionDay[] => {
    const dayMap = new Map<string, DynSectionDay>();
    filteredOrders.forEach((o) => {
      if (!isConfirmed(o)) return;
      const d = parseOrderDate(o); if (!d) return;
      const dateKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, { date: dateKey, label, total: 0 });
      const day = dayMap.get(dateKey)!;
      normalizeItems(o.items).forEach((item: any) => {
        const section = resolveSection(item);
        const rev = Number(item.totalPrice ?? item.total_price ?? ((item.unitPrice ?? item.unit_price ?? 0) * (item.quantity ?? 1))) || 0;
        day[section] = ((day[section] as number) ?? 0) + rev;
        day.total += rev;
      });
    });
    return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredOrders, categoryToSection]);

  // Sections that actually appear in the data, configured ones first
  const activeSections = useMemo(() => {
    const inData = new Set<string>();
    sectionRevenueByDay.forEach((day) =>
      Object.entries(day).forEach(([k, v]) => {
        if (k !== 'date' && k !== 'label' && k !== 'total' && (v as number) > 0) inData.add(k);
      }),
    );
    const ordered: string[] = [];
    sectionGroups.forEach((g) => { if (inData.has(g.name)) ordered.push(g.name); });
    inData.forEach((n) => { if (!ordered.includes(n)) ordered.push(n); });
    return ordered;
  }, [sectionGroups, sectionRevenueByDay]);

  // Colour for each active section
  const sectionColors = useMemo(() => {
    const map: Record<string, string> = {};
    sectionGroups.forEach((g) => { map[g.name] = g.color; });
    let idx = 0;
    activeSections.forEach((name) => {
      if (!map[name]) { map[name] = AUTO_COLORS[idx % AUTO_COLORS.length]; idx++; }
    });
    return map;
  }, [sectionGroups, activeSections]);

  const sectionRevenueSummary = useMemo(() => {
    const totals: Record<string, number> & { total: number } = { total: 0 };
    sectionRevenueByDay.forEach((day) => {
      activeSections.forEach((s) => {
        totals[s] = (totals[s] ?? 0) + ((day[s] as number) ?? 0);
      });
      totals.total += day.total;
    });
    return totals;
  }, [sectionRevenueByDay, activeSections]);

  // ─── Derived display values ─────────────────────────────────────────────────

  const periodLabel =
    filterMode === 'today' ? 'Today'
    : filterMode === 'week' ? 'This Week'
    : filterMode === 'month' ? 'This Month'
    : customStart && customEnd ? `${customStart} — ${customEnd}`
    : 'Custom Range';

  const revenueProgress  = Math.min(100, kpiTargets.revenue > 0      ? (periodMetrics.totalRevenue  / kpiTargets.revenue)      * 100 : 0);
  const ordersProgress   = Math.min(100, kpiTargets.orders > 0       ? (periodMetrics.orders        / kpiTargets.orders)        * 100 : 0);
  const avgOvProgress    = Math.min(100, kpiTargets.avgOrderValue > 0 ? (periodMetrics.avgOrderValue / kpiTargets.avgOrderValue) * 100 : 0);

  const totalRevenue     = periodRevenue.reduce((s, d) => s + d.revenue, 0);
  const totalOrders      = periodRevenue.reduce((s, d) => s + d.orders, 0);

  const catData = categoryRevenue.map((c, i) => ({
    ...c,
    name: c.category.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    color: CAT_COLORS[i % CAT_COLORS.length],
  }));

  const downloadCSV = () => {
    const header = 'period,revenue,orders\n';
    const rows = periodRevenue.map((d) => `"${d.label}",${d.revenue},${d.orders}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `analytics_${filterMode}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dark min-h-screen bg-slate-900 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100">Analytics</h1>
            <p className="text-slate-400 text-sm mt-0.5">{periodLabel}</p>
          </div>
          <button
            onClick={downloadCSV}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-slate-800 rounded-xl border border-slate-700">
          {(['today', 'week', 'month', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filterMode === mode
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              {mode === 'today' ? 'Today'
               : mode === 'week' ? 'This Week'
               : mode === 'month' ? 'This Month'
               : <span className="flex items-center gap-1.5"><CalendarIcon className="w-3.5 h-3.5" />Custom Range</span>}
            </button>
          ))}

          {filterMode === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-700 text-white px-2 py-1.5 rounded-lg text-xs border border-slate-600 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-700 text-white px-2 py-1.5 rounded-lg text-xs border border-slate-600 focus:outline-none focus:border-emerald-500"
              />
              {customStart && customEnd && (
                <button
                  onClick={() => { setCustomStart(''); setCustomEnd(''); }}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {isLoading && (
            <span className="ml-auto text-xs text-slate-400 animate-pulse">Loading…</span>
          )}
        </div>

        {loadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {loadError}
          </div>
        )}

        {/* ── KPI cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
          {/* Total Revenue */}
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">{formatPrice(periodMetrics.totalRevenue)}</p>
            <div className="h-1.5 bg-slate-700 rounded mt-2 overflow-hidden">
              <div style={{ width: `${revenueProgress}%` }} className="h-full bg-emerald-400 transition-all" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-slate-500">target</span>
              <input
                type="number" min={0} value={kpiTargets.revenue}
                onChange={(e) => setKpiTargets((p) => ({ ...p, revenue: Number(e.target.value) }))}
                className="w-24 bg-slate-700 text-white px-2 py-0.5 rounded text-xs text-right"
              />
            </div>
          </Card>

          {/* Orders */}
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Orders</p>
            <p className="text-2xl font-bold text-sky-400">{periodMetrics.orders.toLocaleString()}</p>
            <div className="h-1.5 bg-slate-700 rounded mt-2 overflow-hidden">
              <div style={{ width: `${ordersProgress}%` }} className="h-full bg-sky-400 transition-all" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-slate-500">target</span>
              <input
                type="number" min={0} value={kpiTargets.orders}
                onChange={(e) => setKpiTargets((p) => ({ ...p, orders: Number(e.target.value) }))}
                className="w-20 bg-slate-700 text-white px-2 py-0.5 rounded text-xs text-right"
              />
            </div>
          </Card>

          {/* Avg order value */}
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Avg Order Value</p>
            <p className="text-2xl font-bold text-amber-400">{formatPrice(periodMetrics.avgOrderValue)}</p>
            <div className="h-1.5 bg-slate-700 rounded mt-2 overflow-hidden">
              <div style={{ width: `${avgOvProgress}%` }} className="h-full bg-amber-400 transition-all" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-slate-500">target</span>
              <input
                type="number" min={0} value={kpiTargets.avgOrderValue}
                onChange={(e) => setKpiTargets((p) => ({ ...p, avgOrderValue: Number(e.target.value) }))}
                className="w-20 bg-slate-700 text-white px-2 py-0.5 rounded text-xs text-right"
              />
            </div>
          </Card>

          {/* New customers */}
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">New Customers</p>
            <p className="text-2xl font-bold text-violet-400">{periodMetrics.newCustomers}</p>
            <p className="text-xs text-slate-500 mt-2">First-time buyers this period</p>
            {filterMode === 'custom' && (
              <p className="text-xs text-slate-600 mt-0.5">Approximate for custom range</p>
            )}
          </Card>
        </div>

        {/* ── Revenue breakdown: confirmed vs awaiting ──────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="bg-slate-800 p-4">
            <p className="text-xs text-slate-400 mb-1">Confirmed Revenue</p>
            <p className="text-2xl font-bold text-teal-400">{formatPrice(periodMetrics.confirmedRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1">Payment confirmed by supervisor</p>
          </Card>
          <Card className={`p-4 ${periodMetrics.unconfirmedRevenue > 0 ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-800'}`}>
            <p className={`text-xs mb-1 ${periodMetrics.unconfirmedRevenue > 0 ? 'text-orange-300' : 'text-slate-400'}`}>Awaiting Payment</p>
            <p className={`text-2xl font-bold ${periodMetrics.unconfirmedRevenue > 0 ? 'text-orange-400' : 'text-slate-500'}`}>{formatPrice(periodMetrics.unconfirmedRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1">Not yet confirmed</p>
          </Card>
        </div>

        {/* ── Revenue trend chart ───────────────────────────────────────── */}
        <Card className="bg-slate-800 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-100">
              Revenue &amp; Orders — {periodLabel}
            </h3>
            <div className="text-right">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-sm font-bold text-emerald-400">{formatPrice(totalRevenue)}</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periodRevenue} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={10}
                  interval="preserveStartEnd"
                  tick={{ fill: '#94a3b8' }}
                />
                <YAxis
                  yAxisId="rev"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(v) => formatPrice(v)}
                  width={80}
                />
                <YAxis
                  yAxisId="ord"
                  orientation="right"
                  stroke="#64748b"
                  fontSize={10}
                  width={30}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  formatter={(value: number, name: string) =>
                    name === 'Revenue' ? [formatPrice(value), name] : [value, name]
                  }
                />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
                <Bar yAxisId="rev" dataKey="revenue" fill="#10b981" name="Revenue" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="ord" dataKey="orders"  fill="#38bdf8" name="Orders"  radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ── Top items + Sales funnel ───────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-3">Top 5 Menu Items</h3>
            {topItems.length === 0 ? (
              <p className="text-sm text-slate-500">No order data for this period</p>
            ) : (
              <ol className="space-y-2">
                {topItems.map((item, i) => (
                  <li key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 text-slate-300 text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-slate-200 truncate max-w-36">{item.name}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-amber-300 font-semibold">{formatPrice(item.revenue)}</p>
                      <p className="text-slate-500 text-xs">{item.qty} sold</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-3">Order Status — {periodLabel}</h3>
            <div className="space-y-2">
              {[
                { key: 'pending',   label: 'Pending',   color: 'bg-amber-400' },
                { key: 'verified',  label: 'Verified',  color: 'bg-indigo-400' },
                { key: 'preparing', label: 'Preparing', color: 'bg-orange-400' },
                { key: 'ready',     label: 'Ready',     color: 'bg-teal-400' },
                { key: 'served',    label: 'Served',    color: 'bg-emerald-400' },
                { key: 'cancelled', label: 'Cancelled', color: 'bg-red-400' },
              ].map(({ key, label, color }) => {
                const count = salesFunnel[key] ?? 0;
                const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                    <span className="text-slate-300 w-20">{label}</span>
                    <div className="flex-1 h-1.5 bg-slate-700 rounded overflow-hidden">
                      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-slate-400 text-xs w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Item Revenue Breakdown ──────────────────────────────────── */}
        <Card className="bg-slate-800 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-100">Item Revenue Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {allItemStats.length} items · {itemFilteredOrders.length} orders · {periodLabel}
                {itemPaymentFilter !== 'all' && <span className="text-emerald-400"> · {itemPaymentFilter}</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={itemPaymentFilter}
                onChange={(e) => { setItemPaymentFilter(e.target.value); setItemPage(0); }}
                className="bg-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Payments</option>
                {availablePaymentMethods.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400">Show</span>
              <select
                value={itemPageSize}
                onChange={(e) => { setItemPageSize(Number(e.target.value)); setItemPage(0); }}
                className="bg-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-emerald-500"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400">per page</span>
            </div>
          </div>

          {allItemStats.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No item data for this period.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2 pr-4 font-medium w-8">#</th>
                      <th className="text-left text-slate-400 py-2 pr-4 font-medium">Item</th>
                      <th className="text-right text-slate-400 py-2 px-2 font-medium">Qty Sold</th>
                      <th className="text-right text-slate-400 py-2 px-2 font-medium">Orders</th>
                      <th className="text-right text-slate-400 py-2 pl-4 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItemStats.slice(itemPage * itemPageSize, (itemPage + 1) * itemPageSize).map((item, i) => (
                      <tr key={item.name} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                        <td className="py-2 pr-4 text-slate-500 text-xs">{itemPage * itemPageSize + i + 1}</td>
                        <td className="py-2 pr-4 text-slate-200 font-medium">{item.name}</td>
                        <td className="py-2 px-2 text-right text-slate-300">{item.qty}</td>
                        <td className="py-2 px-2 text-right text-slate-300">{item.orders}</td>
                        <td className="py-2 pl-4 text-right font-semibold text-amber-300">{formatPrice(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-600">
                      <td colSpan={2} className="py-3 pr-4 font-bold text-gray-100">Total</td>
                      <td className="py-3 px-2 text-right font-bold text-gray-100">
                        {allItemStats.reduce((s, it) => s + it.qty, 0)}
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-gray-100">
                        {filteredOrders.length}
                      </td>
                      <td className="py-3 pl-4 text-right font-bold text-emerald-400">
                        {formatPrice(allItemStats.reduce((s, it) => s + it.revenue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination controls */}
              {allItemStats.length > itemPageSize && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
                  <p className="text-xs text-slate-400">
                    Showing {itemPage * itemPageSize + 1}–{Math.min((itemPage + 1) * itemPageSize, allItemStats.length)} of {allItemStats.length} items
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setItemPage(0)}
                      disabled={itemPage === 0}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setItemPage((p) => Math.max(0, p - 1))}
                      disabled={itemPage === 0}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-slate-400 px-2">
                      {itemPage + 1} / {Math.ceil(allItemStats.length / itemPageSize)}
                    </span>
                    <button
                      onClick={() => setItemPage((p) => Math.min(Math.ceil(allItemStats.length / itemPageSize) - 1, p + 1))}
                      disabled={(itemPage + 1) * itemPageSize >= allItemStats.length}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setItemPage(Math.ceil(allItemStats.length / itemPageSize) - 1)}
                      disabled={(itemPage + 1) * itemPageSize >= allItemStats.length}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Payment method breakdown ─────────────────────────────────── */}
        <Card className="bg-slate-800 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-100">Payment Method Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Revenue by channel — {periodLabel} · confirmed payments only
              </p>
            </div>
            <p className="text-sm font-bold text-emerald-400">{formatPrice(paymentTotal)}</p>
          </div>

          {paymentMethodBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              No confirmed payments for this period.
            </p>
          ) : (
            <div className="space-y-3">
              {paymentMethodBreakdown.map((m) => {
                const pct = paymentTotal > 0 ? (m.total / paymentTotal) * 100 : 0;
                return (
                  <div key={m.label} className="grid grid-cols-[1fr_auto] gap-x-4 items-center">
                    {/* Label + bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                          <span className="text-sm font-medium text-slate-200">{m.label}</span>
                          <span className="text-xs text-slate-500">
                            {m.orders} {m.orders === 1 ? 'order' : 'orders'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{Math.round(pct)}%</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${pct}%`, backgroundColor: m.color }}
                        />
                      </div>
                    </div>
                    {/* Amount */}
                    <p className="text-sm font-bold text-right text-gray-100 whitespace-nowrap">
                      {formatPrice(m.total)}
                    </p>
                  </div>
                );
              })}

              {/* Reconciliation note for orders without breakdown */}
              {filteredOrders.some((o) => isConfirmed(o) && !o.payment_breakdown && !o.paymentBreakdown && !o.payment_type && !o.paymentType) && (
                <p className="text-xs text-slate-600 pt-1 border-t border-slate-700/50">
                  Some older orders have no recorded payment method and are counted under "Other".
                </p>
              )}
            </div>
          )}
        </Card>

        {/* ── Revenue by category ───────────────────────────────────────── */}
        {catData.length > 0 && (
          <Card className="bg-slate-800 mb-4">
            <h3 className="text-base font-semibold text-gray-100 mb-4">Revenue by Category</h3>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="h-52 w-full sm:w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={80}
                      paddingAngle={2}
                      dataKey="revenue"
                    >
                      {catData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(value: number) => [formatPrice(value), 'Revenue']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5 w-full">
                {catData.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-slate-300">{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-200 font-medium">{formatPrice(cat.revenue)}</span>
                      <span className="text-slate-500 text-xs ml-2">({cat.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* ── Section Revenue Report ────────────────────────────────────── */}
        <Card className="bg-slate-800 mt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-100">Section Revenue Report</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeSections.length > 0
                  ? activeSections.join(' · ')
                  : 'No sections configured'}
                {' '}— confirmed payments · {periodLabel}
              </p>
            </div>
            <button
              onClick={() => setShowSectionConfig(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors shrink-0"
            >
              <Settings2Icon className="w-3.5 h-3.5" />
              Configure Sections
            </button>
          </div>

          {sectionRevenueByDay.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No confirmed revenue for this period.
              {activeSections.length === 0 && (
                <span> <button onClick={() => setShowSectionConfig(true)} className="underline text-emerald-400">Configure sections</button> to group your categories.</span>
              )}
            </p>
          ) : (
            <>
              {/* Stacked chart */}
              <div className="h-60 mb-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectionRevenueByDay} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} interval="preserveStartEnd" />
                    <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => formatPrice(v)} width={80} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => [formatPrice(value), name]}
                    />
                    <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
                    {activeSections.map((s) => (
                      <Bar key={s} dataKey={s} stackId="sec" fill={sectionColors[s]} name={s} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Summary cards */}
              <div
                className="grid gap-2 mb-5"
                style={{ gridTemplateColumns: `repeat(${Math.min(activeSections.length, 5)}, minmax(0, 1fr))` }}
              >
                {activeSections.map((s) => {
                  const rev = (sectionRevenueSummary[s] as number) ?? 0;
                  const pct = sectionRevenueSummary.total > 0
                    ? Math.round((rev / sectionRevenueSummary.total) * 100) : 0;
                  return (
                    <div
                      key={s}
                      className="rounded-lg p-3"
                      style={{ backgroundColor: sectionColors[s] + '18', border: `1px solid ${sectionColors[s]}44` }}
                    >
                      <p className="text-xs font-semibold mb-1 truncate" style={{ color: sectionColors[s] }}>{s}</p>
                      <p className="text-base font-bold text-white">{formatPrice(rev)}</p>
                      <p className="text-xs text-slate-400">{pct}%</p>
                    </div>
                  );
                })}
              </div>

              {/* Daily table */}
              <div className="flex items-center justify-end gap-2 mb-3">
                <span className="text-xs text-slate-400">Show</span>
                <select
                  value={sectionPageSize}
                  onChange={(e) => { setSectionPageSize(Number(e.target.value)); setSectionPage(0); }}
                  className="bg-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-emerald-500"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">per page</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2 pr-4 font-medium">Date</th>
                      {activeSections.map((s) => (
                        <th key={s} className="text-right text-slate-400 py-2 px-2 font-medium whitespace-nowrap">{s}</th>
                      ))}
                      <th className="text-right text-slate-400 py-2 pl-4 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRevenueByDay.slice(sectionPage * sectionPageSize, (sectionPage + 1) * sectionPageSize).map((day) => (
                      <tr key={day.date} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                        <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{day.label}</td>
                        {activeSections.map((s) => {
                          const v = (day[s] as number) ?? 0;
                          return (
                            <td key={s} className="py-2 px-2 text-right text-slate-200">
                              {v > 0 ? formatPrice(v) : <span className="text-slate-600">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-2 pl-4 text-right font-semibold text-gray-100">{formatPrice(day.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-600">
                      <td className="py-3 pr-4 font-bold text-gray-100">Total</td>
                      {activeSections.map((s) => {
                        const v = (sectionRevenueSummary[s] as number) ?? 0;
                        return (
                          <td key={s} className="py-3 px-2 text-right font-bold" style={{ color: sectionColors[s] }}>
                            {v > 0 ? formatPrice(v) : <span className="text-slate-600">—</span>}
                          </td>
                        );
                      })}
                      <td className="py-3 pl-4 text-right font-bold text-emerald-400 text-base">
                        {formatPrice(sectionRevenueSummary.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {sectionRevenueByDay.length > sectionPageSize && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
                  <p className="text-xs text-slate-400">
                    Showing {sectionPage * sectionPageSize + 1}–{Math.min((sectionPage + 1) * sectionPageSize, sectionRevenueByDay.length)} of {sectionRevenueByDay.length} days
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSectionPage(0)}
                      disabled={sectionPage === 0}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setSectionPage((p) => Math.max(0, p - 1))}
                      disabled={sectionPage === 0}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-slate-400 px-2">
                      {sectionPage + 1} / {Math.ceil(sectionRevenueByDay.length / sectionPageSize)}
                    </span>
                    <button
                      onClick={() => setSectionPage((p) => Math.min(Math.ceil(sectionRevenueByDay.length / sectionPageSize) - 1, p + 1))}
                      disabled={(sectionPage + 1) * sectionPageSize >= sectionRevenueByDay.length}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setSectionPage(Math.ceil(sectionRevenueByDay.length / sectionPageSize) - 1)}
                      disabled={(sectionPage + 1) * sectionPageSize >= sectionRevenueByDay.length}
                      className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Section config modal ──────────────────────────────────────── */}
        {showSectionConfig && (
          <SectionConfigModal
            sections={sectionGroups}
            availableCategories={knownCategories}
            onSave={saveSectionGroups}
            onClose={() => setShowSectionConfig(false)}
          />
        )}

      </div>
    </div>
  );
}
