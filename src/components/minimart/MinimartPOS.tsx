import { useState, useEffect, useCallback } from 'react';
import {
  SearchIcon, ShoppingCartIcon, PlusIcon, MinusIcon, TrashIcon,
  CheckCircleIcon, RefreshCwIcon, BanknoteIcon, CreditCardIcon,
  SmartphoneIcon, PrinterIcon, XIcon, LogOutIcon,
} from 'lucide-react';
import { fetchMenu } from '../../api/menu';
import { createOrder, confirmPayment } from '../../api/orders';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../utils/currency';
import { fetchReceiptSettings } from '../../api/restaurants';
import { buildReceiptHtml, printReceipt } from '../../utils/receipt';
import { fiscalizeOrder } from '../../api/ebm';
import type { MenuItem, Staff } from '../../types';
import type { RestaurantReceiptSettings } from '../../api/restaurants';

interface CartLine {
  item: MenuItem;
  qty: number;
}

interface Receipt {
  orderId: string;
  orderNumber: string;
  lines: CartLine[];
  total: number;
  paymentMethod: string;
  cashierName: string;
  customerName?: string;
  timestamp: Date;
}

const PAYMENT_METHODS = [
  { code: '01', label: 'Cash',         icon: BanknoteIcon },
  { code: '02', label: 'Card',         icon: CreditCardIcon },
  { code: '04', label: 'Mobile Money', icon: SmartphoneIcon },
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
  const [paymentMethod, setPaymentMethod] = useState('01');
  const [customerName, setCustomerName] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [shiftSales, setShiftSales] = useState({ count: 0, total: 0 });
  const [receiptSettings, setReceiptSettings] = useState<RestaurantReceiptSettings>({});

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

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadShiftStats(); }, [loadShiftStats]);
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

  const cartTotal = cart.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
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

      // Confirm payment immediately at point of sale
      await confirmPayment(order.id, {
        paymentType:  paymentMethod,
        confirmedBy:  cashier?.id,
        restaurantId,
      });

      // Fire-and-forget EBM fiscalization
      if (restaurantId) {
        fiscalizeOrder(order.id, { restaurantId, paymentType: paymentMethod })
          .catch((err) => console.warn('[EBM] Fiscalization failed:', err));
      }

      setReceipt({
        orderId:       order.id,
        orderNumber:   (order as any).order_number || (order as any).orderNumber || order.id.slice(-6).toUpperCase(),
        lines:         [...cart],
        total:         cartTotal,
        paymentMethod: PAYMENT_METHODS.find((m) => m.code === paymentMethod)?.label || 'Cash',
        cashierName:   cashier?.name || 'Cashier',
        customerName:  customerName || undefined,
        timestamp:     new Date(),
      });

      setCart([]);
      setCustomerName('');
      setShowCart(false);
      loadShiftStats();
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
      paymentMethod: receipt.paymentMethod,
      paymentStatus: 'paid' as const,
    };
    try {
      printReceipt(buildReceiptHtml(receiptData));
    } catch {
      alert('Could not open print window. Please allow pop-ups in your browser.');
    }
  };

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
              <span>{receipt.paymentMethod}</span>
            </div>
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
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex flex-col bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Minimart POS</p>
            <p className="font-semibold text-slate-100 truncate">{restaurantName}</p>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">{cashier?.name}</span>
        {/* Cart toggle (mobile) */}
        <button
          onClick={() => setShowCart(true)}
          className="relative sm:hidden p-2 rounded-lg bg-slate-800 text-slate-300"
        >
          <ShoppingCartIcon className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
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
          <span>My shift today:</span>
          <span className="text-slate-200 font-medium">{shiftSales.count} sale{shiftSales.count !== 1 ? 's' : ''}</span>
          <span className="text-emerald-400 font-semibold">{formatPrice(shiftSales.total)}</span>
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
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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
                    ? 'bg-indigo-600 text-white'
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
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        inCart
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-slate-700 bg-slate-800/60 hover:border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-2xl mb-1.5">{product.emoji || '📦'}</span>
                      <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-snug">{product.name}</p>
                      <p className="text-xs text-indigo-400 font-semibold mt-1">{formatPrice(product.price)}</p>
                      {inCart && (
                        <span className="mt-1.5 text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
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
                <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{cartCount}</span>
              )}
            </div>
            <button
              onClick={() => setShowCart(false)}
              className="sm:hidden p-1 text-slate-400 hover:text-slate-200"
            >
              <XIcon className="w-5 h-5" />
            </button>
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
                  <div key={line.item.id} className="flex items-center gap-2 bg-slate-800 rounded-xl p-2.5">
                    <span className="text-lg">{line.item.emoji || '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{line.item.name}</p>
                      <p className="text-xs text-indigo-400">{formatPrice(line.item.price * line.qty)}</p>
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
                    </div>
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
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />

            {/* Payment method */}
            <div className="flex gap-1.5">
              {PAYMENT_METHODS.map(({ code, label, icon: Icon }) => (
                <button
                  key={code}
                  onClick={() => setPaymentMethod(code)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-xs transition-all ${
                    paymentMethod === code
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between items-center py-2 border-t border-slate-700">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-lg font-bold text-slate-100">{formatPrice(cartTotal)}</span>
            </div>

            {/* Checkout button */}
            <button
              onClick={handleCheckout}
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
  );
}
