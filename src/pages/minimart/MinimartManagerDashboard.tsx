import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LogOutIcon, RefreshCwIcon, TrendingUpIcon, ReceiptIcon,
  ShoppingBagIcon, UsersIcon, PlusIcon, TrashIcon, EyeIcon, EyeOffIcon,
  PackageIcon, DownloadIcon, TagIcon, ZapIcon, BarChart2Icon,
  LineChartIcon, SettingsIcon, AlertTriangleIcon, RotateCcwIcon,
  CheckIcon, XIcon,
} from 'lucide-react';
import { ClockIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { signUpStaff, deleteStaff, fetchAllStaff } from '../../api/auth';
import { formatPrice } from '../../utils/currency';
import { InventoryManagement } from '../shared/InventoryManagement';
import { exportTransactionsToCsv } from '../../utils/minimartProductImportExport';
import { MinimartProductManagement } from './MinimartProductManagement';
import { getMinimartSettings, upsertMinimartSettings } from '../../api/minimartSettings';
import { fetchRefundRequests, approveRefundRequest, denyRefundRequest } from '../../api/refunds';
import type { MinimartRefundRequest } from '../../api/refunds';
import { openShift, closeShift } from '../../api/shifts';
import type { CashierShift } from '../../api/shifts';
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
  grossProfit: number;
  cogs: number;
  totalRefunds: number;
  transactions: number;
  avgSale: number;
  totalItems: number;
  peakDay: string;
  hourlyBars: Array<{ hour: string; revenue: number; count: number }>;
  byCashier: Record<string, { count: number; revenue: number }>;
  byPayment: Record<string, { count: number; revenue: number }>;
  byCategory: Record<string, { qty: number; revenue: number }>;
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
type Page = 'dashboard' | 'transactions' | 'shifts' | 'products' | 'inventory' | 'cashiers' | 'analytics' | 'settings' | 'refunds';
type TransactionSort = 'newest' | 'oldest';

interface MarginStat {
  id: string;
  name: string;
  price: number;
  cost: number;
  margin: number;
  marginPct: number;
  soldQty: number;
  soldRevenue: number;
  soldCost: number;
  stock: number;
}

interface WasteStat {
  name: string;
  qty: number;
  cost: number;
  reason: string;
}

interface Analytics {
  marginStats: MarginStat[];
  wasteStats: WasteStat[];
  totalWasteCost: number;
  totalRevenue: number;
  totalCostOfGoods: number;
  grossMargin: number;
  trackedItems: number;
  soldItems: number;
}

const PAYMENT_LABEL: Record<string, string> = {
  '01': 'Cash', '02': 'Card', '04': 'Mobile Money',
};

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

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
  const [sessionRestaurantId, setSessionRestaurantId] = useState('');
  const activeRestaurantId = sessionRestaurantId || restaurantId;

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const token = data.session?.access_token;
      const payload = token ? decodeJwtPayload(token) : null;
      const claim = payload?.restaurant_id;
      if (typeof claim === 'string' && claim.trim()) {
        setSessionRestaurantId(claim.trim());
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const [page, setPage] = useState<Page>('dashboard');
  const [dateFilter, setDateFilter] = useState<DateFilter>('7d');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({
    revenue: 0, grossProfit: 0, cogs: 0, totalRefunds: 0, transactions: 0, avgSale: 0, totalItems: 0, peakDay: '',
    hourlyBars: [],
    byCashier: {}, byPayment: {}, byCategory: {}, dailyBars: [], topProducts: [],
  });
  const [loading, setLoading] = useState(true);

  // Refund requests
  const [pendingRefunds, setPendingRefunds] = useState<MinimartRefundRequest[]>([]);
  const [allRefunds, setAllRefunds] = useState<MinimartRefundRequest[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [reviewingRefund, setReviewingRefund] = useState<MinimartRefundRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  // Cashiers tab
  const [cashiers, setCashiers] = useState<Staff[]>([]);
  const [cashiersLoading, setCashiersLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Transactions tab search
  const [txnSearch, setTxnSearch] = useState('');
  const [txnCashierFilter, setTxnCashierFilter] = useState('all');
  const [txnPaymentFilter, setTxnPaymentFilter] = useState('all');
  const [txnSort, setTxnSort] = useState<TransactionSort>('newest');

  // Analytics
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Shifts tab
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftStatusFilter, setShiftStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [showOpenShiftForm, setShowOpenShiftForm] = useState(false);
  const [openShiftCashierId, setOpenShiftCashierId] = useState('');
  const [openShiftFloat, setOpenShiftFloat] = useState('');
  const [closingShiftId, setClosingShiftId] = useState<string | null>(null);
  const [closingFloat, setClosingFloat] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [shiftSaving, setShiftSaving] = useState(false);

  // Settings
  const [taxRate, setTaxRate] = useState('0');
  const [taxLabel, setTaxLabel] = useState('Tax');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

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

      const candidateSelects = [
        'id, order_number, total, items, created_at, payment_confirmed_by_name, payment_confirmed_by, payment_status, payment_type',
        'id, order_number, total, items, created_at, payment_confirmed_by_name, payment_confirmed_by, payment_status, payment_method',
        'id, order_number, total, items, created_at, payment_confirmed_by, payment_status, payment_method',
        'id, order_number, total, items, created_at, payment_confirmed_by, payment_status',
        'id, order_number, total, items, created_at, payment_status',
        'id, order_number, total, items, created_at',
      ];

      let data: any[] | null = null;
      let error: any = null;
      for (const selectCols of candidateSelects) {
        const res = await supabase
          .from('orders')
          .select(selectCols)
          .eq('restaurant_id', activeRestaurantId)
          .gte('created_at', from.toISOString())
          .order('created_at', { ascending: false });

        if (!res.error) {
          data = res.data || [];
          error = null;
          break;
        }
        error = res.error;

        const msg = String(res.error.message || '').toLowerCase();
        if (!msg.includes('column') && !msg.includes('does not exist')) {
          break;
        }
      }

      if (error) throw error;

      // Build a cashier ID → name lookup from staff for existing records without a stored name
      let cashierNameMap: Record<string, string> = {};
      try {
        const allStaff = await fetchAllStaff();
        cashierNameMap = Object.fromEntries(
          allStaff
            .filter((s) => s.restaurantId === activeRestaurantId)
            .map((s) => [s.id, s.name])
        );
      } catch {
        // non-fatal — fall back to raw id
      }

      const txns: Transaction[] = (data || [])
        .filter((o: any) => ['confirmed', 'paid', 'completed'].includes((o.payment_status || '').toLowerCase()))
        .map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number || o.id.slice(-6).toUpperCase(),
        cashierName: o.payment_confirmed_by_name ||
          (o.payment_confirmed_by ? cashierNameMap[o.payment_confirmed_by] : undefined) ||
          'Cashier',
        total: o.total || 0,
        paymentMethod: PAYMENT_LABEL[o.payment_type || o.payment_method] || o.payment_type || o.payment_method || 'Cash',
        itemCount: Array.isArray(o.items)
          ? o.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0)
          : 0,
        items: Array.isArray(o.items) ? o.items : [],
        createdAt: o.created_at,
      }));

      const revenue = txns.reduce((s, t) => s + t.total, 0);

      const byCashier: Record<string, { count: number; revenue: number }> = {};
      const byPayment: Record<string, { count: number; revenue: number }> = {};
      const byCategory: Record<string, { qty: number; revenue: number }> = {};
      const productMap: Record<string, { qty: number; revenue: number }> = {};
      let totalItems = 0;

      // Cost map for gross profit estimate on dashboard cards
      const { data: invCostRows } = await supabase
        .from('inventory_records')
        .select('menu_item_id, unit_cost')
        .eq('restaurant_id', activeRestaurantId);
      const unitCostMap: Record<string, number> = {};
      (invCostRows || []).forEach((r: any) => {
        if (r.menu_item_id) unitCostMap[r.menu_item_id] = Number(r.unit_cost ?? 0);
      });
      let totalCostOfGoods = 0;

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
          const rev = item.total_price || item.totalPrice || (item.unit_price || 0) * qty || 0;
          const menuItemId = item.menu_item_id || item.menuItemId || '';
          const unitCost = unitCostMap[menuItemId] ?? 0;
          totalCostOfGoods += unitCost * qty;
          const cat = item.category || 'Uncategorized';
          if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
          productMap[name].qty += qty;
          productMap[name].revenue += rev;
          if (!byCategory[cat]) byCategory[cat] = { qty: 0, revenue: 0 };
          byCategory[cat].qty += qty;
          byCategory[cat].revenue += rev;
          totalItems += qty;
        });
      });

      const topProducts = Object.entries(productMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      const days = dateFilter === 'today' ? 1 : dateFilter === '7d' ? 7 : 30;
      const dailyBars = buildDailyBars(txns, days);
      const peakBar = dailyBars.reduce((best, b) => b.revenue > best.revenue ? b : best, { day: '', revenue: 0 });

      // Hourly breakdown (only meaningful for today filter)
      const hourlyMap: Record<number, { revenue: number; count: number }> = {};
      for (let h = 0; h < 24; h++) hourlyMap[h] = { revenue: 0, count: 0 };
      txns.forEach((t) => {
        const h = new Date(t.createdAt).getHours();
        hourlyMap[h].revenue += t.total;
        hourlyMap[h].count += 1;
      });
      // Collect hours that have sales
      const hourlyBarsFinal = Array.from({ length: 24 }, (_, h) => ({
        hour: `${String(h).padStart(2, '0')}:00`,
        revenue: hourlyMap[h].revenue,
        count: hourlyMap[h].count,
      })).filter((b) => b.count > 0);

      // Fetch refunds for the same period to compute net revenue
      let totalRefunds = 0;
      try {
        const { data: refundData } = await supabase
          .from('minimart_refunds')
          .select('refund_amount')
          .eq('restaurant_id', activeRestaurantId)
          .gte('created_at', from.toISOString());
        totalRefunds = (refundData || []).reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0);
      } catch {
        // non-fatal — table may not exist yet
      }

      const netRevenue = Math.max(0, revenue - totalRefunds);
      const grossProfit = netRevenue - totalCostOfGoods;

      setTransactions(txns);
      setSummary({
        revenue: netRevenue,
        grossProfit,
        cogs: totalCostOfGoods,
        totalRefunds,
        transactions: txns.length,
        avgSale: txns.length > 0 ? netRevenue / txns.length : 0,
        totalItems,
        peakDay: peakBar.day,
        hourlyBars: hourlyBarsFinal,
        byCashier, byPayment, byCategory, dailyBars, topProducts,
      });
    } catch (err) {
      console.error('Failed to load minimart transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, dateFilter]);

  const loadCashiers = useCallback(async () => {
    setCashiersLoading(true);
    try {
      const all = await fetchAllStaff();
      setCashiers(all.filter((s) => s.role === 'cashier' && s.restaurantId === activeRestaurantId));
    } catch (err) {
      console.error('Failed to load cashiers:', err);
    } finally {
      setCashiersLoading(false);
    }
  }, [activeRestaurantId]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      const fromIso = from.toISOString();

      const orderSelectCandidates = [
        'id, total, items, created_at, payment_status',
        'id, total, items, created_at',
      ];

      let analyticsOrders: any[] = [];
      for (const selectCols of orderSelectCandidates) {
        const res = await supabase
          .from('orders')
          .select(selectCols)
          .eq('restaurant_id', activeRestaurantId)
          .gte('created_at', fromIso)
          .order('created_at', { ascending: false });
        if (!res.error) {
          analyticsOrders = (res.data || []).filter((o: any) => {
            const ps = String(o.payment_status || '').toLowerCase();
            return !ps || ['confirmed', 'paid', 'completed'].includes(ps);
          });
          break;
        }
        const msg = String(res.error.message || '').toLowerCase();
        if (!msg.includes('column') && !msg.includes('does not exist')) break;
      }

      // Fetch products, inventory costs/stock, and waste entries in parallel
      const [invRes, wasteRes, productsRes] = await Promise.allSettled([
        supabase
          .from('inventory_records')
          .select('menu_item_id, unit_cost, stock')
          .eq('restaurant_id', activeRestaurantId),
        supabase
          .from('waste_entries')
          .select('menu_item_name, qty, unit_cost, total_cost, reason')
          .eq('restaurant_id', activeRestaurantId)
          .gte('timestamp', fromIso),
        supabase
          .from('menu_items')
          .select('id, name, price')
          .eq('restaurant_id', activeRestaurantId),
      ]);

      const invMap: Record<string, { unitCost: number; stock: number }> = {};
      if (invRes.status === 'fulfilled' && !invRes.value.error) {
        (invRes.value.data || []).forEach((r: any) => {
          if (r.menu_item_id) {
            invMap[r.menu_item_id] = {
              unitCost: Number(r.unit_cost ?? 0),
              stock: Number(r.stock ?? 0),
            };
          }
        });
      }

      const wasteByName: Record<string, WasteStat> = {};
      let totalWasteCost = 0;
      if (wasteRes.status === 'fulfilled' && !wasteRes.value.error) {
        (wasteRes.value.data || []).forEach((w: any) => {
          const name = w.menu_item_name || 'Unknown';
          const cost = Number(w.total_cost ?? w.unit_cost ?? 0) * (w.total_cost ? 1 : (w.qty ?? 1));
          if (!wasteByName[name]) wasteByName[name] = { name, qty: 0, cost: 0, reason: w.reason || 'other' };
          wasteByName[name].qty += Number(w.qty ?? 0);
          wasteByName[name].cost += cost;
          totalWasteCost += cost;
        });
      }

      // Build price map from menu items
      const products: Array<{ id: string; name: string; price: number }> = [];
      if (productsRes.status === 'fulfilled' && !productsRes.value.error) {
        (productsRes.value.data || []).forEach((p: any) => {
          products.push({ id: p.id, name: p.name || 'Unknown', price: Number(p.price ?? 0) });
        });
      }

      const menuMap: Record<string, { name: string; price: number }> = {};
      const menuNameToId: Record<string, string> = {};
      products.forEach((p) => {
        menuMap[p.id] = { name: p.name, price: p.price };
        menuNameToId[p.name.trim().toLowerCase()] = p.id;
      });

      const soldMap: Record<string, { qty: number; revenue: number }> = {};
      analyticsOrders.forEach((o: any) => {
        const orderItems: any[] = Array.isArray(o.items) ? o.items : [];
        orderItems.forEach((item: any) => {
          const rawName = item.menu_item_name || item.menuItemName || item.name || '';
          const directId = item.menu_item_id || item.menuItemId || '';
          const resolvedId = directId || menuNameToId[String(rawName).trim().toLowerCase()] || '';
          if (!resolvedId) return;

          const qty = Number(item.quantity || 1);
          const rev = Number(item.total_price || item.totalPrice || (item.unit_price || 0) * qty || 0);
          if (!soldMap[resolvedId]) soldMap[resolvedId] = { qty: 0, revenue: 0 };
          soldMap[resolvedId].qty += qty;
          soldMap[resolvedId].revenue += rev;
        });
      });

      const idSet = new Set<string>([
        ...Object.keys(menuMap),
        ...Object.keys(invMap),
        ...Object.keys(soldMap),
      ]);

      const marginStats: MarginStat[] = Array.from(idSet)
        .map((id) => {
          const menu = menuMap[id];
          const inv = invMap[id];
          const sold = soldMap[id] || { qty: 0, revenue: 0 };
          const price = Number(menu?.price ?? 0);
          const unitCost = Number(inv?.unitCost ?? 0);
          const margin = price - unitCost;
          const marginPct = price > 0 ? Math.round((margin / price) * 100) : 0;
          const soldCost = sold.qty * unitCost;
          return {
            id,
            name: menu?.name || `Item ${id.slice(0, 8)}`,
            price,
            cost: unitCost,
            margin,
            marginPct,
            soldQty: sold.qty,
            soldRevenue: sold.revenue,
            soldCost,
            stock: Number(inv?.stock ?? 0),
          };
        })
        .sort((a, b) => {
          if (a.soldQty === 0 && b.soldQty > 0) return 1;
          if (a.soldQty > 0 && b.soldQty === 0) return -1;
          return a.name.localeCompare(b.name);
        });

      const totalRevenue = marginStats.reduce((s, m) => s + m.soldRevenue, 0);
      const totalCostOfGoods = marginStats.reduce((s, m) => s + m.soldCost, 0);
      const grossMargin = totalRevenue > 0
        ? Math.round(((totalRevenue - totalCostOfGoods) / totalRevenue) * 100)
        : 0;
      const trackedItems = marginStats.length;
      const soldItems = marginStats.filter((m) => m.soldQty > 0).length;

      setAnalytics({
        marginStats,
        wasteStats: Object.values(wasteByName).sort((a, b) => b.cost - a.cost),
        totalWasteCost,
        totalRevenue,
        totalCostOfGoods,
        grossMargin,
        trackedItems,
        soldItems,
      });
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [activeRestaurantId]);

  const loadRefundRequests = useCallback(async () => {
    setRefundsLoading(true);
    try {
      const [pending, all] = await Promise.all([
        fetchRefundRequests(activeRestaurantId, 'pending'),
        fetchRefundRequests(activeRestaurantId),
      ]);
      setPendingRefunds(pending);
      setAllRefunds(all);
    } catch {
      // non-fatal
    } finally {
      setRefundsLoading(false);
    }
  }, [activeRestaurantId]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await getMinimartSettings(activeRestaurantId);
      setTaxRate(String(s.taxRate));
      setTaxLabel(s.taxLabel);
      setReceiptFooter(s.receiptFooter);
    } catch {
      // table may not exist yet — use defaults
    } finally {
      setSettingsLoading(false);
    }
  }, [activeRestaurantId]);

  const loadShifts = useCallback(async () => {
    setShiftsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cashier_shifts')
        .select('*')
        .eq('restaurant_id', activeRestaurantId)
        .order('opened_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      setShifts((data || []).map((r: any): CashierShift => ({
        id: r.id,
        restaurantId: r.restaurant_id,
        cashierId: r.cashier_id ?? undefined,
        cashierName: r.cashier_name ?? '',
        openedAt: r.opened_at,
        closedAt: r.closed_at ?? null,
        openingFloat: Number(r.opening_float ?? 0),
        closingFloat: r.closing_float != null ? Number(r.closing_float) : null,
        expectedCash: r.expected_cash != null ? Number(r.expected_cash) : null,
        cashVariance: r.cash_variance != null ? Number(r.cash_variance) : null,
        totalSales: r.total_sales != null ? Number(r.total_sales) : null,
        totalTransactions: r.total_transactions != null ? Number(r.total_transactions) : null,
        status: r.status ?? 'open',
        notes: r.notes ?? null,
      })));
    } catch (err) {
      console.error('Failed to load shifts:', err);
    } finally {
      setShiftsLoading(false);
    }
  }, [activeRestaurantId]);

  const handleOpenShift = async () => {
    if (!openShiftCashierId) { alert('Please select a cashier.'); return; }
    const selectedCashier = cashiers.find((c) => c.id === openShiftCashierId);
    if (!selectedCashier) return;
    setShiftSaving(true);
    try {
      await openShift({
        restaurantId: activeRestaurantId,
        cashierId: openShiftCashierId,
        cashierName: selectedCashier.name,
        openingFloat: parseFloat(openShiftFloat || '0'),
      });
      setShowOpenShiftForm(false);
      setOpenShiftCashierId('');
      setOpenShiftFloat('');
      loadShifts();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to open shift.');
    } finally {
      setShiftSaving(false);
    }
  };

  const handleCloseShift = async (shiftId: string) => {
    if (!closingFloat) { alert('Please enter the counted cash amount.'); return; }
    setShiftSaving(true);
    try {
      const shift = shifts.find((s) => s.id === shiftId);
      const cashSales = transactions
        .filter((t) => t.paymentMethod === 'Cash')
        .reduce((sum, t) => sum + t.total, 0);
      const expectedCash = (shift?.openingFloat ?? 0) + cashSales;
      await closeShift(shiftId, {
        closingFloat: parseFloat(closingFloat),
        expectedCash,
        totalSales: transactions.reduce((s, t) => s + t.total, 0),
        totalTransactions: transactions.length,
        notes: closingNotes,
      });
      setClosingShiftId(null);
      setClosingFloat('');
      setClosingNotes('');
      loadShifts();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to close shift.');
    } finally {
      setShiftSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSaved(false);
    try {
      await upsertMinimartSettings(activeRestaurantId, {
        taxRate: parseFloat(taxRate) || 0,
        taxLabel: taxLabel.trim() || 'Tax',
        receiptFooter: receiptFooter.trim(),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err: any) {
      setSettingsError(err?.message ?? 'Failed to save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  useEffect(() => { load(); }, [load]);
  // Load pending refund count on mount so nav badge is always visible
  useEffect(() => { loadRefundRequests(); }, [loadRefundRequests]);
  useEffect(() => { if (page === 'refunds') loadRefundRequests(); }, [page, loadRefundRequests]);
  useEffect(() => { if (page === 'cashiers') loadCashiers(); }, [page, loadCashiers]);
  useEffect(() => { if (page === 'analytics') loadAnalytics(); }, [page, loadAnalytics]);
  useEffect(() => { if (page === 'settings') loadSettings(); }, [page, loadSettings]);
  useEffect(() => { if (page === 'shifts') { loadShifts(); loadCashiers(); } }, [page, loadShifts, loadCashiers]);

  const handleApproveRefund = async (req: MinimartRefundRequest) => {
    if (!req.orderId) { alert('Cannot approve: missing order reference.'); return; }
    setReviewSaving(true);
    try {
      await approveRefundRequest({
        requestId:    req.id,
        reviewedBy:   manager.id,
        reviewNotes:  reviewNotes.trim() || undefined,
        restaurantId: activeRestaurantId,
        orderId:      req.orderId,
        refundedBy:   manager.id,
        refundAmount: req.refundAmount,
        reason:       req.reason,
        items:        req.items,
      });
      setReviewingRefund(null);
      setReviewNotes('');
      await loadRefundRequests();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to approve refund.');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleDenyRefund = async (req: MinimartRefundRequest) => {
    if (!reviewNotes.trim()) { alert('Please enter a reason for denial.'); return; }
    setReviewSaving(true);
    try {
      await denyRefundRequest({
        requestId:   req.id,
        reviewedBy:  manager.id,
        reviewNotes: reviewNotes.trim(),
      });
      setReviewingRefund(null);
      setReviewNotes('');
      await loadRefundRequests();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to deny refund.');
    } finally {
      setReviewSaving(false);
    }
  };

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

  const txnCashierOptions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.cashierName))).sort((a, b) => a.localeCompare(b)),
    [transactions],
  );

  const txnPaymentOptions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.paymentMethod))).sort((a, b) => a.localeCompare(b)),
    [transactions],
  );

  const filteredTxns = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    return [...transactions]
      .filter((t) => {
        const matchesSearch = !q ||
          t.orderNumber.toLowerCase().includes(q) ||
          t.cashierName.toLowerCase().includes(q) ||
          t.paymentMethod.toLowerCase().includes(q);
        const matchesCashier = txnCashierFilter === 'all' || t.cashierName === txnCashierFilter;
        const matchesPayment = txnPaymentFilter === 'all' || t.paymentMethod === txnPaymentFilter;
        return matchesSearch && matchesCashier && matchesPayment;
      })
      .sort((a, b) => {
        const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return txnSort === 'oldest' ? delta : -delta;
      });
  }, [transactions, txnCashierFilter, txnPaymentFilter, txnSearch, txnSort]);

  const navItems = [
    { key: 'dashboard' as Page, label: 'Dashboard', icon: TrendingUpIcon },
    { key: 'transactions' as Page, label: 'Transactions', icon: ReceiptIcon },
    { key: 'refunds' as Page, label: 'Refunds', icon: RotateCcwIcon, badge: pendingRefunds.length || undefined },
    { key: 'shifts' as Page, label: 'Shifts', icon: ClockIcon },
    { key: 'inventory' as Page, label: 'Inventory', icon: ShoppingBagIcon },
    { key: 'cashiers' as Page, label: 'Cashiers', icon: UsersIcon },
    { key: 'analytics' as Page, label: 'Analytics', icon: LineChartIcon },
    { key: 'settings' as Page, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-emerald-900/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-100 truncate">{restaurantName}</p>
            <p className="text-xs text-slate-400">{manager.name} &middot; <span className="capitalize">{manager.role}</span></p>
          </div>
          <div className="flex items-center gap-2">
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
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          <aside className="lg:w-56 lg:shrink-0">
            <nav className="bg-slate-900 border border-slate-800 rounded-2xl p-2 lg:sticky lg:top-24">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = page === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setPage(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1 last:mb-0 ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {(item as any).badge ? (
                      <span className="ml-auto text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {(item as any).badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 flex-1">

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
                    dateFilter === f ? 'bg-amber-500 text-slate-900 font-medium' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
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
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <TrendingUpIcon className="w-3.5 h-3.5 text-amber-400" /> Net Revenue
                    </div>
                    <p className="text-xl font-bold text-slate-100">{formatPrice(summary.revenue)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {summary.totalRefunds > 0
                        ? <span className="text-red-400">−{formatPrice(summary.totalRefunds)} refunded</span>
                        : 'Confirmed sales'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <TrendingUpIcon className="w-3.5 h-3.5 text-emerald-400" /> Gross Profit
                    </div>
                    <p className={`text-xl font-bold ${summary.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPrice(summary.grossProfit)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Revenue minus estimated COGS</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <TrendingUpIcon className="w-3.5 h-3.5 text-orange-400" /> COGS
                    </div>
                    <p className="text-xl font-bold text-orange-300">{formatPrice(summary.cogs)}</p>
                    <p className="text-xs text-slate-500 mt-1">Estimated cost of goods sold</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <ReceiptIcon className="w-3.5 h-3.5 text-blue-400" /> Transactions
                    </div>
                    <p className="text-xl font-bold text-slate-100">{summary.transactions}</p>
                    <p className="text-xs text-slate-500 mt-1">Avg {formatPrice(summary.avgSale)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <ShoppingBagIcon className="w-3.5 h-3.5 text-emerald-400" /> Items Sold
                    </div>
                    <p className="text-xl font-bold text-slate-100">{summary.totalItems}</p>
                    <p className="text-xs text-slate-500 mt-1">Total units</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wide mb-2">
                      <ZapIcon className="w-3.5 h-3.5 text-purple-400" /> Peak Day
                    </div>
                    <p className="text-base font-bold text-slate-100 truncate">{summary.peakDay || '—'}</p>
                    <p className="text-xs text-slate-500 mt-1">Highest revenue</p>
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
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #f59e0b', borderRadius: 10, color: '#fff' }}
                            formatter={(v: number) => [formatPrice(v), 'Revenue']}
                            labelStyle={{ color: '#fbbf24' }}
                          />
                          <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                            {summary.dailyBars.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={entry.revenue === maxBarRevenue && entry.revenue > 0 ? '#f59e0b' : '#334155'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Hourly sales chart */}
                {summary.hourlyBars.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-4">
                      <ClockIcon className="w-3.5 h-3.5 text-blue-400" /> Sales by Hour
                    </div>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary.hourlyBars} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                          <XAxis dataKey="hour" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #3b82f6', borderRadius: 10, color: '#fff' }}
                            formatter={(v: number, name: string) => [name === 'revenue' ? formatPrice(v) : v, name === 'revenue' ? 'Revenue' : 'Sales']}
                            labelStyle={{ color: '#93c5fd' }}
                          />
                          <Bar dataKey="revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} />
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
                                    className="h-1.5 bg-amber-500 rounded-full transition-all"
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
                            <p className="text-xs font-semibold text-amber-400 shrink-0">{formatPrice(p.revenue)}</p>
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
                              <p className="text-xs text-slate-500">
                                {stats.count} transaction{stats.count !== 1 ? 's' : ''}
                                {' · '}avg {formatPrice(stats.revenue / (stats.count || 1))}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-amber-400">{formatPrice(stats.revenue)}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Sales by category */}
                {Object.keys(summary.byCategory).length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-4">
                      <BarChart2Icon className="w-3.5 h-3.5" /> Sales by Category
                    </div>
                    <div className="space-y-3">
                      {Object.entries(summary.byCategory)
                        .sort((a, b) => b[1].revenue - a[1].revenue)
                        .map(([cat, stats]) => {
                          const pct = summary.revenue > 0 ? (stats.revenue / summary.revenue) * 100 : 0;
                          return (
                            <div key={cat}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-300 flex items-center gap-1.5">
                                  <TagIcon className="w-3 h-3 text-amber-400" />{cat}
                                </span>
                                <span className="text-slate-400">{stats.qty} sold · {formatPrice(stats.revenue)}</span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full">
                                <div
                                  className="h-1.5 bg-amber-500/70 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
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
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <div className="flex gap-2">
                {(['today', '7d', '30d'] as DateFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      dateFilter === f ? 'bg-amber-500 text-slate-900 font-medium' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f === 'today' ? 'Today' : f === '7d' ? 'Last 7 days' : 'Last 30 days'}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  value={txnSearch}
                  onChange={(e) => setTxnSearch(e.target.value)}
                  placeholder="Search order, cashier…"
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-44"
                />
                <select
                  value={txnCashierFilter}
                  onChange={(e) => setTxnCashierFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="all">All cashiers</option>
                  {txnCashierOptions.map((cashier) => (
                    <option key={cashier} value={cashier}>{cashier}</option>
                  ))}
                </select>
                <select
                  value={txnPaymentFilter}
                  onChange={(e) => setTxnPaymentFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="all">All payments</option>
                  {txnPaymentOptions.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
                <select
                  value={txnSort}
                  onChange={(e) => setTxnSort(e.target.value as TransactionSort)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <span className="text-xs text-slate-500">{filteredTxns.length} records</span>
                <button
                  onClick={() => exportTransactionsToCsv(filteredTxns)}
                  disabled={filteredTxns.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-medium transition-colors"
                >
                  <DownloadIcon className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-slate-400">
                  <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : filteredTxns.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                  <ReceiptIcon className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">{transactions.length === 0 ? 'No transactions found' : 'No matches for your search'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800">
                    <thead className="bg-slate-900/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Order</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cashier</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Items</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Products</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredTxns.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/35 transition-colors align-top">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-100">#{t.orderNumber}</div>
                            <div className="text-xs text-slate-500">{t.id.slice(0, 8)}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                            {new Date(t.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{t.cashierName}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-300">
                              {t.paymentMethod}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                            {t.itemCount} item{t.itemCount !== 1 ? 's' : ''}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 min-w-[240px]">
                            {t.items.length > 0
                              ? t.items
                                .slice(0, 3)
                                .map((item: any) => {
                                  const name = item.menu_item_name || item.menuItemName || item.name || 'Item';
                                  const qty = item.quantity || 1;
                                  return `${name} x${qty}`;
                                })
                                .join(', ')
                              : 'No items recorded'}
                            {t.items.length > 3 ? ` +${t.items.length - 3} more` : ''}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold text-emerald-400">
                            {formatPrice(t.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Shifts ── */}
        {page === 'shifts' && (() => {
          const filteredShifts = shifts.filter((s) =>
            shiftStatusFilter === 'all' || s.status === shiftStatusFilter
          );
          const selectedCashierForOpen = cashiers.find((c) => c.id === openShiftCashierId);
          const closingShift = shifts.find((s) => s.id === closingShiftId);
          const cashSalesTotal = transactions
            .filter((t) => t.paymentMethod === 'Cash')
            .reduce((sum, t) => sum + t.total, 0);
          const expectedInDrawer = (closingShift?.openingFloat ?? 0) + cashSalesTotal;
          const countedCash = parseFloat(closingFloat || '0');
          const cashVariance = closingFloat ? countedCash - expectedInDrawer : null;

          return (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Shifts & Float</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Opening/closing floats and cash reconciliation</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadShifts}
                    className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <RefreshCwIcon className={`w-4 h-4 ${shiftsLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => { setShowOpenShiftForm(true); loadCashiers(); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" /> Open Shift
                  </button>
                </div>
              </div>

              {/* Open shift form */}
              {showOpenShiftForm && (
                <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-amber-400">Open New Shift</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Cashier</label>
                      <select
                        value={openShiftCashierId}
                        onChange={(e) => setOpenShiftCashierId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Select cashier…</option>
                        {cashiers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Opening Float (cash in drawer)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-medium">RWF</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={openShiftFloat}
                          onChange={(e) => setOpenShiftFloat(e.target.value)}
                          placeholder="0"
                          className="w-full pl-12 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-bold focus:outline-none focus:border-amber-500 placeholder-slate-600"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowOpenShiftForm(false); setOpenShiftCashierId(''); setOpenShiftFloat(''); }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleOpenShift}
                      disabled={shiftSaving || !openShiftCashierId}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-sm font-bold transition-colors"
                    >
                      {shiftSaving ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <ClockIcon className="w-4 h-4" />}
                      Open Shift{selectedCashierForOpen ? ` · ${selectedCashierForOpen.name}` : ''}
                    </button>
                  </div>
                </div>
              )}

              {/* Status filter */}
              <div className="flex gap-2">
                {(['all', 'open', 'closed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setShiftStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                      shiftStatusFilter === f ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-500 self-center">{filteredShifts.length} shifts</span>
              </div>

              {/* Shifts list */}
              {shiftsLoading ? (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading shifts…
                </div>
              ) : filteredShifts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                  <ClockIcon className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No shifts recorded yet</p>
                  <p className="text-xs text-slate-600 mt-1">Use "Open Shift" to start tracking</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredShifts.map((shift) => {
                    const isClosing = closingShiftId === shift.id;
                    const durationMs = shift.closedAt
                      ? new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()
                      : Date.now() - new Date(shift.openedAt).getTime();
                    const hrs = Math.floor(durationMs / 3600000);
                    const mins = Math.floor((durationMs % 3600000) / 60000);

                    return (
                      <div key={shift.id} className={`bg-slate-900 border rounded-2xl overflow-hidden ${shift.status === 'open' ? 'border-amber-500/30' : 'border-slate-800'}`}>
                        {/* Shift row */}
                        <div className="flex items-center gap-4 px-5 py-4">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${shift.status === 'open' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-100">{shift.cashierName || 'Unknown cashier'}</p>
                              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${shift.status === 'open' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                {shift.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {new Date(shift.openedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              {shift.closedAt ? ` → ${new Date(shift.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ` · ${hrs}h ${mins}m ongoing`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-slate-500">Float In</p>
                            <p className="text-sm font-bold text-slate-200">{formatPrice(shift.openingFloat)}</p>
                          </div>
                          {shift.closingFloat != null && (
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-500">Counted</p>
                              <p className="text-sm font-bold text-slate-200">{formatPrice(shift.closingFloat)}</p>
                            </div>
                          )}
                          {shift.cashVariance != null && (
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-500">Variance</p>
                              <p className={`text-sm font-bold ${shift.cashVariance === 0 ? 'text-emerald-400' : shift.cashVariance > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                {shift.cashVariance > 0 ? '+' : ''}{formatPrice(shift.cashVariance)}
                              </p>
                            </div>
                          )}
                          {shift.totalSales != null && (
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-500">{shift.totalTransactions} txns</p>
                              <p className="text-sm font-bold text-emerald-400">{formatPrice(shift.totalSales)}</p>
                            </div>
                          )}
                          {shift.status === 'open' && (
                            <button
                              onClick={() => {
                                if (isClosing) { setClosingShiftId(null); setClosingFloat(''); setClosingNotes(''); }
                                else { setClosingShiftId(shift.id); setClosingFloat(''); setClosingNotes(''); }
                              }}
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                isClosing ? 'bg-slate-700 text-slate-300' : 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
                              }`}
                            >
                              {isClosing ? 'Cancel' : 'Close Shift'}
                            </button>
                          )}
                        </div>

                        {/* Inline close form */}
                        {isClosing && (
                          <div className="border-t border-slate-800 bg-slate-800/30 px-5 py-4 space-y-4">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Till Reconciliation</p>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div className="bg-slate-800 rounded-xl p-3">
                                <p className="text-slate-500 mb-1">Opening Float</p>
                                <p className="font-bold text-slate-200">{formatPrice(shift.openingFloat)}</p>
                              </div>
                              <div className="bg-slate-800 rounded-xl p-3">
                                <p className="text-slate-500 mb-1">Cash Sales (today)</p>
                                <p className="font-bold text-slate-200">{formatPrice(cashSalesTotal)}</p>
                              </div>
                              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                <p className="text-emerald-600 mb-1">Expected in Drawer</p>
                                <p className="font-bold text-emerald-400">{formatPrice(expectedInDrawer)}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-slate-400 mb-1.5">Counted cash amount *</label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-medium">RWF</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={closingFloat}
                                    onChange={(e) => setClosingFloat(e.target.value)}
                                    placeholder="0"
                                    className="w-full pl-12 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-bold focus:outline-none focus:border-amber-500 placeholder-slate-600"
                                    autoFocus
                                  />
                                </div>
                                {closingFloat && cashVariance !== null && (
                                  <div className={`mt-2 flex items-center justify-between text-xs rounded-lg px-3 py-1.5 ${
                                    cashVariance === 0 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                    : cashVariance > 0 ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                  }`}>
                                    <span>{cashVariance === 0 ? 'Balanced' : cashVariance > 0 ? 'Overage' : 'Shortage'}</span>
                                    <span className="font-bold">{cashVariance > 0 ? '+' : ''}{formatPrice(cashVariance)}</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-slate-400 mb-1.5">Notes (optional)</label>
                                <textarea
                                  value={closingNotes}
                                  onChange={(e) => setClosingNotes(e.target.value)}
                                  placeholder="Shift notes…"
                                  rows={3}
                                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => handleCloseShift(shift.id)}
                              disabled={shiftSaving || !closingFloat}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                            >
                              {shiftSaving ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <ZapIcon className="w-4 h-4" />}
                              Confirm & Close Shift
                            </button>
                          </div>
                        )}

                        {/* Notes display for closed shifts */}
                        {shift.status === 'closed' && shift.notes && (
                          <div className="border-t border-slate-800 px-5 py-2.5">
                            <p className="text-xs text-slate-500">{shift.notes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Products ── */}
        {page === 'products' && (
          <MinimartProductManagement />
        )}

        {/* ── Inventory ── */}
        {page === 'inventory' && (
          <InventoryManagement role="manager" inventoryScope="minimart" />
        )}

        {/* ── Analytics ── */}
        {page === 'analytics' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Analytics</h2>
                <p className="text-xs text-slate-500 mt-0.5">Margin analysis and waste tracking (last 30 days)</p>
              </div>
              <button
                onClick={loadAnalytics}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RefreshCwIcon className={`w-4 h-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {analyticsLoading ? (
              <div className="flex items-center justify-center h-40 text-slate-400">
                <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
              </div>
            ) : !analytics ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <LineChartIcon className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No data available yet</p>
              </div>
            ) : (
              <>
                {/* KPI summary */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Revenue</p>
                    <p className="text-lg font-bold text-slate-100">{formatPrice(analytics.totalRevenue)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Cost of Goods</p>
                    <p className="text-lg font-bold text-slate-100">{formatPrice(analytics.totalCostOfGoods)}</p>
                  </div>
                  <div className={`border rounded-2xl p-4 ${analytics.grossMargin >= 30 ? 'bg-emerald-500/10 border-emerald-500/25' : analytics.grossMargin >= 10 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
                    <p className={`text-[10px] uppercase tracking-wide mb-1 ${analytics.grossMargin >= 30 ? 'text-emerald-600' : analytics.grossMargin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>Gross Margin</p>
                    <p className={`text-lg font-bold ${analytics.grossMargin >= 30 ? 'text-emerald-400' : analytics.grossMargin >= 10 ? 'text-amber-400' : 'text-red-400'}`}>{analytics.grossMargin}%</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Tracked Items</p>
                    <p className="text-lg font-bold text-slate-100">{analytics.trackedItems}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Items Sold</p>
                    <p className="text-lg font-bold text-slate-100">{analytics.soldItems}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Negative Margins</p>
                    <p className="text-lg font-bold text-red-400">{analytics.marginStats.filter((m) => m.price > 0 && m.cost > m.price).length}</p>
                  </div>
                </div>

                {/* Margin table */}
                {analytics.marginStats.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
                      <TrendingUpIcon className="w-3.5 h-3.5 text-amber-400" />
                      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Product Margin Analysis</p>
                      <span className="ml-auto text-[11px] text-slate-500">{analytics.marginStats.length} items</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-900/90 border-b border-slate-800">
                          <tr>
                            <th className="px-5 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-400">Product</th>
                            <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-400">Price</th>
                            <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-400">Unit Cost</th>
                            <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-400">Margin</th>
                            <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-400">Sold Qty</th>
                            <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-400">Sales Value</th>
                            <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-400">Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {analytics.marginStats.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-800/25 transition-colors">
                              <td className="px-5 py-2.5 text-slate-200">{m.name}</td>
                              <td className="px-3 py-2.5 text-right text-slate-300">{m.price > 0 ? formatPrice(m.price) : '—'}</td>
                              <td className="px-3 py-2.5 text-right text-slate-300">{m.cost > 0 ? formatPrice(m.cost) : '—'}</td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={`font-semibold ${m.price === 0 || m.cost === 0 ? 'text-slate-500' : m.marginPct >= 30 ? 'text-emerald-400' : m.marginPct >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                                  {m.price === 0 || m.cost === 0 ? '—' : `${m.marginPct}%`}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-300">{m.soldQty}</td>
                              <td className="px-3 py-2.5 text-right text-slate-300">{m.soldRevenue > 0 ? formatPrice(m.soldRevenue) : '—'}</td>
                              <td className="px-3 py-2.5 text-right text-slate-300">{m.stock}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {analytics.totalCostOfGoods === 0 && (
                      <div className="px-5 py-3 bg-amber-500/5 border-t border-amber-500/15 flex items-center gap-2">
                        <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-400">Set unit costs in Inventory to see margin percentages.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Waste tracking */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrashIcon className="w-3.5 h-3.5 text-red-400" />
                      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Waste (Last 30 Days)</p>
                    </div>
                    {analytics.totalWasteCost > 0 && (
                      <span className="text-xs font-semibold text-red-400">{formatPrice(analytics.totalWasteCost)} lost</span>
                    )}
                  </div>
                  {analytics.wasteStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-slate-500">
                      <p className="text-sm">No waste recorded in this period</p>
                      <p className="text-xs text-slate-600 mt-1">Use the Inventory module to record waste</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {analytics.wasteStats.map((w) => (
                        <div key={w.name} className="flex items-center gap-3 px-5 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 truncate">{w.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{w.qty} units · {w.reason}</p>
                          </div>
                          <p className="text-sm font-semibold text-red-400 shrink-0">{formatPrice(w.cost)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Settings ── */}
        {page === 'settings' && (
          <div className="space-y-6 max-w-lg">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Store Settings</h2>
              <p className="text-xs text-slate-500 mt-0.5">Tax configuration and receipt options</p>
            </div>

            {settingsLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Tax</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Tax Rate (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 transition-all"
                      />
                      <p className="text-xs text-slate-600 mt-1">Set to 0 to disable tax</p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Tax Label</label>
                      <input
                        type="text"
                        value={taxLabel}
                        onChange={(e) => setTaxLabel(e.target.value)}
                        placeholder="Tax"
                        maxLength={20}
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 transition-all"
                      />
                      <p className="text-xs text-slate-600 mt-1">Shown on receipts (e.g. VAT)</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-slate-800">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Receipt</p>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Footer Message</label>
                    <textarea
                      value={receiptFooter}
                      onChange={(e) => setReceiptFooter(e.target.value)}
                      placeholder="e.g. Thank you for shopping with us!"
                      rows={2}
                      maxLength={200}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 resize-none transition-all"
                    />
                  </div>

                  {settingsError && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
                      <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                      {settingsError}
                    </div>
                  )}
                  {settingsSaved && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-xs text-emerald-300">
                      Settings saved successfully.
                    </div>
                  )}

                  <button
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    {settingsSaving ? (
                      <><RefreshCwIcon className="w-4 h-4 animate-spin" /> Saving…</>
                    ) : (
                      'Save Settings'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Cashiers ── */}
        {page === 'cashiers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Cashier Accounts</h2>
              <button
                onClick={() => { setShowAddForm((v) => !v); setAddError(''); setAddForm(EMPTY_FORM); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors"
              >
                <PlusIcon className="w-4 h-4" /> Add Cashier
              </button>
            </div>

            {showAddForm && (
              <form
                onSubmit={handleAddCashier}
                className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 space-y-4"
              >
                <p className="text-sm font-semibold text-slate-200">New Cashier Account</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Full Name *</label>
                    <input
                      value={addForm.name}
                      onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Jane Doe"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Phone</label>
                    <input
                      value={addForm.phone}
                      onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="e.g. 0788000000"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Username *</label>
                    <input
                      value={addForm.username}
                      onChange={(e) => setAddForm((p) => ({ ...p, username: e.target.value }))}
                      placeholder="Login username"
                      autoComplete="off"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
                        className="w-full px-3 py-2 pr-9 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-sm font-semibold transition-colors"
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
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-sm font-bold shrink-0">
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

        {/* ── Refund Requests ── */}
        {page === 'refunds' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Refund Requests</h2>
              <button
                onClick={loadRefundRequests}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RefreshCwIcon className={`w-4 h-4 ${refundsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Pending requests (highlighted) */}
            {pendingRefunds.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangleIcon className="w-3.5 h-3.5" />
                  Pending Approval ({pendingRefunds.length})
                </p>
                {pendingRefunds.map((req) => (
                  <div key={req.id} className="bg-slate-900 border border-red-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-200">
                          Order #{req.orderNumber ?? '—'}
                          <span className="ml-2 text-xs text-slate-500">by {req.cashierName ?? 'Unknown cashier'}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">Reason: {req.reason}</p>
                        {req.items && req.items.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {req.items.map((it, i) => (
                              <p key={i} className="text-[11px] text-slate-500">
                                {it.qty}× {it.name} — {formatPrice(it.price)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-white">{formatPrice(req.refundAmount)}</p>
                        <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">PENDING</span>
                      </div>
                    </div>

                    {reviewingRefund?.id === req.id ? (
                      <div className="space-y-2 border-t border-slate-700/50 pt-3">
                        <label className="block text-xs text-slate-400">Review notes {reviewingRefund && <span className="text-red-400">(required for denial)</span>}</label>
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Optional notes for approval, required for denial…"
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveRefund(req)}
                            disabled={reviewSaving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm transition-colors"
                          >
                            <CheckIcon className="w-4 h-4" />
                            {reviewSaving ? 'Processing…' : 'Approve Refund'}
                          </button>
                          <button
                            onClick={() => handleDenyRefund(req)}
                            disabled={reviewSaving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-bold text-sm transition-colors"
                          >
                            <XIcon className="w-4 h-4" />
                            {reviewSaving ? 'Processing…' : 'Deny'}
                          </button>
                          <button
                            onClick={() => { setReviewingRefund(null); setReviewNotes(''); }}
                            className="px-3 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setReviewingRefund(req); setReviewNotes(''); }}
                        className="w-full py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
                      >
                        Review Request
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pendingRefunds.length === 0 && !refundsLoading && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
                <CheckIcon className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No pending refund requests.</p>
              </div>
            )}

            {/* History */}
            {allRefunds.filter((r) => r.status !== 'pending').length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">History</p>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 text-left">Order</th>
                        <th className="px-4 py-2.5 text-left">Cashier</th>
                        <th className="px-4 py-2.5 text-left">Amount</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-left">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRefunds.filter((r) => r.status !== 'pending').map((req) => (
                        <tr key={req.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 text-slate-300">#{req.orderNumber ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-400">{req.cashierName ?? '—'}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-200">{formatPrice(req.refundAmount)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              req.status === 'approved'
                                ? 'bg-emerald-900/40 text-emerald-400'
                                : 'bg-red-900/40 text-red-400'
                            }`}>
                              {req.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {new Date(req.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
          </section>
        </div>
      </main>
    </div>
  );
}
