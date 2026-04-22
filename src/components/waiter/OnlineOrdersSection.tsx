import React, { useMemo } from 'react';
import { UtensilsIcon, Package, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Order } from '../../types';
import { formatPrice } from '../../utils/currency';
import { Button } from '../../components/ui/Button';

interface OnlineOrdersForWaiterProps {
  orders: Order[];
  onUpdateStatus?: (orderId: string, newStatus: 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled') => void;
}

export function OnlineOrdersForWaiter({ orders, onUpdateStatus }: OnlineOrdersForWaiterProps) {
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

  const OrderCard = ({ order }: { order: Order }) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      preparing: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      ready: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    };

    const statusBadgeColors: Record<string, string> = {
      pending: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
      preparing: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
      ready: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-lg border p-4 ${statusColors[order.status || 'pending']}`}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                  {order.orderNumber}
                </h3>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    statusBadgeColors[order.status || 'pending']
                  }`}
                >
                  {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                👤 {order.customerName || 'Guest Order'}
              </p>
            </div>
          </div>

          {/* Items */}
          {order.items && order.items.length > 0 && (
            <div className="bg-white dark:bg-slate-700/50 rounded p-3 space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    {item.quantity}x {item.menuItemName}
                  </span>
                  {item.totalPrice && (
                    <span className="text-slate-600 dark:text-slate-400">
                      {formatPrice(item.totalPrice)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Special Instructions */}
          {order.specialInstructions && (
            <div className="rounded bg-white dark:bg-slate-700/50 p-3 text-sm">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Special Instructions:
              </p>
              <p className="text-slate-700 dark:text-slate-300 italic">
                "{order.specialInstructions}"
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-current border-opacity-20">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatPrice(order.total || 0)}
              </p>
              {order.customerEmail && (
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  {order.customerEmail}
                </p>
              )}
            </div>

            {/* Status Indicators */}
            {order.status === 'pending' && (
              <div className="text-xs font-medium text-red-600 dark:text-red-400">
                ⏳ Awaiting Supervisor Approval
              </div>
            )}

            {order.status === 'ready' && onUpdateStatus && (
              <Button
                onClick={() => onUpdateStatus(order.id, 'served')}
                variant="primary"
                className="px-3 py-1 text-xs"
              >
                Mark Served ✓
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
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-800/50 text-center">
        <UtensilsIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-slate-600 dark:text-slate-400 font-medium">No online orders</p>
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
          You're all caught up! Online orders will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Ready Orders - High Priority */}
      {readyOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
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
        <div>
          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
            🍳 Being Prepared ({preparingOrders.length})
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
        <div>
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            ⏳ Awaiting Supervisor Approval ({pendingApprovalOrders.length})
          </h4>
          <div className="space-y-2">
            {pendingApprovalOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
