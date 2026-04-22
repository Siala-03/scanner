import React, { useMemo } from 'react';
import { Package, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Order } from '../../types';
import { formatPrice } from '../../utils/currency';
import { Button } from '../ui/Button';

interface OnlineOrdersPanel {
  orders: Order[];
  onStatusChange?: (orderId: string, newStatus: string) => void;
}

export function OnlineOrdersPanel({ orders, onStatusChange }: OnlineOrdersPanel) {
  // Filter only online orders
  const onlineOrders = useMemo(
    () => orders.filter((order) => order.isOnlineOrder),
    [orders]
  );

  // Group by status - PENDING orders need supervisor APPROVAL
  const pendingApprovalOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'pending'),
    [onlineOrders]
  );

  const verifiedOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'verified'),
    [onlineOrders]
  );

  const preparingOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'preparing'),
    [onlineOrders]
  );

  const readyOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'ready'),
    [onlineOrders]
  );

  const statusCounts = {
    pending: pendingApprovalOrders.length,
    verified: verifiedOrders.length,
    preparing: preparingOrders.length,
    ready: readyOrders.length,
  };

  const OrderCard = ({ order, variant = 'default' }: { order: Order; variant?: string }) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      verified: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      preparing: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      ready: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    };

    const statusBadgeColors: Record<string, string> = {
      pending: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
      verified: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100',
      preparing: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
      ready: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
    };

    return (
      <div
        className={`rounded-lg border p-4 ${statusColors[order.status || 'pending']} ${
          variant === 'compact' ? 'mb-2' : 'mb-3'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                {order.orderNumber}
              </h4>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded ${
                  statusBadgeColors[order.status || 'pending']
                }`}
              >
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">
              👤 {order.customerName || 'Guest'}
            </p>

            {order.items && order.items.length > 0 && (
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                <p className="font-medium">Items ({order.items.length}):</p>
                <ul className="text-xs mt-1 space-y-0.5">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <li key={idx}>
                      • {item.quantity}x {item.menuItemName || 'Item'}
                    </li>
                  ))}
                  {order.items.length > 3 && (
                    <li className="text-slate-500 dark:text-slate-500">
                      + {order.items.length - 3} more items
                    </li>
                  )}
                </ul>
              </div>
            )}

            {order.specialInstructions && (
              <div className="text-xs text-slate-600 dark:text-slate-400 italic">
                📝 "{order.specialInstructions}"
              </div>
            )}

            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-current border-opacity-20">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatPrice(order.total || 0)}
              </span>
              {order.customerEmail && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  📧 {order.customerEmail}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            {order.status === 'pending' && onStatusChange && (
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={() => onStatusChange(order.id, 'verified')}
                  variant="primary"
                  className="flex-1 px-2 py-1 text-xs"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Approve
                </Button>
                <Button
                  onClick={() => onStatusChange(order.id, 'cancelled')}
                  variant="danger"
                  className="flex-1 px-2 py-1 text-xs"
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Empty state
  if (onlineOrders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-800/50 text-center">
        <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-slate-600 dark:text-slate-400">No online orders yet</p>
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
          Share your QR code to start receiving online orders
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Summary - 4 columns */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-center">
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">
            {statusCounts.pending}
          </div>
          <div className="text-xs text-red-600 dark:text-red-300 font-medium">
            Awaiting Approval
          </div>
        </div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
            {statusCounts.verified}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-300 font-medium">
            Approved
          </div>
        </div>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {statusCounts.preparing}
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-300 font-medium">
            Preparing
          </div>
        </div>
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-center">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">
            {statusCounts.ready}
          </div>
          <div className="text-xs text-green-600 dark:text-green-300 font-medium">
            Ready
          </div>
        </div>
      </div>

      {/* Orders by Status */}
      {pendingApprovalOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            ⚠️ Awaiting Supervisor Approval ({pendingApprovalOrders.length})
          </h4>
          <div className="space-y-2">
            {pendingApprovalOrders.map((order) => (
              <OrderCard key={order.id} order={order} variant="compact" />
            ))}
          </div>
        </div>
      )}

      {verifiedOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            ✅ Approved - Sent to Kitchen ({verifiedOrders.length})
          </h4>
          <div className="space-y-2">
            {verifiedOrders.map((order) => (
              <OrderCard key={order.id} order={order} variant="compact" />
            ))}
          </div>
        </div>
      )}

      {preparingOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            👨‍🍳 Being Prepared ({preparingOrders.length})
          </h4>
          <div className="space-y-2">
            {preparingOrders.map((order) => (
              <OrderCard key={order.id} order={order} variant="compact" />
            ))}
          </div>
        </div>
      )}

      {readyOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
            🎯 Ready for Pickup ({readyOrders.length})
          </h4>
          <div className="space-y-2">
            {readyOrders.map((order) => (
              <OrderCard key={order.id} order={order} variant="compact" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
