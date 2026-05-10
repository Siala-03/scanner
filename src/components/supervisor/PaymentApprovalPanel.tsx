import { useState, useEffect, useCallback } from 'react';
import { CheckCircleIcon, ClockIcon, BanknoteIcon, CreditCardIcon, SmartphoneIcon, RefreshCwIcon, UserIcon } from 'lucide-react';
import { fetchOrders, confirmPayment } from '../../api/orders';
import { fiscalizeOrder } from '../../api/ebm';
import { formatPrice } from '../../utils/currency';
import { supabase } from '../../lib/supabase';

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
  { code: '01', label: 'Cash', icon: BanknoteIcon },
  { code: '02', label: 'Card', icon: CreditCardIcon },
  { code: '04', label: 'MoMo', icon: SmartphoneIcon },
];

interface PaymentApprovalPanelProps {
  restaurantId?: string;
  staffId?: string;
  staffName?: string;
}

export function PaymentApprovalPanel({ restaurantId, staffId, staffName }: PaymentApprovalPanelProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [justConfirmed, setJustConfirmed] = useState<Set<string>>(new Set());

  const loadPendingOrders = useCallback(async () => {
    try {
      const all = await fetchOrders('all', restaurantId);
      const pending = (all as any[]).filter((o) => {
        const ps = o.paymentStatus ?? o.payment_status;
        const st = o.status;
        const unpaid = ps == null || ps === '' || ps === 'unpaid' || ps === 'pending' || ps === 'paid';
        return unpaid && st !== 'cancelled' && st !== 'completed';
      });
      setOrders(pending);
    } catch (err) {
      console.error('Failed to load pending orders:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Load staff names once for waiter lookup
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

    if (!restaurantId) return;
    const channel = supabase
      .channel(`payment-approval-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        loadPendingOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, loadPendingOrders]);

  const handleConfirm = async (orderId: string) => {
    const paymentType = selectedMethod[orderId] || '01';
    const note = notes[orderId]?.trim() || undefined;
    setConfirming(orderId);
    try {
      await confirmPayment(orderId, {
        paymentType,
        confirmedBy: staffId,
        confirmedByName: staffName,
        restaurantId,
        note,
      });

      if (restaurantId) {
        fiscalizeOrder(orderId, { restaurantId, paymentType })
          .catch((err) => console.warn('[EBM] Fiscalization skipped:', err));
      }

      setJustConfirmed((prev) => new Set(prev).add(orderId));
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setJustConfirmed((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
      }, 1200);
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      alert('Failed to confirm payment. Please try again.');
    } finally {
      setConfirming(null);
    }
  };

  const getOrderLabel = (order: Order) => {
    const num = order.orderNumber ?? order.order_number ?? order.id.slice(-6).toUpperCase();
    const table = order.tableNumber ?? order.table_number;
    return table ? `#${num} — Table ${table}` : `#${num}`;
  };

  const getWaiterName = (order: Order) => {
    const wid = order.assigned_waiter_id ?? order.assignedWaiterId;
    if (!wid) return null;
    return staffMap[wid] || null;
  };

  const getStatus = (order: Order) => order.status;

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    preparing: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
    ready: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    served: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Pending Payment Approval</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {orders.length === 0 ? 'No orders awaiting payment' : `${orders.length} order${orders.length !== 1 ? 's' : ''} awaiting confirmation`}
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
            const busy = confirming === order.id;
            const waiterName = getWaiterName(order);
            const method = selectedMethod[order.id] ?? '01';
            const isMomo = method === '04';

            return (
              <div
                key={order.id}
                className={`rounded-xl border p-4 transition-all duration-300 ${
                  confirmed
                    ? 'border-emerald-500/40 bg-emerald-900/20'
                    : 'border-slate-700 bg-slate-800/60'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">{getOrderLabel(order)}</p>
                    {(order.customerName || order.customer_name) && (
                      <p className="text-xs text-slate-400 mt-0.5">{order.customerName ?? order.customer_name}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor[getStatus(order)] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {getStatus(order)}
                  </span>
                </div>

                {/* Waiter */}
                {waiterName && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400">
                    <UserIcon className="w-3 h-3 text-slate-500" />
                    <span>Served by <span className="text-slate-300 font-medium">{waiterName}</span></span>
                  </div>
                )}

                {/* Items summary */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-3 space-y-0.5">
                    {order.items.slice(0, 3).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs text-slate-400">
                        <span className="truncate mr-2">{item.menuItemName ?? item.menu_item_name ?? 'Item'} ×{item.quantity}</span>
                        <span className="shrink-0">{formatPrice(item.totalPrice ?? item.total_price ?? 0)}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-slate-500">+{order.items.length - 3} more item{order.items.length - 3 !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center mb-3 pt-2 border-t border-slate-700">
                  <span className="text-xs text-slate-400">Total</span>
                  <span className="font-bold text-slate-100">{formatPrice(order.total)}</span>
                </div>

                {/* Payment method selector */}
                <div className="flex gap-1.5 mb-2">
                  {PAYMENT_METHODS.map(({ code, label, icon: Icon }) => (
                    <button
                      key={code}
                      onClick={() => setSelectedMethod((prev) => ({ ...prev, [order.id]: code }))}
                      className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-xs transition-all ${
                        method === code
                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                          : 'border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Note field — always visible for MoMo, optional for others */}
                {isMomo ? (
                  <div className="mb-3">
                    <label className="block text-xs text-slate-400 mb-1">MoMo Ref / Transaction ID <span className="text-slate-500">(required)</span></label>
                    <input
                      type="text"
                      value={notes[order.id] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                      placeholder="e.g. 1234567890"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ) : (
                  <div className="mb-3">
                    <input
                      type="text"
                      value={notes[order.id] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                      placeholder="Note (optional)"
                      className="w-full bg-slate-700/50 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                )}

                {/* Confirm button */}
                {confirmed ? (
                  <div className="flex flex-col items-center gap-0.5 py-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                      <CheckCircleIcon className="w-4 h-4" />
                      Payment Confirmed
                    </div>
                    {staffName && <p className="text-xs text-slate-500">by {staffName}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => handleConfirm(order.id)}
                    disabled={busy || (isMomo && !notes[order.id]?.trim())}
                    className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <>
                        <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                        Confirming…
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        Confirm Payment
                      </>
                    )}
                  </button>
                )}

                {/* Time */}
                <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                  <ClockIcon className="w-3 h-3" />
                  {new Date(order.createdAt ?? order.created_at ?? '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
