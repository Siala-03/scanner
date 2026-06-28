import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircleIcon, ClockIcon, BanknoteIcon, CreditCardIcon,
  SmartphoneIcon, RefreshCwIcon, UserIcon, PlusIcon, XIcon,
  WifiOffIcon, CircleEllipsisIcon,
} from 'lucide-react';
import { fetchOrders, confirmPayment, fetchOrderCancellationRequests, requestOrderCancellation } from '../../api/orders';
import { VoidReasonModal } from '../shared/VoidReasonModal';
import { fiscalizeOrder } from '../../api/ebm';
import { formatPrice } from '../../utils/currency';
import { supabase } from '../../lib/supabase';
import { enqueuePayment } from '../../lib/orderQueue';
import { flushPendingPayments } from '../../utils/offlineSync';
import { OfflineBanner } from '../ui/OfflineBanner';
import { orderToReceiptData, buildReceiptHtml, printReceipt } from '../../utils/receipt';
import { PrinterIcon } from 'lucide-react';

interface Order {
  id: string;
  orderNumber?: string;
  order_number?: string;
  tableNumber?: number;
  table_number?: number;
  customerName?: string;
  customer_name?: string;
  items?: any[];
  total: number;
  status: string;
  paymentStatus?: string;
  payment_status?: string;
  createdAt?: string | Date;
  created_at?: string;
  assigned_waiter_id?: string;
  assignedWaiterId?: string;
}

const PAYMENT_METHODS = [
  { code: '01', label: 'Cash',  icon: BanknoteIcon  },
  { code: '02', label: 'Card',  icon: CreditCardIcon },
  { code: '04', label: 'MoMo',  icon: SmartphoneIcon },
  { code: '99', label: 'Other', icon: CircleEllipsisIcon },
];

interface SplitEntry {
  code: string;
  label: string;
  amount: string; // user-typed string; '' means "fill remainder"
  momoRef: string;
}

function defaultSplits(): SplitEntry[] {
  return [{ code: '01', label: 'Cash', amount: '', momoRef: '' }];
}

function getSplits(map: Record<string, SplitEntry[]>, orderId: string): SplitEntry[] {
  return map[orderId] ?? defaultSplits();
}

/** Sum of all entered amounts (treating '' as 0 for in-progress entry). */
function enteredTotal(splits: SplitEntry[]): number {
  return splits.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
}

/**
 * Resolve effective amounts: single split gets the full total;
 * in multi-split the last entry auto-fills the remainder.
 */
function resolveAmounts(splits: SplitEntry[], total: number): Array<SplitEntry & { effectiveAmount: number }> {
  if (splits.length === 1) {
    return [{ ...splits[0], effectiveAmount: total }];
  }
  const nonLastSum = splits.slice(0, -1).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const remainder = Math.max(0, total - nonLastSum);
  return splits.map((s, i) => ({
    ...s,
    effectiveAmount: i === splits.length - 1 ? remainder : (parseFloat(s.amount) || 0),
  }));
}

/** True when amounts are valid for the given order total. */
function splitsValid(splits: SplitEntry[], total: number): boolean {
  if (splits.length === 1) return true;
  const resolved = resolveAmounts(splits, total);
  return resolved.every((s) => s.effectiveAmount > 0);
}

/** Build a human-readable note for the split, e.g. "Cash: 5000, MoMo: 3000 (ref: 123456)" */
function buildNote(splits: SplitEntry[], orderTotal: number): string | undefined {
  const resolved = resolveAmounts(splits, orderTotal);
  if (resolved.length <= 1 && !resolved[0]?.momoRef) return undefined;
  return resolved.map((s) => {
    const ref = s.momoRef ? ` (ref: ${s.momoRef})` : '';
    return `${s.label}: ${formatPrice(s.effectiveAmount)}${ref}`;
  }).join(' + ');
}

interface PaymentApprovalPanelProps {
  restaurantId?: string;
  restaurantName?: string;
  restaurantInfo?: { address?: string; phone?: string; email?: string; logo?: string; city?: string; country?: string; momoCode?: string };
  staffId?: string;
  staffName?: string;
}

const CACHE_KEY = 'supervisor_pending_orders_cache';

export function PaymentApprovalPanel({ restaurantId, restaurantName, restaurantInfo, staffId, staffName }: PaymentApprovalPanelProps) {
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [staffMap,     setStaffMap]     = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(true);
  const [confirming,   setConfirming]   = useState<string | null>(null);
  const [cancelling,   setCancelling]   = useState<string | null>(null);
  const [pendingCancelRequests, setPendingCancelRequests] = useState<Set<string>>(new Set());
  const [voidTarget,   setVoidTarget]   = useState<Order | null>(null);
  const [splitsMap,    setSplitsMap]    = useState<Record<string, SplitEntry[]>>({});
  const [justConfirmed, setJustConfirmed] = useState<Set<string>>(new Set());
  const [justQueued,   setJustQueued]   = useState<Set<string>>(new Set());
  const [isOnline,     setIsOnline]     = useState(() => navigator.onLine);
  const ordersRef = useRef<Order[]>([]); // keeps last-known list for offline fallback

  const loadPendingOrders = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [all, cancellationRequests] = await Promise.all([
        fetchOrders('all', restaurantId),
        fetchOrderCancellationRequests('pending', restaurantId),
      ]);
      const pending = (all as any[]).filter((o) => {
        const ps = o.paymentStatus ?? o.payment_status;
        const st = o.status;
        return ps !== 'confirmed' && ps !== 'paid' && st !== 'cancelled' && st !== 'completed';
      });
      // Cache to localStorage so the panel can show stale data when offline
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(pending)); } catch { /* ignore */ }
      ordersRef.current = pending;
      setOrders(pending);
      setPendingCancelRequests(new Set(cancellationRequests.map((r) => r.order_id)));
    } catch (err) {
      console.error('Failed to load pending orders:', err);
      // Offline or network error — restore from localStorage cache
      if (ordersRef.current.length === 0) {
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as Order[];
            ordersRef.current = parsed;
            setOrders(parsed);
          }
        } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from('staff')
      .select('id, name')
      .eq('restaurant_id', restaurantId)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((s: any) => { map[s.id] = s.name; });
          setStaffMap(map);
        }
      });
  }, [restaurantId]);

  useEffect(() => {
    loadPendingOrders();
    const poll = setInterval(loadPendingOrders, 10_000);

    const onOnline = () => {
      setIsOnline(true);
      loadPendingOrders();
      // Flush any payments that were queued while offline
      void flushPendingPayments(
        (orderId) => {
          // Remove from list once confirmed on server
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
          ordersRef.current = ordersRef.current.filter((o) => o.id !== orderId);
        },
        (_orderId, reason) => console.error('[PaymentQueue] Sync failed:', reason)
      );
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (!restaurantId) {
      return () => {
        clearInterval(poll);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    const channel = supabase
      .channel(`payment-approval-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        loadPendingOrders();
      })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [restaurantId, loadPendingOrders]);

  // ── Cancel ─────────────────────────────────────────────────────────────────

  const handleCancel = (order: Order) => {
    setVoidTarget(order);
  };

  const handleVoidConfirmed = async (reason: string) => {
    const order = voidTarget;
    if (!order) return;
    setVoidTarget(null);
    setCancelling(order.id);
    try {
      await requestOrderCancellation(order.id, {
        reason,
        requestedBy: staffId,
        requestedByName: staffName,
      });
      setPendingCancelRequests((prev) => new Set(prev).add(order.id));
    } catch (err) {
      console.error('Failed to send cancellation request:', err);
      alert('Failed to send cancellation request. Please try again.');
    } finally {
      setCancelling(null);
    }
  };

  const handlePrintFullBill = (order: Order) => {
    try {
      const receiptData = orderToReceiptData(order as any, {
        restaurantName: restaurantName || 'Company',
        restaurantAddress: restaurantInfo?.address || '',
        restaurantPhone: restaurantInfo?.phone || '',
        restaurantEmail: restaurantInfo?.email || '',
        restaurantLogo: restaurantInfo?.logo,
        restaurantCity: restaurantInfo?.city,
        restaurantCountry: restaurantInfo?.country,
        restaurantMomoCode: restaurantInfo?.momoCode,
        taxRate: 0,
        serverName: staffName,
        orderType: 'dine-in',
        notes: `Full bill — ${(order.items || []).length} items`,
      });
      printReceipt(buildReceiptHtml(receiptData));
    } catch {
      alert('Could not open print window. Please allow pop-ups.');
    }
  };

  // ── Split helpers ────────────────────────────────────────────────────────

  const patchSplits = (orderId: string, fn: (prev: SplitEntry[]) => SplitEntry[]) => {
    setSplitsMap((prev) => ({ ...prev, [orderId]: fn(getSplits(prev, orderId)) }));
  };

  const toggleMethod = (orderId: string, code: string, label: string) => {
    patchSplits(orderId, (prev) => {
      const exists = prev.find((s) => s.code === code);
      if (exists) {
        // Don't allow removing the last method
        if (prev.length === 1) return prev;
        return prev.filter((s) => s.code !== code);
      }
      return [...prev, { code, label, amount: '', momoRef: '' }];
    });
  };

  const setAmount = (orderId: string, code: string, amount: string) => {
    patchSplits(orderId, (prev) =>
      prev.map((s) => s.code === code ? { ...s, amount } : s)
    );
  };

  const setMomoRef = (orderId: string, code: string, momoRef: string) => {
    patchSplits(orderId, (prev) =>
      prev.map((s) => s.code === code ? { ...s, momoRef } : s)
    );
  };

  // ── Confirm ──────────────────────────────────────────────────────────────

  const handleConfirm = async (order: Order) => {
    const splits = getSplits(splitsMap, order.id);
    const resolved = resolveAmounts(splits, order.total);
    const primary = resolved.reduce((a, b) => a.effectiveAmount >= b.effectiveAmount ? a : b);
    const note = buildNote(splits, order.total);
    const paymentBreakdown = resolved
      .filter((s) => s.effectiveAmount > 0)
      .map((s) => ({
        method: s.label,
        amount: s.effectiveAmount,
        ...(s.momoRef ? { reference: s.momoRef } : {}),
      }));
    const paymentData = {
      paymentType:     primary.code,
      paymentBreakdown,
      confirmedBy:     staffId,
      confirmedByName: staffName,
      restaurantId,
      note,
    };

    // ── Offline path ──────────────────────────────────────────────────────
    if (!isOnline) {
      try {
        const sessionRes = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        await enqueuePayment({
          idempotencyKey: `payment-${order.id}`,
          orderId: order.id,
          paymentData: paymentData as Record<string, unknown>,
          status: 'pending',
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
          supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          authToken: sessionRes.data.session?.access_token ?? null,
          refreshToken: sessionRes.data.session?.refresh_token ?? null,
        });
      } catch (err) {
        console.error('[PaymentQueue] Failed to enqueue:', err);
      }
      setJustQueued((prev) => new Set(prev).add(order.id));
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        ordersRef.current = ordersRef.current.filter((o) => o.id !== order.id);
        setJustQueued((prev) => { const s = new Set(prev); s.delete(order.id); return s; });
      }, 1800);
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────
    setConfirming(order.id);
    try {
      await confirmPayment(order.id, paymentData);

      // EBM fiscalization disabled — CORS issues with backend routing
      // if (restaurantId) {
      //   fiscalizeOrder(order.id, { restaurantId, paymentType: primary.code })
      //     .catch((err) => console.warn('[EBM] Fiscalization skipped:', err));
      // }

      setJustConfirmed((prev) => new Set(prev).add(order.id));
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        ordersRef.current = ordersRef.current.filter((o) => o.id !== order.id);
        setJustConfirmed((prev) => { const s = new Set(prev); s.delete(order.id); return s; });
      }, 1200);
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      alert('Failed to confirm payment. Please try again.');
    } finally {
      setConfirming(null);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const getOrderLabel = (order: Order) => {
    const num = order.orderNumber ?? order.order_number ?? order.id.slice(-6).toUpperCase();
    const table = order.tableNumber ?? order.table_number;
    return table ? `#${num} — Table ${table}` : `#${num}`;
  };

  const getWaiterName = (order: Order) => {
    const wid = order.assigned_waiter_id ?? order.assignedWaiterId;
    return wid ? (staffMap[wid] || null) : null;
  };

  const statusColor: Record<string, string> = {
    pending:  'bg-amber-500/15 text-amber-300 border-amber-500/25',
    preparing:'bg-orange-500/15 text-orange-300 border-orange-500/25',
    ready:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    served:   'bg-sky-500/15 text-sky-300 border-sky-500/25',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" />
        Loading orders…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OfflineBanner />

      {/* Offline notice specific to payments */}
      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <WifiOffIcon className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            You're offline. Payments confirmed now will be <strong>queued</strong> and synced
            automatically when the connection is restored.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Pending Payment Approval</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {orders.length === 0
              ? 'No orders awaiting payment'
              : `${orders.length} order${orders.length !== 1 ? 's' : ''} awaiting confirmation`}
          </p>
        </div>
        <button
          onClick={loadPendingOrders}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-700"
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 bg-slate-800/40 rounded-xl border border-slate-700">
          <CheckCircleIcon className="w-10 h-10 mb-2 text-emerald-500/50" />
          <p className="text-sm">All caught up — no unpaid orders</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const confirmed = justConfirmed.has(order.id);
            const queued    = justQueued.has(order.id);
            const busy      = confirming === order.id;
            const waiterName = getWaiterName(order);
            const splits    = getSplits(splitsMap, order.id);
            const isMulti   = splits.length > 1;
            const allocated = enteredTotal(splits);
            const remaining = order.total - allocated;
            const valid     = splitsValid(splits, order.total);
            const momoEntry = splits.find((s) => s.code === '04');
            const momoRefMissing = !!momoEntry && !momoEntry.momoRef.trim();
            const canConfirm = valid && !momoRefMissing;
            const cancellationRequested = pendingCancelRequests.has(order.id);

            return (
              <div
                key={order.id}
                className={`rounded-xl border p-4 transition-all duration-300 ${
                  confirmed
                    ? 'border-emerald-500/40 bg-emerald-900/20'
                    : queued
                    ? 'border-amber-500/40 bg-amber-900/10'
                    : 'border-slate-700 bg-slate-800/60'
                }`}
              >
                {/* Order header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">{getOrderLabel(order)}</p>
                    {(order.customerName || order.customer_name) && (
                      <p className="text-xs text-slate-400 mt-0.5">{order.customerName ?? order.customer_name}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor[order.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {order.status}
                  </span>
                </div>

                {waiterName && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400">
                    <UserIcon className="w-3 h-3 text-slate-500" />
                    <span>Served by <span className="text-slate-300 font-medium">{waiterName}</span></span>
                  </div>
                )}

                {order.items && order.items.length > 0 && (
                  <div className="mb-3 space-y-0.5">
                    {order.items.slice(0, 3).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs text-slate-400">
                        <span className="truncate mr-2">{item.menuItemName ?? item.menu_item_name ?? 'Item'} ×{item.quantity}</span>
                        <span className="shrink-0">{formatPrice(item.totalPrice ?? item.total_price ?? 0)}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-slate-500">+{order.items.length - 3} more</p>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center mb-3 pt-2 border-t border-slate-700">
                  <span className="text-xs text-slate-400">Total</span>
                  <span className="font-bold text-slate-100">{formatPrice(order.total)}</span>
                </div>

                {/* ── Payment method toggles ── */}
                <div className="flex gap-1.5 mb-3">
                  {PAYMENT_METHODS.map(({ code, label, icon: Icon }) => {
                    const active = splits.some((s) => s.code === code);
                    return (
                      <button
                        key={code}
                        onClick={() => toggleMethod(order.id, code, label)}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-xs transition-all ${
                          active
                            ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                            : 'border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                        {active && splits.length > 1 && (
                          <XIcon className="w-2.5 h-2.5 opacity-60" />
                        )}
                        {!active && (
                          <PlusIcon className="w-2.5 h-2.5 opacity-40" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* ── Per-method amount + ref fields ── */}
                <div className="space-y-2 mb-3">
                  {splits.map((entry, idx) => {
                    const isLast = idx === splits.length - 1;
                    // Last entry in multi-split auto-fills remainder
                    const autoAmount = isMulti && isLast
                      ? remaining + (parseFloat(entry.amount) || 0)
                      : null;

                    return (
                      <div key={entry.code} className="space-y-1.5">
                        {isMulti && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 w-12 shrink-0">{entry.label}</span>
                            {isLast ? (
                              <div className="flex-1 px-3 py-1.5 bg-slate-700/40 border border-slate-700 rounded-lg text-xs text-slate-300 font-medium">
                                {formatPrice(Math.max(0, autoAmount ?? 0))}
                                <span className="text-slate-500 ml-1">(remainder)</span>
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={entry.amount}
                                onChange={(e) => setAmount(order.id, entry.code, e.target.value)}
                                placeholder="Amount"
                                className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                              />
                            )}
                          </div>
                        )}

                        {entry.code === '04' && (
                          <div className={isMulti ? 'pl-14' : ''}>
                            <input
                              type="text"
                              value={entry.momoRef}
                              onChange={(e) => setMomoRef(order.id, entry.code, e.target.value)}
                              placeholder="MoMo Ref / Transaction ID (required)"
                              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Running total when split */}
                  {isMulti && (
                    <div className={`flex justify-between text-xs pt-1 ${
                      valid ? 'text-emerald-400' : remaining > 0 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      <span>{valid ? 'Balanced' : remaining > 0 ? `Remaining: ${formatPrice(remaining)}` : `Over by: ${formatPrice(-remaining)}`}</span>
                      <span>{formatPrice(allocated)} / {formatPrice(order.total)}</span>
                    </div>
                  )}

                  {/* Single-method note field */}
                  {!isMulti && splits[0]?.code !== '04' && (
                    <input
                      type="text"
                      value={splits[0]?.momoRef || ''}
                      onChange={(e) => setMomoRef(order.id, splits[0].code, e.target.value)}
                      placeholder="Note (optional)"
                      className="w-full bg-slate-700/50 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500"
                    />
                  )}
                </div>

                {/* Confirm button */}
                {confirmed ? (
                  <div className="flex flex-col items-center gap-0.5 py-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                      <CheckCircleIcon className="w-4 h-4" />
                      Payment Confirmed
                    </div>
                    {staffName && <p className="text-xs text-slate-500">by {staffName}</p>}
                  </div>
                ) : queued ? (
                  <div className="flex flex-col items-center gap-0.5 py-2">
                    <div className="flex items-center gap-1.5 text-amber-400 text-sm">
                      <WifiOffIcon className="w-4 h-4" />
                      Queued — will sync when online
                    </div>
                    <p className="text-xs text-slate-500">Payment recorded offline</p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handlePrintFullBill(order)}
                      className="w-full py-2 mb-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" /> Print Full Bill
                    </button>
                    <button
                      onClick={() => handleConfirm(order)}
                      disabled={busy || cancelling === order.id || !canConfirm}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        <><RefreshCwIcon className="w-3.5 h-3.5 animate-spin" /> Confirming…</>
                      ) : (
                        <><CheckCircleIcon className="w-3.5 h-3.5" /> Confirm Payment</>
                      )}
                    </button>
                    {momoRefMissing && valid && (
                      <p className="text-xs text-amber-400 text-center mt-1">Enter MoMo transaction ref above to confirm</p>
                    )}
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={busy || cancelling === order.id || cancellationRequested}
                      className="w-full mt-2 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      {cancelling === order.id ? (
                        <><RefreshCwIcon className="w-3 h-3 animate-spin" /> Sending Request…</>
                      ) : cancellationRequested ? (
                        <><ClockIcon className="w-3 h-3" /> Awaiting Manager Approval</>
                      ) : (
                        <><XIcon className="w-3 h-3" /> Request Cancellation</>
                      )}
                    </button>
                  </>
                )}

                <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                  <ClockIcon className="w-3 h-3" />
                  {new Date(order.createdAt ?? order.created_at ?? '').toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {voidTarget && (
        <VoidReasonModal
          orderLabel={getOrderLabel(voidTarget)}
          isSubmitting={cancelling === voidTarget.id}
          onConfirm={handleVoidConfirmed}
          onCancel={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
}
