import { useEffect, useMemo, useState } from 'react';
import {
  UtensilsIcon,
  Package,
  AlertCircle,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  Globe,
  ShoppingBag,
  CheckCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Order } from '../../types';
import { formatPrice } from '../../utils/currency';
import { formatTime, getRelativeTime } from '../../utils/dateUtils';
import { Button } from '../../components/ui/Button';

interface OnlineOrdersForWaiterProps {
  orders: Order[];
  onUpdateStatus?: (orderId: string, newStatus: 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled') => void;
}

export function OnlineOrdersForWaiter({ orders, onUpdateStatus }: OnlineOrdersForWaiterProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const isOnline = (o: Order) =>
    o.isOnlineOrder === true || (o as any).is_online_order === true ||
    o.tableNumber === 999 || (o as any).table_number === 999;

  const onlineOrders = useMemo(
    () => orders.filter(isOnline),
    [orders]
  );

  // Group by status
  const pendingApprovalOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'pending'),
    [onlineOrders]
  );

  const readyOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'ready'),
    [onlineOrders]
  );

  const preparingOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'preparing'),
    [onlineOrders]
  );

  const statusTheme: Record<string, { panel: string; badge: string; title: string; border: string }> = {
    pending: {
      panel: 'border-red-500/30 bg-red-500/10',
      badge: 'border-red-500/30 bg-red-500/15 text-red-300',
      title: 'text-red-300',
      border: 'border-l-red-400',
    },
    preparing: {
      panel: 'border-amber-500/30 bg-amber-500/10',
      badge: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
      title: 'text-amber-300',
      border: 'border-l-amber-400',
    },
    ready: {
      panel: 'border-emerald-500/30 bg-emerald-500/10',
      badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
      title: 'text-emerald-300',
      border: 'border-l-emerald-400',
    },
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const style = statusTheme[order.status || 'pending'] || statusTheme.pending;
    const customerName = (order as any).customer_name || order.customerName || 'Guest';
    const customerPhone = (order as any).customer_phone || order.customerPhone;
    const customerEmail = (order as any).customer_email || order.customerEmail;
    const customerAddress = (order as any).customer_address || order.customerAddress;
    const createdAt = (order as any).created_at || order.createdAt;
    const total = (order as any).total || order.total || 0;
    const itemCount = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

    const relativeTime = createdAt ? getRelativeTime(createdAt) : 'Unknown';
    const preciseTime = createdAt ? formatTime(createdAt) : '—';

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.28)] ${style.border} border-l-4`}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                Online
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {relativeTime} · {preciseTime}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">
                {order.orderNumber || `#${order.id.slice(-6)}`}
              </h3>
              <p className="text-sm text-slate-400">{itemCount} items in this order</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-right">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Total</div>
              <div className="text-lg font-semibold text-amber-300">{formatPrice(total)}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.9fr)]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                <ShoppingBag className="h-4 w-4 text-amber-300" />
                Items
              </div>
              {order.items && order.items.length > 0 ? (
                <ul className="space-y-2 text-sm text-slate-300">
                  {order.items.slice(0, 4).map((item, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-2 rounded-lg bg-slate-900/70 px-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 text-amber-300">{item.quantity}x</span>
                        {item.menuItemName || item.menuItem?.name || 'Item'}
                      </span>
                      <span className="text-slate-500">{formatPrice(item.totalPrice || 0)}</span>
                    </li>
                  ))}
                  {order.items.length > 4 && (
                    <li className="text-xs text-slate-500">
                      + {order.items.length - 4} more items
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No line items available</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 text-sm font-medium text-slate-200">Customer</div>
              <div className="space-y-2.5 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <span>{customerName}</span>
                </div>
                {customerPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-500" />
                    <span>{customerPhone}</span>
                  </div>
                )}
                {customerEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-500" />
                    <span className="break-all">{customerEmail}</span>
                  </div>
                )}
                {customerAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-slate-500" />
                    <span>{customerAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {order.specialInstructions && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              <span className="mr-2 text-amber-300">Special Instructions:</span>
              <span className="italic">{order.specialInstructions}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-700 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              Live queue time refresh (every minute)
            </div>

            {order.status === 'pending' && (
              <div className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
                Awaiting Supervisor Approval
              </div>
            )}

            {order.status === 'preparing' && (
              <div className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                Kitchen preparing this order
              </div>
            )}

            {order.status === 'ready' && onUpdateStatus && (
              <Button
                onClick={() => onUpdateStatus(order.id, 'served')}
                variant="primary"
                className="px-3 py-1 text-xs justify-center"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Served
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  // Empty state
  if (onlineOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
          <Globe className="h-8 w-8 text-amber-300" />
        </div>
        <p className="text-lg font-semibold text-slate-100">No online orders</p>
        <p className="mt-2 text-sm text-slate-400">
          You're all caught up! Online orders will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.26)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              <Globe className="h-3.5 w-3.5" />
              Waiter Online Queue
            </div>
            <h3 className="text-2xl font-semibold text-slate-50">Pickup-first workflow</h3>
            <p className="mt-1 text-sm text-slate-400">
              Ready orders are listed first, while approval and kitchen progress stay visible in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[380px]">
            <div className={`rounded-xl border p-3 ${statusTheme.ready.panel}`}>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Ready</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{readyOrders.length}</div>
            </div>
            <div className={`rounded-xl border p-3 ${statusTheme.preparing.panel}`}>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Preparing</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{preparingOrders.length}</div>
            </div>
            <div className={`rounded-xl border p-3 ${statusTheme.pending.panel}`}>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Awaiting Approval</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{pendingApprovalOrders.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ready Orders - High Priority */}
      {readyOrders.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/55 p-4">
          <h4 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Ready for Pickup ({readyOrders.length})
          </h4>
          <div className="space-y-2">
            {readyOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      {/* Preparing Orders */}
      {preparingOrders.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/55 p-4">
          <h4 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
            <UtensilsIcon className="w-4 h-4" />
            Being Prepared ({preparingOrders.length})
          </h4>
          <div className="space-y-2">
            {preparingOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      {/* Pending Orders - Awaiting Supervisor Approval */}
      {pendingApprovalOrders.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/55 p-4">
          <h4 className="text-sm font-semibold text-red-300 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Awaiting Supervisor Approval ({pendingApprovalOrders.length})
          </h4>
          <div className="space-y-2">
            {pendingApprovalOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 px-1">
        Last refreshed: {formatTime(new Date())} (auto-updates every minute)
      </div>
    </div>
  );
}
