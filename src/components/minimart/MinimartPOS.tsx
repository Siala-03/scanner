import { useState, useEffect, useCallback } from 'react';
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
import { createRefund } from '../../api/refunds';
import { getMinimartSettings } from '../../api/minimartSettings';
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
}

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

// ── Main POS ─────────────────────────────────────────────────────────────────

interface MinimartPOSProps {
  restaurantName: string;
  cashier: Staff | null;
  restaurantId?: string;
  onLogout: () => void;
}

export function MinimartPOS({ restaurantName, cashier, restaurantId, onLogout }: MinimartPOSProps) {
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
  const [shiftSales, setShiftSales] = useState({ count: 0, total: 0 });
  const [receiptSettings, setReceiptSettings] = useState<RestaurantReceiptSettings>({});
  // Hold cart
  const [holdCart, setHoldCart] = useState<CartLine[] | null>(null);
  // Transaction history
  const [showHistory, setShowHistory] = useState(false);
  const [shiftTxns, setShiftTxns] = useState<ShiftTxn[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  // Stock map: menuItemId -> current stock
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState<'cart' | 'txns'>('cart');
  // Refund workflow
  const [refundingTxn, setRefundingTxn] = useState<RefundableTxn | null>(null);
  // Tax settings
  const [taxRate, setTaxRate] = useState(0);
  const [taxLabel, setTaxLabel] = useState('Tax');

  const loadShiftStats = useCallback(async () => {
    if (!restaurantId || !cashier?.id) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('total')
        .eq('restaurant_id', restaurantId)
        .eq('payment_status', 'confirmed')
        .eq('payment_confirmed_by', cashier.id)
        .gte('created_at', todayStart.toISOString());
      const rows = data || [];
      setShiftSales({
        count: rows.length,
        total: rows.reduce((s: number, o: any) => s + (o.total || 0), 0),
      });
    } catch {
      // non-fatal
    }
  }, [restaurantId, cashier?.id]);

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
      const map: Record<string, number> = {};
      (inv as InventoryRecord[]).forEach((r) => {
        if (r.menuItemId) map[r.menuItemId] = r.stock ?? 0;
      });
      setStockMap(map);
    } catch {
      // non-fatal
    }
  }, []);

  const loadShiftTxns = useCallback(async () => {
    if (!restaurantId || !cashier?.id) return;
    setTxnsLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const candidateSelects = [
        'id, order_number, total, items, created_at, payment_type',
        'id, order_number, total, items, created_at, payment_method',
        'id, order_number, total, items, created_at',
      ];
      let data: any[] = [];

      for (const selectCols of candidateSelects) {
        const res = await supabase
          .from('orders')
          .select(selectCols)
          .eq('restaurant_id', restaurantId)
          .eq('payment_status', 'confirmed')
          .eq('payment_confirmed_by', cashier.id)
          .gte('created_at', todayStart.toISOString())
          .order('created_at', { ascending: false });

        if (!res.error) {
          data = res.data || [];
          break;
        }

        const msg = String(res.error.message || '').toLowerCase();
        if (!msg.includes('column') && !msg.includes('does not exist')) {
          data = [];
          break;
        }
      }
      const PLABEL: Record<string, string> = { '01': 'Cash', '02': 'Card', '04': 'Mobile Money' };
      const rows: ShiftTxn[] = (data || []).map((o: any) => ({
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
      }));
      setShiftTxns(rows);
    } catch {
      // non-fatal
    } finally {
      setTxnsLoading(false);
    }
  }, [restaurantId, cashier?.id]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadShiftStats(); }, [loadShiftStats]);
  useEffect(() => { loadStockMap(); }, [loadStockMap]);
  useEffect(() => {
    if (!restaurantId) return;
    fetchReceiptSettings(restaurantId).then(setReceiptSettings).catch(() => {});
    getMinimartSettings(restaurantId)
      .then((s) => { setTaxRate(s.taxRate); setTaxLabel(s.taxLabel); })
      .catch(() => {});
  }, [restaurantId]);

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
        restaurantId,
      } as any);

      await confirmPayment(order.id, {
        paymentType:  methodCode,
        confirmedBy:  cashier?.id,
        restaurantId,
      });

      if (restaurantId) {
        fiscalizeOrder(order.id, { restaurantId, paymentType: methodCode })
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
      setSidebarTab('txns');
    } catch (err) {
      console.error('Checkout failed:', err);
      alert('Checkout failed. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleRefund = async (params: { refundAmount: number; reason: string }) => {
    if (!refundingTxn || !restaurantId) return;
    await createRefund({
      orderId:      refundingTxn.id,
      restaurantId,
      refundedBy:   cashier?.id,
      refundAmount: params.refundAmount,
      reason:       params.reason,
      items:        refundingTxn.items,
    });
    setRefundingTxn(null);
    alert(`Refund of ${formatPrice(params.refundAmount)} recorded for order #${refundingTxn.orderNumber}.`);
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
        quantity:   l.qty,
        name:       l.item.name,
        unitPrice:  l.item.price,
        totalPrice: l.item.price * l.qty,
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

  // ── History Modal ──────────────────────────────────────────────────────────
  if (showHistory) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
        <div className="flex items-center gap-3 px-4 py-4 bg-slate-900 border-b border-slate-800/80 shrink-0">
          <button
            onClick={() => setShowHistory(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">Today's Sales</p>
            <p className="text-xs text-slate-400 mt-0.5">{shiftTxns.length} transaction{shiftTxns.length !== 1 ? 's' : ''} · {formatPrice(shiftSales.total)}</p>
          </div>
          <button
            onClick={loadShiftTxns}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCwIcon className={`w-4 h-4 ${txnsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
            shiftTxns.map((t) => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedTxn(expandedTxn === t.id ? null : t.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">#{t.orderNumber}</p>
                      <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full">{t.paymentLabel}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.itemCount} item{t.itemCount !== 1 ? 's' : ''} · {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400 shrink-0">{formatPrice(t.total)}</p>
                  {expandedTxn === t.id
                    ? <ChevronUpIcon className="w-4 h-4 text-slate-500 shrink-0" />
                    : <ChevronDownIcon className="w-4 h-4 text-slate-500 shrink-0" />}
                </button>
                {expandedTxn === t.id && (
                  <div className="border-t border-slate-800 px-4 py-3 space-y-2 bg-slate-800/20">
                    <div className="space-y-1.5">
                      {t.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-slate-300">{item.name} <span className="text-slate-500">×{item.qty}</span></span>
                          <span className="text-slate-400 font-medium">{formatPrice(item.price)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleReprintTxn(t)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                      >
                        <PrinterIcon className="w-3 h-3" /> Reprint
                      </button>
                      <button
                        onClick={() => setRefundingTxn({ id: t.id, orderNumber: t.orderNumber, total: t.total, paymentLabel: t.paymentLabel, items: t.items })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/25 text-orange-400 hover:bg-orange-500/25 text-xs font-medium transition-colors"
                      >
                        <RotateCcwIcon className="w-3 h-3" /> Refund
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
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
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
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

          {/* Action buttons */}
          <button
            onClick={() => { setShowHistory(true); loadShiftTxns(); }}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors border border-slate-700/50"
            title="Today's sales"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>

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

          <button
            onClick={onLogout}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Logout"
          >
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Shift stats strip */}
        <div className="flex items-center gap-1 px-4 py-2">
          <div className="flex items-center gap-2.5 flex-1">
            <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/40 rounded-xl px-3 py-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Sales</span>
              <span className="text-xs font-bold text-slate-200">{shiftSales.count}</span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wide">Revenue</span>
              <span className="text-xs font-bold text-emerald-400">{formatPrice(shiftSales.total)}</span>
            </div>
            {shiftSales.count > 0 && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-800/50 border border-slate-700/40 rounded-xl px-3 py-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">Avg</span>
                <span className="text-xs font-bold text-slate-300">{formatPrice(Math.round(shiftSales.total / shiftSales.count))}</span>
              </div>
            )}
          </div>
          {holdCart && (
            <button
              onClick={recallHeldCart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors"
            >
              <BookmarkCheckIcon className="w-3 h-3" /> Recall Hold
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Product panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
          {/* Search + refresh */}
          <div className="flex gap-2 px-4 py-3 shrink-0 bg-slate-900/50 border-b border-slate-800/60">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/20 transition-all"
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
          <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto shrink-0 scrollbar-none border-b border-slate-800/60">
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
          <div className="flex-1 overflow-y-auto p-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map((product) => {
                  const inCart = cart.find((l) => l.item.id === product.id);
                  const stock = stockMap[product.id] ?? null;
                  const outOfStock = stock !== null && stock <= 0;
                  const lowStock = stock !== null && stock > 0 && stock <= 5;
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
            flex-col w-full sm:w-80 xl:w-96
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

              {/* Transaction list */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {txnsLoading ? (
                  <div className="flex items-center justify-center h-32 text-slate-400">
                    <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> Loading…
                  </div>
                ) : shiftTxns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-36 text-slate-500">
                    <HistoryIcon className="w-7 h-7 mb-2 opacity-30" />
                    <p className="text-xs font-medium">No sales yet today</p>
                  </div>
                ) : (
                  shiftTxns.map((t) => (
                    <div key={t.id} className="bg-slate-800/60 border border-slate-700/40 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedTxn(expandedTxn === t.id ? null : t.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700/30 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-white">#{t.orderNumber}</p>
                            <span className="text-[9px] bg-slate-700 text-slate-400 border border-slate-600 px-1.5 py-0.5 rounded-full">{t.paymentLabel}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {t.itemCount} item{t.itemCount !== 1 ? 's' : ''} · {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-emerald-400">{formatPrice(t.total)}</p>
                          {expandedTxn === t.id
                            ? <ChevronUpIcon className="w-3 h-3 text-slate-500 mt-0.5 ml-auto" />
                            : <ChevronDownIcon className="w-3 h-3 text-slate-500 mt-0.5 ml-auto" />}
                        </div>
                      </button>
                      {expandedTxn === t.id && (
                        <div className="border-t border-slate-700/50 px-3 py-2 space-y-1 bg-slate-800/30">
                          {t.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[10px]">
                              <span className="text-slate-300">{item.name} <span className="text-slate-500">×{item.qty}</span></span>
                              <span className="text-slate-400 font-medium">{formatPrice(item.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
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
