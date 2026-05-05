import { useState, useEffect, useCallback } from 'react';
import {
  SearchIcon, ShoppingCartIcon, PlusIcon, MinusIcon, TrashIcon,
  CheckCircleIcon, RefreshCwIcon, PrinterIcon, XIcon, LogOutIcon,
  HistoryIcon, ChevronUpIcon, ChevronDownIcon, BookmarkCheckIcon,
  PackageXIcon, AlertTriangleIcon, BookmarkIcon, MessageSquareIcon,
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
import { fetchInventory } from '../../api/inventory';
import type { InventoryRecord } from '../../api/inventory';
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

  const cartTotal = cart.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0);

  const handleCheckout = async (payments: PaymentEntry[], change: number) => {
    if (cart.length === 0) return;
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
        items: cart.map((l) => ({
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

      setReceipt({
        orderId:      order.id,
        orderNumber:  (order as any).order_number || (order as any).orderNumber || order.id.slice(-6).toUpperCase(),
        lines:        [...cart],
        total:        cartTotal,
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
    } catch (err) {
      console.error('Checkout failed:', err);
      alert('Checkout failed. Please try again.');
    } finally {
      setCheckingOut(false);
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
      subtotal:      receipt.total,
      taxRate:       0,
      taxAmount:     0,
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

  // ── History Modal ──────────────────────────────────────────────────────────
  if (showHistory) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <XIcon className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <p className="font-semibold text-slate-100 text-sm">Today's Sales</p>
            <p className="text-xs text-slate-400">{shiftTxns.length} transactions · {formatPrice(shiftSales.total)}</p>
          </div>
          <button
            onClick={loadShiftTxns}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <RefreshCwIcon className={`w-4 h-4 ${txnsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {txnsLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : shiftTxns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
              <HistoryIcon className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No sales yet today</p>
            </div>
          ) : (
            shiftTxns.map((t) => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedTxn(expandedTxn === t.id ? null : t.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-100">#{t.orderNumber}</p>
                      <span className="text-[10px] bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">{t.paymentLabel}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.itemCount} item{t.itemCount !== 1 ? 's' : ''} · {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400 shrink-0">{formatPrice(t.total)}</p>
                  {expandedTxn === t.id ? <ChevronUpIcon className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>
                {expandedTxn === t.id && (
                  <div className="border-t border-slate-800 px-4 py-3 space-y-1.5 bg-slate-800/30">
                    {t.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-300">{item.name} ×{item.qty}</span>
                        <span className="text-slate-400">{formatPrice(item.price)}</span>
                      </div>
                    ))}
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
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircleIcon className="w-5 h-5" />
              <span className="font-semibold">Sale Complete</span>
            </div>
            <button
              onClick={() => setReceipt(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Receipt body */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-3 text-sm font-mono">
            <div className="text-center">
              <p className="font-bold text-slate-100">{restaurantName}</p>
              <p className="text-slate-400 text-xs">#{receipt.orderNumber}</p>
              <p className="text-slate-400 text-xs">
                {receipt.timestamp.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
            <div className="border-t border-dashed border-slate-600 pt-2 space-y-1">
              {receipt.lines.map((l) => (
                <div key={l.item.id} className="flex justify-between text-slate-300">
                  <span className="truncate mr-2">{l.item.name} ×{l.qty}</span>
                  <span className="shrink-0">{formatPrice(l.item.price * l.qty)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-slate-600 pt-2 flex justify-between font-bold text-slate-100">
              <span>TOTAL</span>
              <span>{formatPrice(receipt.total)}</span>
            </div>
            <div className="text-slate-400 text-xs flex justify-between">
              <span>Payment</span>
              <span>{receipt.payments.map(p => p.method).join(' + ')}</span>
            </div>
            {receipt.change > 0 && (
              <div className="text-slate-400 text-xs flex justify-between">
                <span>Change</span>
                <span className="text-amber-300">{formatPrice(receipt.change)}</span>
              </div>
            )}
            {receipt.lines[0] && (
              <div className="text-slate-500 text-xs text-center">Cashier: {receipt.cashierName}</div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
            >
              <PrinterIcon className="w-4 h-4" /> Print
            </button>
            <button
              onClick={() => setReceipt(null)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              New Sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex flex-col bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Minimart POS</p>
            <p className="font-semibold text-slate-100 truncate">{restaurantName}</p>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">{cashier?.name}</span>
          {/* History button */}
          <button
            onClick={() => { setShowHistory(true); loadShiftTxns(); }}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
            title="View today's sales"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>
        {/* Cart toggle (mobile) */}
        <button
          onClick={() => setShowCart(true)}
          className="relative sm:hidden p-2 rounded-lg bg-slate-800 text-slate-300"
        >
          <ShoppingCartIcon className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-900 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
          <button onClick={onLogout} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>
        {/* Shift summary */}
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-800/60 border-t border-slate-800 text-xs text-slate-400">
          <span>Shift:</span>
          <span className="text-slate-200 font-medium">{shiftSales.count} sale{shiftSales.count !== 1 ? 's' : ''}</span>
          <span className="text-emerald-400 font-semibold">{formatPrice(shiftSales.total)}</span>
          {shiftSales.count > 0 && (
            <span className="text-slate-500 hidden sm:inline">avg {formatPrice(Math.round(shiftSales.total / shiftSales.count))}</span>
          )}
          {holdCart && (
            <button
              onClick={recallHeldCart}
              className="ml-auto flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium"
            >
              <BookmarkCheckIcon className="w-3.5 h-3.5" /> Recall held order
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Product panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Search + refresh */}
          <div className="flex gap-2 px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={loadProducts}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto shrink-0 scrollbar-none border-b border-slate-800">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-slate-900 font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-slate-400">
                <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                No products found
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
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        outOfStock
                          ? 'border-slate-700 bg-slate-800/30 opacity-50 cursor-not-allowed'
                          : inCart
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-slate-700 bg-slate-800/60 hover:border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      <div className="w-full flex items-start justify-between mb-1.5 gap-1">
                        <span className="text-2xl">{product.emoji || '📦'}</span>
                        {outOfStock ? (
                          <span className="flex items-center gap-0.5 text-[9px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                            <PackageXIcon className="w-2.5 h-2.5" /> Out
                          </span>
                        ) : lowStock ? (
                          <span className="flex items-center gap-0.5 text-[9px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                            <AlertTriangleIcon className="w-2.5 h-2.5" /> {stock}
                          </span>
                        ) : stock !== null ? (
                          <span className="text-[9px] text-slate-500">{stock}</span>
                        ) : null}
                      </div>
                      <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-snug">{product.name}</p>
                      <p className="text-xs text-amber-400 font-semibold mt-1">{formatPrice(product.price)}</p>
                      {inCart && (
                        <span className="mt-1.5 text-[10px] bg-amber-500 text-slate-900 px-1.5 py-0.5 rounded-full font-semibold">
                          ×{inCart.qty} in cart
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Cart sidebar (desktop always visible, mobile as overlay) ── */}
        <div
          className={`
            fixed inset-0 z-40 sm:static sm:z-auto sm:flex
            flex-col w-full sm:w-80 xl:w-96
            bg-slate-900 border-l border-slate-800
            transition-transform duration-200
            ${showCart ? 'flex' : 'hidden sm:flex'}
          `}
        >
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCartIcon className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-100 text-sm">Cart</span>
              {cartCount > 0 && (
                <span className="bg-amber-500 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{cartCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {cart.length > 0 && (
                <button
                  onClick={holdCurrentCart}
                  title="Hold this cart"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                >
                  <BookmarkIcon className="w-3.5 h-3.5" /> Hold
                </button>
              )}
              <button
                onClick={() => setShowCart(false)}
                className="sm:hidden p-1 text-slate-400 hover:text-slate-200"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cart lines */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm">
                <ShoppingCartIcon className="w-8 h-8 mb-2 opacity-30" />
                Cart is empty
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {cart.map((line) => (
                  <div key={line.item.id} className="bg-slate-800 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{line.item.emoji || '📦'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{line.item.name}</p>
                        <p className="text-xs text-amber-400">{formatPrice(line.item.price * line.qty)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(line.item.id, line.qty - 1)}
                          className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-600"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs text-slate-200 font-medium">{line.qty}</span>
                        <button
                          onClick={() => setQty(line.item.id, line.qty + 1)}
                          className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-600"
                        >
                          <PlusIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setQty(line.item.id, 0)}
                          className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-red-400 hover:bg-red-900/30 ml-0.5"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setNote(line.item.id, line.note !== undefined ? undefined as any : '')}
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${line.note !== undefined ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
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
                        placeholder="Note (e.g. no ice)…"
                        className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        autoFocus
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout section */}
          <div className="border-t border-slate-800 p-4 space-y-3 shrink-0">
            {/* Customer name (optional) */}
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />

            {/* Total */}
            <div className="flex justify-between items-center py-2 border-t border-slate-700">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-lg font-bold text-slate-100">{formatPrice(cartTotal)}</span>
            </div>

            {/* Checkout button */}
            <button
              onClick={() => cart.length > 0 && setShowPaymentModal(true)}
              disabled={cart.length === 0 || checkingOut}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
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
    </>
  );
}
