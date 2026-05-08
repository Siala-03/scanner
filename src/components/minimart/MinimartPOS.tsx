import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
  SearchIcon, ShoppingCartIcon, PlusIcon, MinusIcon, TrashIcon,
  CheckCircleIcon, RefreshCwIcon, PrinterIcon, XIcon, LogOutIcon,
  HistoryIcon, ChevronUpIcon, ChevronDownIcon, BookmarkCheckIcon,
  PackageXIcon, AlertTriangleIcon, BookmarkIcon, MessageSquareIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { fetchMenu } from '../../api/menu';
import { createOrder, confirmPayment } from '../../api/orders';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../utils/currency';
import { fetchReceiptSettings } from '../../api/restaurants';
import { buildReceiptHtml, printReceipt } from '../../utils/receipt';
import type { PaymentEntry } from '../../utils/receipt';
import { PaymentCaptureModal } from '../ui/PaymentCaptureModal';
import { fiscalizeOrder } from '../../api/ebm';
import { fetchInventory, updateInventoryRecord } from '../../api/inventory';
import type { InventoryRecord } from '../../api/inventory';
import { requestRefund } from '../../api/refunds';
import { getMinimartSettings } from '../../api/minimartSettings';
import { getActiveShift } from '../../api/shifts';
import { RefundModal, type RefundableTxn } from './RefundModal';
import type { MenuItem, Staff } from '../../types';
import type { RestaurantReceiptSettings } from '../../api/restaurants';

interface CartLine {
  item: MenuItem;
  qty: number;
  note?: string;
}

interface ShiftTxn {
  id: string;
  orderNumber: string;
  total: number;
  paymentLabel: string;
  itemCount: number;
  items: Array<{ name: string; qty: number; price: number }>;
  timestamp: Date;
  refundAmount?: number;
  refundReason?: string;
  refundedAt?: string;
}

type TransactionSort = 'newest' | 'oldest';

interface Receipt {
  orderId: string;
  orderNumber: string;
  lines: CartLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  payments: PaymentEntry[];
  change: number;
  cashierName: string;
  customerName?: string;
  timestamp: Date;
}

const PAYMENT_METHODS = [
  { code: '01', label: 'Cash' },
  { code: '02', label: 'Card' },
  { code: '04', label: 'Mobile Money' },
];

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

// ── Main POS ─────────────────────────────────────────────────────────────────

interface MinimartPOSProps {
  restaurantName: string;
  cashier: Staff | null;
  restaurantId?: string;
  onLogout: () => void;
}

export function MinimartPOS({ restaurantName, cashier, restaurantId, onLogout }: MinimartPOSProps) {
  const [sessionRestaurantId, setSessionRestaurantId] = useState('');
  const activeRestaurantId = sessionRestaurantId || restaurantId;
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [shiftSales, setShiftSales] = useState({ count: 0, total: 0, byPayment: {} as Record<string, number> });
    const [openingFloat, setOpeningFloat] = useState<number | null>(null);
  const [receiptSettings, setReceiptSettings] = useState<RestaurantReceiptSettings>({});
  // Hold cart
  const [holdCart, setHoldCart] = useState<CartLine[] | null>(null);
  // Transaction history
  const [showHistory, setShowHistory] = useState(false);
  const [shiftTxns, setShiftTxns] = useState<ShiftTxn[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [txnSearch, setTxnSearch] = useState('');
  const [txnPaymentFilter, setTxnPaymentFilter] = useState('all');
  const [txnSort, setTxnSort] = useState<TransactionSort>('newest');
  // Stock map: menuItemId -> { stock, threshold }
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [thresholdMap, setThresholdMap] = useState<Record<string, number>>({});
  // Barcode / SKU quick-add
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState('');
  // SKU -> menuItemId lookup built when products load
  const [skuMap, setSkuMap] = useState<Record<string, string>>({});
  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState<'cart' | 'txns'>('cart');
  // Refund workflow
  const [refundingTxn, setRefundingTxn] = useState<RefundableTxn | null>(null);
  // Tax settings
  const [taxRate, setTaxRate] = useState(0);
  const [taxLabel, setTaxLabel] = useState('Tax');

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

  const loadShiftStats = useCallback(async () => {
    if (!activeRestaurantId || !cashier?.id) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      let rows: any[] = [];
      for (const cols of [
        'total, payment_type, payment_method, payment_status, payment_confirmed_by, created_at',
        'total, payment_type, payment_method, payment_status, created_at',
        'total, payment_type, payment_method, created_at',
        'total, payment_method, created_at',
        'total, created_at',
      ]) {
        const res = await supabase
          .from('orders')
          .select(cols)
          .eq('restaurant_id', activeRestaurantId)
          .gte('created_at', todayStart.toISOString())
          .order('created_at', { ascending: false });

        if (!res.error) {
          rows = (res.data || []).filter((o: any) => {
            const ps = String(o.payment_status || '').toLowerCase();
            const cashierMatch = o.payment_confirmed_by ? o.payment_confirmed_by === cashier.id : true;
            const statusMatch = !ps || ['confirmed', 'paid', 'completed'].includes(ps);
            return cashierMatch && statusMatch;
          });
          break;
        }

        const msg = String(res.error.message || '').toLowerCase();
        if (!msg.includes('column') && !msg.includes('does not exist')) {
          break;
        }
      }

      const byPayment: Record<string, number> = {};
      rows.forEach((o: any) => {
        const method = o.payment_type ?? o.payment_method ?? 'Unknown';
        if (!method || method === 'Unknown') return;
        const label = method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : method === 'mobile_money' ? 'Mobile Money' : method === 'momo' ? 'MoMo' : method;
        byPayment[label] = (byPayment[label] ?? 0) + (o.total || 0);
      });
      setShiftSales({
        count: rows.length,
        total: rows.reduce((s: number, o: any) => s + (o.total || 0), 0),
        byPayment,
      });
    } catch {
      // non-fatal
    }
  }, [activeRestaurantId, cashier?.id]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchMenu();
      const items = (raw as unknown as MenuItem[]).filter(
        (i) => i.isAvailable !== false && (i as any).is_available !== false
      );
      setProducts(items);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStockMap = useCallback(async () => {
    try {
      const inv = await fetchInventory();
      const stockM: Record<string, number> = {};
      const threshM: Record<string, number> = {};
      (inv as InventoryRecord[]).forEach((r) => {
        if (r.menuItemId) {
          stockM[r.menuItemId] = r.stock ?? 0;
          threshM[r.menuItemId] = r.lowStockThreshold ?? 5;
        }
      });
      setStockMap(stockM);
      setThresholdMap(threshM);
    } catch {
      // non-fatal
    }
  }, []);

  const loadShiftTxns = useCallback(async () => {
    if (!activeRestaurantId || !cashier?.id) return;
    setTxnsLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const candidateSelects = [
        'id, order_number, total, items, created_at, payment_type, payment_method, payment_status, payment_confirmed_by',
        'id, order_number, total, items, created_at, payment_method, payment_status, payment_confirmed_by',
        'id, order_number, total, items, created_at, payment_method, payment_status',
        'id, order_number, total, items, created_at, payment_method',
        'id, order_number, total, items, created_at',
      ];
      let data: any[] = [];

      for (const selectCols of candidateSelects) {
        const res = await supabase
          .from('orders')
          .select(selectCols)
          .eq('restaurant_id', activeRestaurantId)
          .gte('created_at', todayStart.toISOString())
          .order('created_at', { ascending: false });

        if (!res.error) {
          data = (res.data || []).filter((o: any) => {
            const ps = String(o.payment_status || '').toLowerCase();
            const cashierMatch = o.payment_confirmed_by ? o.payment_confirmed_by === cashier.id : true;
            const statusMatch = !ps || ['confirmed', 'paid', 'completed'].includes(ps);
            return cashierMatch && statusMatch;
          });
          break;
        }

        const msg = String(res.error.message || '').toLowerCase();
        if (!msg.includes('column') && !msg.includes('does not exist')) {
          data = [];
          break;
        }
      }
      const PLABEL: Record<string, string> = { '01': 'Cash', '02': 'Card', '04': 'Mobile Money' };
      const orderIds = (data || []).map((o: any) => o.id);

      // Fetch approved refunds for these orders
      const refundMap: Record<string, { amount: number; reason: string; createdAt: string }> = {};
      if (orderIds.length > 0) {
        const { data: refunds } = await supabase
          .from('minimart_refunds')
          .select('order_id, refund_amount, reason, created_at')
          .in('order_id', orderIds);
        (refunds || []).forEach((r: any) => {
          if (r.order_id) {
            refundMap[r.order_id] = {
              amount: Number(r.refund_amount || 0),
              reason: r.reason || '',
              createdAt: r.created_at,
            };
          }
        });
      }

      const rows: ShiftTxn[] = (data || []).map((o: any) => {
        const ref = refundMap[o.id];
        return {
          id: o.id,
          orderNumber: o.order_number || o.id.slice(-6).toUpperCase(),
          total: o.total || 0,
          paymentLabel: PLABEL[o.payment_type || o.payment_method] || o.payment_type || o.payment_method || 'Cash',
          itemCount: Array.isArray(o.items) ? o.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : 0,
          items: Array.isArray(o.items)
            ? o.items.map((i: any) => ({
                name: i.menu_item_name || i.menuItemName || i.name || 'Item',
                qty: i.quantity || 1,
                price: i.total_price || i.totalPrice || (i.unit_price || 0) * (i.quantity || 1),
              }))
            : [],
          timestamp: new Date(o.created_at),
          refundAmount: ref?.amount,
          refundReason: ref?.reason,
          refundedAt: ref?.createdAt,
        };
      });
      setShiftTxns(rows);
    } catch {
      // non-fatal
    } finally {
      setTxnsLoading(false);
    }
  }, [activeRestaurantId, cashier?.id]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadShiftStats(); }, [loadShiftStats]);
    useEffect(() => {
      if (!activeRestaurantId || !cashier?.id) return;
      getActiveShift(activeRestaurantId, cashier.id)
        .then((shift) => { if (shift) setOpeningFloat(shift.openingFloat); })
        .catch(() => {});
    }, [activeRestaurantId, cashier?.id]);
  useEffect(() => {
    const id = setInterval(() => { loadShiftStats(); }, 15000);
    return () => clearInterval(id);
  }, [loadShiftStats]);
  useEffect(() => { loadStockMap(); }, [loadStockMap]);
  useEffect(() => {
    if (!activeRestaurantId) return;
    fetchReceiptSettings(activeRestaurantId).then(setReceiptSettings).catch(() => {});
    getMinimartSettings(activeRestaurantId)
      .then((s) => { setTaxRate(s.taxRate); setTaxLabel(s.taxLabel); })
      .catch(() => {});
  }, [activeRestaurantId]);

  const txnPaymentOptions = useMemo(
    () => Array.from(new Set(shiftTxns.map((t) => t.paymentLabel))).sort((a, b) => a.localeCompare(b)),
    [shiftTxns],
  );

  const filteredTxns = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    return [...shiftTxns]
      .filter((t) => {
        const matchesSearch = !q ||
          t.orderNumber.toLowerCase().includes(q) ||
          t.paymentLabel.toLowerCase().includes(q);
        const matchesPayment = txnPaymentFilter === 'all' || t.paymentLabel === txnPaymentFilter;
        return matchesSearch && matchesPayment;
      })
      .sort((a, b) => {
        const delta = a.timestamp.getTime() - b.timestamp.getTime();
        return txnSort === 'oldest' ? delta : -delta;
      });
  }, [shiftTxns, txnSearch, txnPaymentFilter, txnSort]);

  // Rebuild SKU map whenever products change
  useEffect(() => {
    const m: Record<string, string> = {};
    products.forEach((p) => {
      const sku = (p as any).sku;
      if (sku) m[String(sku).toLowerCase()] = p.id;
    });
    setSkuMap(m);
  }, [products]);

  const handleBarcodeSubmit = (value: string) => {
    const q = value.trim().toLowerCase();
    if (!q) return;
    // Match by SKU first, then by name prefix
    const bySkuId = skuMap[q];
    const product = bySkuId
      ? products.find((p) => p.id === bySkuId)
      : products.find((p) => p.name.toLowerCase() === q || (p as any).sku?.toLowerCase() === q);
    if (product) {
      if (stockMap[product.id] !== undefined && stockMap[product.id] <= 0) {
        setBarcodeError(`"${product.name}" is out of stock.`);
      } else {
        addToCart(product);
        setBarcodeError('');
      }
    } else {
      setBarcodeError(`No product found for "${value.trim()}".`);
    }
    setBarcodeInput('');
  };

  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()];

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === 'all' || p.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) return prev.map((l) => l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { item, qty: 1 }];
    });
  };

  const setQty = (itemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.item.id !== itemId));
    } else {
      setCart((prev) => prev.map((l) => l.item.id === itemId ? { ...l, qty } : l));
    }
  };

  const setNote = (itemId: string, note: string) => {
    setCart((prev) => prev.map((l) => l.item.id === itemId ? { ...l, note } : l));
  };

  const holdCurrentCart = () => {
    if (cart.length === 0) return;
    setHoldCart([...cart]);
    setCart([]);
  };

  const recallHeldCart = () => {
    if (!holdCart) return;
    setCart(holdCart);
    setHoldCart(null);
  };

  const cartSubtotal = cart.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const cartTaxAmount = Math.round(cartSubtotal * taxRate / 100);
  const cartTotal = cartSubtotal + cartTaxAmount;
  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0);

  const handleCheckout = async (payments: PaymentEntry[], change: number) => {
    if (cart.length === 0) return;
    const checkoutCart = [...cart]; // capture before state reset
    setShowPaymentModal(false);
    setCheckingOut(true);
    // Map primary method to EBM code (use first/largest payment)
    const primaryMethod = payments.reduce((a, b) => a.amount >= b.amount ? a : b).method;
    const methodCode = PAYMENT_METHODS.find(m => m.label === primaryMethod)?.code ?? '01';
    try {
      const idempotencyKey = crypto.randomUUID();
      const order = await createOrder({
        tableNumber: undefined as any,
        customerName: customerName || undefined,
        items: checkoutCart.map((l) => ({
          menuItemId:   l.item.id,
          menuItemName: l.item.name,
          quantity:     l.qty,
          unitPrice:    l.item.price,
          requiresKitchen: false,
          category:     l.item.category,
        })),
        requiresKitchen: false,
        idempotencyKey,
        restaurantId: activeRestaurantId,
      } as any);

      await confirmPayment(order.id, {
        paymentType:     methodCode,
        confirmedBy:     cashier?.id,
        confirmedByName: cashier?.name,
        restaurantId: activeRestaurantId,
      });

      if (activeRestaurantId) {
        fiscalizeOrder(order.id, { restaurantId: activeRestaurantId, paymentType: methodCode })
          .catch((err) => console.warn('[EBM] Fiscalization failed:', err));
      }

      // Deduct inventory stock (non-blocking, best-effort)
      checkoutCart.forEach((line) => {
        const cur = stockMap[line.item.id];
        if (cur == null) return;
        const next = Math.max(0, cur - line.qty);
        updateInventoryRecord(line.item.id, { stock: next })
          .then(() => setStockMap((prev) => ({ ...prev, [line.item.id]: next })))
          .catch(() => {});
      });

      const capturedSubtotal = checkoutCart.reduce((s, l) => s + l.item.price * l.qty, 0);
      const capturedTax = Math.round(capturedSubtotal * taxRate / 100);
      setReceipt({
        orderId:      order.id,
        orderNumber:  (order as any).order_number || (order as any).orderNumber || order.id.slice(-6).toUpperCase(),
        lines:        checkoutCart,
        subtotal:     capturedSubtotal,
        taxRate,
        taxAmount:    capturedTax,
        total:        capturedSubtotal + capturedTax,
        payments,
        change,
        cashierName:  cashier?.name || 'Cashier',
        customerName: customerName || undefined,
        timestamp:    new Date(),
      });

      setCart([]);
      setCustomerName('');
      setShowCart(false);
      loadShiftStats();
      loadShiftTxns();
      setSidebarTab('cart');
    } catch (err) {
      console.error('Checkout failed:', err);
      alert('Checkout failed. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleRefund = async (params: { refundAmount: number; reason: string }) => {
    if (!refundingTxn || !restaurantId) return;
    await requestRefund({
      restaurantId,
      orderId:      refundingTxn.id,
      orderNumber:  refundingTxn.orderNumber,
      requestedBy:  cashier?.id,
      cashierName:  cashier?.name,
      refundAmount: params.refundAmount,
      reason:       params.reason,
      items:        refundingTxn.items,
    });
    setRefundingTxn(null);
    alert(`Refund request for ${formatPrice(params.refundAmount)} on order #${refundingTxn.orderNumber} submitted. Awaiting manager approval.`);
  };

  const handleReprintTxn = (txn: ShiftTxn) => {
    const receiptData = {
      restaurantName,
      restaurantAddress: receiptSettings.address || '',
      restaurantPhone:   receiptSettings.phone   || '',
      restaurantLogo:    receiptSettings.logo,
      restaurantCity:    receiptSettings.city,
      restaurantCountry: receiptSettings.country,
      orderNumber:       txn.orderNumber,
      receiptId:         txn.orderNumber,
      orderType:         'takeout' as const,
      serverName:        cashier?.name || 'Cashier',
      orderDate:         txn.timestamp,
      items: txn.items.map((i) => ({
        quantity:   i.qty,
        name:       i.name,
        unitPrice:  i.qty > 0 ? Math.round(i.price / i.qty) : i.price,
        totalPrice: i.price,
      })),
      currency:      'RWF' as const,
      subtotal:      txn.total,
      taxRate:       0,
      taxAmount:     0,
      total:         txn.total,
      payments:      [{ method: txn.paymentLabel, amount: txn.total }],
      paymentStatus: 'paid' as const,
    };
    try {
      printReceipt(buildReceiptHtml(receiptData));
    } catch {
      alert('Could not open print window. Please allow pop-ups.');
    }
  };

  const handlePrint = () => {
    if (!receipt) return;
    const receiptData = {
      restaurantName:    restaurantName,
      restaurantAddress: receiptSettings.address || '',
      restaurantPhone:   receiptSettings.phone   || '',
      restaurantLogo:    receiptSettings.logo,
      restaurantCity:    receiptSettings.city,
      restaurantCountry: receiptSettings.country,
      orderNumber:       receipt.orderNumber,
      receiptId:         receipt.orderNumber,
      orderType:         'takeout' as const,
      serverName:        receipt.cashierName,
      orderDate:         receipt.timestamp,
      customerName:      receipt.customerName,
      items: receipt.lines.map((l) => ({
        quantity:            l.qty,
        name:                l.item.name,
        unitPrice:           l.item.price,
        totalPrice:          l.item.price * l.qty,
        specialInstructions: l.note || undefined,
      })),
      currency:      'RWF' as const,
      subtotal:      receipt.subtotal,
      taxRate:       receipt.taxRate,
      taxAmount:     receipt.taxAmount,
      total:         receipt.total,
      payments:      receipt.payments,
      paymentStatus: 'paid' as const,
      change:        receipt.change > 0 ? receipt.change : undefined,
    };
    try {
      printReceipt(buildReceiptHtml(receiptData));
    } catch {
      alert('Could not open print window. Please allow pop-ups in your browser.');
    }
  };

  const cashierInitials = (cashier?.name ?? 'C').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // ── History / Sales Records ────────────────────────────────────────────────
  if (showHistory) {
    const grossTotal   = shiftTxns.reduce((s, t) => s + t.total, 0);
    const totalRefunds = shiftTxns.reduce((s, t) => s + (t.refundAmount ?? 0), 0);
    const netTotal     = grossTotal - totalRefunds;
    const refundedCount = shiftTxns.filter((t) => t.refundAmount).length;

    return (
      <>
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 bg-slate-900 border-b border-slate-800/80 shrink-0">
          <button
            onClick={() => setShowHistory(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">Sales Records — Today</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {shiftTxns.length} sale{shiftTxns.length !== 1 ? 's' : ''}
              {refundedCount > 0 ? ` · ${refundedCount} refunded` : ''}
            </p>
          </div>
          <button
            onClick={loadShiftTxns}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCwIcon className={`w-4 h-4 ${txnsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex gap-0 shrink-0 border-b border-slate-800/60 bg-slate-900/60">
          <div className="flex-1 px-4 py-2.5 border-r border-slate-800/60">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Gross Sales</p>
            <p className="text-sm font-bold text-white mt-0.5">{formatPrice(grossTotal)}</p>
          </div>
          {totalRefunds > 0 && (
            <div className="flex-1 px-4 py-2.5 border-r border-slate-800/60">
              <p className="text-[10px] text-orange-400/80 uppercase tracking-wide">Refunds</p>
              <p className="text-sm font-bold text-orange-400 mt-0.5">-{formatPrice(totalRefunds)}</p>
            </div>
          )}
          <div className="flex-1 px-4 py-2.5">
            <p className="text-[10px] text-emerald-400/80 uppercase tracking-wide">Net Sales</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">{formatPrice(netTotal)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {txnsLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : shiftTxns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center mb-3">
                <HistoryIcon className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm font-medium">No sales yet today</p>
              <p className="text-xs text-slate-600 mt-1">Completed sales will appear here</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800/80 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Time</th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium">Order #</th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium hidden sm:table-cell">Items</th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium hidden sm:table-cell">Payment</th>
                  <th className="text-right px-3 py-2.5 text-slate-500 font-medium">Amount</th>
                  <th className="text-right px-3 py-2.5 text-orange-400/70 font-medium">Refund</th>
                  <th className="text-right px-4 py-2.5 text-emerald-400/70 font-medium">Net</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {[...shiftTxns].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map((t) => {
                  const isRefunded = !!t.refundAmount;
                  const net = t.total - (t.refundAmount ?? 0);
                  return (
                    <Fragment key={t.id}>
                      <tr className={`hover:bg-slate-800/30 transition-colors ${isRefunded ? 'bg-orange-950/10' : ''}`}>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-3 font-semibold text-white whitespace-nowrap">
                          #{t.orderNumber}
                        </td>
                        <td className="px-3 py-3 text-slate-400 hidden sm:table-cell">
                          {t.itemCount} item{t.itemCount !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full text-[10px]">
                            {t.paymentLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-white whitespace-nowrap">
                          {formatPrice(t.total)}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {isRefunded ? (
                            <span className="text-orange-400 font-medium">-{formatPrice(t.refundAmount!)}</span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                          <span className={isRefunded ? 'text-orange-300' : 'text-emerald-400'}>
                            {formatPrice(net)}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleReprintTxn(t)}
                              title="Reprint"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                            >
                              <PrinterIcon className="w-3.5 h-3.5" />
                            </button>
                            {!isRefunded && (
                              <button
                                onClick={() => setRefundingTxn({ id: t.id, orderNumber: t.orderNumber, total: t.total, paymentLabel: t.paymentLabel, items: t.items })}
                                title="Request refund"
                                className="p-1.5 rounded-lg text-orange-500/60 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                              >
                                <RotateCcwIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isRefunded && (
                        <tr className={`bg-orange-950/10`}>
                          <td colSpan={8} className="px-4 pb-2 pt-0">
                            <p className="text-[10px] text-orange-400/80 italic">
                              Refund approved · {t.refundReason}
                              {t.refundedAt ? ` · ${new Date(t.refundedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-900 border-t border-slate-800">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-slate-500 text-xs font-medium">
                    {shiftTxns.length} transaction{shiftTxns.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{formatPrice(grossTotal)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-orange-400">
                    {totalRefunds > 0 ? `-${formatPrice(totalRefunds)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-400">{formatPrice(netTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {refundingTxn && (
        <RefundModal
          txn={refundingTxn}
          onConfirm={handleRefund}
          onCancel={() => setRefundingTxn(null)}
        />
      )}
      </>
    );
  }

  // ── Receipt Modal ──────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
          {/* Success header */}
          <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border-b border-emerald-500/20 px-6 py-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-sm">Sale Complete</p>
              <p className="text-xs text-emerald-400 mt-0.5">{formatPrice(receipt.total)} received</p>
            </div>
            <button onClick={() => setReceipt(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Receipt body */}
          <div className="p-5 space-y-4">
            <div className="bg-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="text-center border-b border-dashed border-slate-700 pb-3">
                <p className="font-bold text-slate-100 text-sm">{restaurantName}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  #{receipt.orderNumber} · {receipt.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {receipt.lines.map((l) => (
                  <div key={l.item.id} className="flex justify-between text-xs text-slate-300">
                    <span className="truncate mr-2">{l.item.name} <span className="text-slate-500">×{l.qty}</span></span>
                    <span className="shrink-0 font-medium">{formatPrice(l.item.price * l.qty)}</span>
                  </div>
                ))}
              </div>
              {receipt.taxAmount > 0 && (
                <>
                  <div className="border-t border-slate-700/50 pt-2 flex justify-between text-xs">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="text-slate-400">{formatPrice(receipt.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{taxLabel} ({receipt.taxRate}%)</span>
                    <span className="text-slate-400">{formatPrice(receipt.taxAmount)}</span>
                  </div>
                </>
              )}
              <div className={`${receipt.taxAmount > 0 ? '' : 'border-t border-slate-700 pt-2.5 '}flex justify-between items-center`}>
                <span className="text-xs text-slate-400 font-semibold">TOTAL</span>
                <span className="text-base font-bold text-white">{formatPrice(receipt.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{receipt.payments.map((p) => p.method).join(' + ')}</span>
                {receipt.change > 0 && (
                  <span className="text-amber-400 font-medium">Change: {formatPrice(receipt.change)}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 text-center">Cashier: {receipt.cashierName}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors border border-slate-700"
              >
                <PrinterIcon className="w-4 h-4" /> Print
              </button>
              <button
                onClick={() => setReceipt(null)}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="shrink-0 bg-slate-900 border-b border-slate-800/80">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 sm:px-4 pt-3 pb-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
              <ShoppingCartIcon className="w-4 h-4 text-slate-900" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate leading-tight">{restaurantName}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">Cashier POS</p>
            </div>
          </div>

          {/* Cashier badge (desktop) */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-[10px] font-bold text-white">
              {cashierInitials}
            </div>
            <span className="text-xs text-slate-300 font-medium">{cashier?.name}</span>
          </div>

          {/* Cart toggle (mobile) */}
          <button
            onClick={() => setShowCart(true)}
            className="relative sm:hidden p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700/50"
          >
            <ShoppingCartIcon className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-900 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>

          {/* Today's sales / history */}
          <button
            onClick={() => { setShowHistory(true); loadShiftTxns(); }}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors border border-slate-700/50"
            title="Today's sales"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>

          <button
            onClick={onLogout}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Logout"
          >
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Shift summary widget */}
        <div className="px-3 sm:px-4 pb-2">
          {holdCart && (
            <div className="flex justify-end mb-1.5">
              <button
                onClick={recallHeldCart}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors"
              >
                <BookmarkCheckIcon className="w-3 h-3" /> Recall Hold
              </button>
            </div>
          )}
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            {/* Top row: key KPIs */}
            <div className="flex items-center gap-0 divide-x divide-slate-700/50">
              <div className="flex flex-col items-center px-4 py-2.5 flex-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Sales</span>
                <span className="text-sm font-bold text-slate-200">{shiftSales.count}</span>
              </div>
              <div className="flex flex-col items-center px-4 py-2.5 flex-1">
                <span className="text-[9px] text-emerald-600 uppercase tracking-wider mb-0.5">Revenue</span>
                <span className="text-sm font-bold text-emerald-400">{formatPrice(shiftSales.total)}</span>
              </div>
              {openingFloat !== null && (
                <div className="flex flex-col items-center px-4 py-2.5 flex-1">
                  <span className="text-[9px] text-amber-500/80 uppercase tracking-wider mb-0.5">Float</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(openingFloat)}</span>
                </div>
              )}
              {shiftSales.count > 0 && (
                <div className="hidden sm:flex flex-col items-center px-4 py-2.5 flex-1">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Avg Sale</span>
                  <span className="text-sm font-bold text-slate-300">{formatPrice(Math.round(shiftSales.total / shiftSales.count))}</span>
                </div>
              )}
              <button
                onClick={loadShiftStats}
                className="p-2.5 text-slate-500 hover:text-amber-400 transition-colors"
                title="Refresh stats"
              >
                <RefreshCwIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Payment breakdown row */}
            {shiftSales.count > 0 && Object.keys(shiftSales.byPayment).length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-700/40 bg-slate-900/40 flex-wrap">
                {Object.entries(shiftSales.byPayment).map(([method, amt]) => (
                  <span key={method} className="flex items-center gap-1.5 text-[10px] bg-slate-800 border border-slate-700/50 rounded-lg px-2 py-1">
                    <span className="text-slate-500">{method}</span>
                    <span className="font-bold text-slate-300">{formatPrice(amt)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Product panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
          {/* Barcode / SKU quick-add */}
          <div className="flex gap-2 px-3 sm:px-4 pt-3 pb-1 shrink-0 bg-slate-900/50">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">SKU</span>
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => { setBarcodeInput(e.target.value); setBarcodeError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { handleBarcodeSubmit(barcodeInput); }
                }}
                placeholder="Scan barcode or enter SKU…"
                className={`w-full pl-12 pr-10 py-2 bg-slate-800 border rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 transition-all ${
                  barcodeError
                    ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-700/60 focus:border-amber-500/70 focus:ring-amber-500/20'
                }`}
              />
              {barcodeInput && (
                <button
                  onClick={() => { setBarcodeInput(''); setBarcodeError(''); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => handleBarcodeSubmit(barcodeInput)}
              disabled={!barcodeInput.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500 text-slate-900 font-bold text-xs hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
          {barcodeError && (
            <p className="px-3 sm:px-4 pb-1 text-xs text-red-400 shrink-0 bg-slate-900/50">{barcodeError}</p>
          )}

          {/* Search + refresh */}
          <div className="flex gap-2 px-3 sm:px-4 py-2 shrink-0 bg-slate-900/50 border-b border-slate-800/60">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>
            <button
              onClick={loadProducts}
              className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-500 hover:text-slate-200 hover:border-slate-600 transition-colors"
              title="Refresh products"
            >
              <RefreshCwIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1.5 px-3 sm:px-4 py-2.5 overflow-x-auto shrink-0 scrollbar-none border-b border-slate-800/60">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-slate-700/50'
                }`}
              >
                {cat === 'all' ? 'All Products' : cat}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                <RefreshCwIcon className="w-6 h-6 animate-spin text-amber-500" />
                <span className="text-sm">Loading products…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center">
                  <SearchIcon className="w-6 h-6 opacity-40" />
                </div>
                <p className="text-sm font-medium">No products found</p>
                <p className="text-xs text-slate-600">Try a different search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {filtered.map((product) => {
                  const inCart = cart.find((l) => l.item.id === product.id);
                  const stock = stockMap[product.id] ?? null;
                  const threshold = thresholdMap[product.id] ?? 5;
                  const outOfStock = stock !== null && stock <= 0;
                  const lowStock = stock !== null && stock > 0 && stock <= threshold;
                  return (
                    <button
                      key={product.id}
                      onClick={() => !outOfStock && addToCart(product)}
                      disabled={outOfStock}
                      className={`relative flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all duration-150 active:scale-95 ${
                        outOfStock
                          ? 'border-slate-800 bg-slate-800/20 opacity-40 cursor-not-allowed'
                          : inCart
                          ? 'border-amber-500/70 bg-amber-500/8 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/20'
                          : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-800/80 hover:shadow-md'
                      }`}
                    >
                      {/* Stock badge */}
                      {!outOfStock && (
                        <div className="absolute top-2.5 right-2.5">
                          {lowStock ? (
                            <span className="flex items-center gap-0.5 text-[9px] bg-amber-900/60 text-amber-400 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/20">
                              <AlertTriangleIcon className="w-2.5 h-2.5" /> {stock}
                            </span>
                          ) : stock !== null ? (
                            <span className="text-[9px] text-slate-600 font-medium">{stock}</span>
                          ) : null}
                        </div>
                      )}
                      {outOfStock && (
                        <div className="absolute top-2.5 right-2.5">
                          <span className="flex items-center gap-0.5 text-[9px] bg-red-900/60 text-red-400 px-1.5 py-0.5 rounded-full font-bold border border-red-500/20">
                            <PackageXIcon className="w-2.5 h-2.5" /> Out
                          </span>
                        </div>
                      )}

                      <div className="w-8 h-8 rounded-xl bg-slate-700/60 border border-slate-600/40 flex items-center justify-center mb-2 shrink-0 text-xs font-bold text-slate-400">
                        {product.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-xs font-semibold text-slate-200 line-clamp-2 leading-snug pr-6">{product.name}</p>
                      <p className="text-sm font-bold text-amber-400 mt-1.5">{formatPrice(product.price)}</p>

                      {inCart && (
                        <div className="absolute bottom-2.5 right-2.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-slate-900">{inCart.qty}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Cart sidebar ── */}
        <div
          className={`
            fixed inset-0 z-40 sm:static sm:z-auto sm:flex
            flex-col w-full sm:w-[22rem] xl:w-[24rem] 2xl:w-[28rem]
            bg-slate-900 border-l border-slate-800/80
            transition-transform duration-200
            ${showCart ? 'flex' : 'hidden sm:flex'}
          `}
        >
          {/* Cart/Txns header with tab strip */}
          <div className="shrink-0 border-b border-slate-800/80">
            {/* Tab strip */}
            <div className="flex items-center gap-1 px-3 pt-2.5 pb-0">
              <button
                onClick={() => setSidebarTab('cart')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-xl text-xs font-semibold transition-all border-b-2 ${
                  sidebarTab === 'cart'
                    ? 'text-amber-400 border-amber-500 bg-amber-500/5'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                <ShoppingCartIcon className="w-3.5 h-3.5" />
                Cart
                {cartCount > 0 && (
                  <span className="ml-0.5 text-[9px] bg-amber-500 text-slate-900 font-bold px-1.5 py-0.5 rounded-full">{cartCount}</span>
                )}
              </button>
              <button
                onClick={() => { setSidebarTab('txns'); if (shiftTxns.length === 0) loadShiftTxns(); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-xl text-xs font-semibold transition-all border-b-2 ${
                  sidebarTab === 'txns'
                    ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                <HistoryIcon className="w-3.5 h-3.5" />
                Transactions
                {shiftTxns.length > 0 && (
                  <span className="ml-0.5 text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded-full">{shiftTxns.length}</span>
                )}
              </button>
            </div>
            {/* Sub-header row */}
            {sidebarTab === 'cart' ? (
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-slate-500">
                  {cartCount > 0 ? `${cartCount} item${cartCount !== 1 ? 's' : ''}` : 'Empty'}
                </span>
                <div className="flex items-center gap-1">
                  {cart.length > 0 && (
                    <button
                      onClick={holdCurrentCart}
                      title="Hold this cart"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
                    >
                      <BookmarkIcon className="w-3 h-3" /> Hold
                    </button>
                  )}
                  <button
                    onClick={() => setShowCart(false)}
                    className="sm:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-slate-500">{shiftTxns.length} txn{shiftTxns.length !== 1 ? 's' : ''} today</span>
                <button
                  onClick={loadShiftTxns}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  title="Refresh"
                >
                  <RefreshCwIcon className={`w-3.5 h-3.5 ${txnsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* Cart lines */}
          <div className={`flex-1 overflow-y-auto px-3 py-2 ${sidebarTab === 'txns' ? 'hidden' : ''}`}>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-3">
                  <ShoppingCartIcon className="w-5 h-5 opacity-30" />
                </div>
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs text-slate-600 mt-1">Tap a product to add it</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {cart.map((line) => (
                  <div key={line.item.id} className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600/40 flex items-center justify-center shrink-0 text-xs font-bold text-slate-400">
                        {line.item.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">{line.item.name}</p>
                        <p className="text-xs text-amber-400 font-bold mt-0.5">{formatPrice(line.item.price * line.qty)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(line.item.id, line.qty - 1)}
                          className="w-7 h-7 rounded-xl bg-slate-700 border border-slate-600/50 flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs text-white font-bold">{line.qty}</span>
                        <button
                          onClick={() => setQty(line.item.id, line.qty + 1)}
                          className="w-7 h-7 rounded-xl bg-slate-700 border border-slate-600/50 flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors"
                        >
                          <PlusIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setQty(line.item.id, 0)}
                          className="w-7 h-7 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors ml-1"
                          title="Remove"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setNote(line.item.id, line.note !== undefined ? undefined as any : '')}
                          className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-colors ${
                            line.note !== undefined
                              ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                              : 'bg-slate-700 border-slate-600/50 text-slate-500 hover:text-slate-300'
                          }`}
                          title="Add note"
                        >
                          <MessageSquareIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {line.note !== undefined && (
                      <input
                        type="text"
                        value={line.note}
                        onChange={(e) => setNote(line.item.id, e.target.value)}
                        placeholder="e.g. no ice, extra bag…"
                        className="w-full px-2.5 py-1.5 bg-slate-700/60 border border-slate-600/50 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                        autoFocus
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Transactions inline panel ── */}
          {sidebarTab === 'txns' && (
            <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
              {/* Payment method breakdown */}
              {shiftTxns.length > 0 && (() => {
                const byMethod: Record<string, number> = {};
                shiftTxns.forEach((t) => {
                  byMethod[t.paymentLabel] = (byMethod[t.paymentLabel] || 0) + t.total;
                });
                return (
                  <div className="px-3 pt-3 pb-2 space-y-1 border-b border-slate-800/80 shrink-0">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Today's Breakdown</p>
                    {Object.entries(byMethod).map(([method, total]) => (
                      <div key={method} className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">{method}</span>
                        <span className="font-bold text-slate-200">{formatPrice(total)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/60 text-xs">
                      <span className="text-slate-300 font-semibold">Total</span>
                      <span className="font-black text-emerald-400">{formatPrice(shiftSales.total)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Read-only transaction table */}
              <div className="shrink-0 px-3 py-2 border-b border-slate-800/80 bg-slate-900/70 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <SearchIcon className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={txnSearch}
                      onChange={(e) => setTxnSearch(e.target.value)}
                      placeholder="Search order or payment"
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex gap-2">
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
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {txnsLoading ? (
                  <div className="flex items-center justify-center h-32 text-slate-400">
                    <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> Loading…
                  </div>
                ) : filteredTxns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-36 text-slate-500">
                    <HistoryIcon className="w-7 h-7 mb-2 opacity-30" />
                    <p className="text-xs font-medium">No transactions match the current filters</p>
                  </div>
                ) : (
                  <div className="min-w-[460px] sm:min-w-[560px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900/95 z-10 border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-400">Order</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-400">Time</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-400">Payment</th>
                          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-400">Items</th>
                          <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/90">
                        {filteredTxns.map((t) => (
                          <Fragment key={t.id}>
                            <tr
                              className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                              onClick={() => setExpandedTxn(expandedTxn === t.id ? null : t.id)}
                            >
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-300 font-semibold">#{t.orderNumber}</span>
                                  {expandedTxn === t.id
                                    ? <ChevronUpIcon className="w-3 h-3 text-slate-500" />
                                    : <ChevronDownIcon className="w-3 h-3 text-slate-500" />}
                                </div>
                                <div className="text-[10px] text-slate-600">{t.id.slice(0, 8)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                {t.timestamp.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="inline-flex rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-700/40">
                                  {t.paymentLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                {t.itemCount} item{t.itemCount !== 1 ? 's' : ''}
                              </td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap font-bold text-emerald-400">
                                {formatPrice(t.total)}
                              </td>
                            </tr>
                            {expandedTxn === t.id && (
                              <tr className="bg-slate-900/60">
                                <td colSpan={5} className="px-3 py-2.5">
                                  <div className="space-y-1">
                                    {t.items.map((item, idx) => (
                                      <div key={idx} className="flex justify-between text-[11px]">
                                        <span className="text-slate-300">{item.name} <span className="text-slate-500">×{item.qty}</span></span>
                                        <span className="text-slate-400 font-medium">{formatPrice(item.price)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checkout section */}
          <div className={`border-t border-slate-800/80 p-4 space-y-3 shrink-0 bg-slate-900/80 ${sidebarTab === 'txns' ? 'hidden' : ''}`}>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/20 transition-all"
            />

            <div className="space-y-1 px-1">
              {taxRate > 0 && cartCount > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatPrice(cartSubtotal)}</span>
                </div>
              )}
              {taxRate > 0 && cartCount > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{taxLabel} ({taxRate}%)</span>
                  <span>{formatPrice(cartTaxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total</span>
                <span className={`text-xl font-black ${cartCount > 0 ? 'text-white' : 'text-slate-600'}`}>{formatPrice(cartTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => cart.length > 0 && setShowPaymentModal(true)}
              disabled={cart.length === 0 || checkingOut}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {checkingOut ? (
                <>
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  Confirm Sale
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>

    {showPaymentModal && (
      <PaymentCaptureModal
        total={cartTotal}
        currency="RWF"
        onConfirm={handleCheckout}
        onCancel={() => setShowPaymentModal(false)}
      />
    )}

    {refundingTxn && (
      <RefundModal
        txn={refundingTxn}
        onConfirm={handleRefund}
        onCancel={() => setRefundingTxn(null)}
      />
    )}
    </>
  );
}
