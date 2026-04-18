import React, { useEffect, useMemo, useState } from 'react';
import { ClockIcon, ReceiptIcon } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { OrderTracker } from '../../components/customer/OrderTracker';
import { ServiceReviewModal } from '../../components/customer/ServiceReviewModal';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatPrice } from '../../utils/currency';
import { hasReviewForOrder } from '../../utils/reviewsStorage';
import {
  closeExpiredTableSessions,
  getActiveTableSession,
  isOrderInTableSession,
  type TableServiceSession,
} from '../../utils/tableSessions';
interface OrderStatusPageProps {
  orders: Order[];
  tableNumber: number;
}
export function OrderStatusPage({ orders, tableNumber }: OrderStatusPageProps) {
  const REVIEW_WINDOW_MS = 2 * 60 * 60 * 1000;

  const tableOrders = orders.filter(
    (order) => order.tableNumber === tableNumber
  );

  const [activeSession, setActiveSession] = useState<TableServiceSession | null>(null);

  useEffect(() => {
    const refreshSession = () => {
      closeExpiredTableSessions(tableNumber)
        .then(() => getActiveTableSession(tableNumber))
        .then((session) => setActiveSession(session))
        .catch(() => setActiveSession(null));
    };

    refreshSession();
    const intervalId = window.setInterval(refreshSession, 30_000);
    window.addEventListener('tableSessionsUpdated', refreshSession);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('tableSessionsUpdated', refreshSession);
    };
  }, [tableNumber]);

  const scopedOrders = useMemo(() => {
    if (!activeSession) {
      // Fallback for legacy data: keep only active orders to avoid exposing old guests.
      return tableOrders.filter((order) => ['pending', 'verified', 'preparing', 'ready'].includes(order.status));
    }

    return tableOrders.filter((order) => isOrderInTableSession(order, activeSession));
  }, [tableOrders, activeSession]);

  const activeOrder = scopedOrders.find((order) =>
    ['pending', 'verified', 'preparing', 'ready'].includes(order.status)
  );

  const latestServedOrder = scopedOrders
    .filter((order) => order.status === 'served')
    .sort((a, b) => new Date(b.servedAt ?? b.updatedAt ?? b.createdAt).getTime() - new Date(a.servedAt ?? a.updatedAt ?? a.createdAt).getTime())[0] || null;

  const latestServedTime = latestServedOrder
    ? new Date(latestServedOrder.servedAt ?? latestServedOrder.updatedAt ?? latestServedOrder.createdAt).getTime()
    : null;

  const canRateLatestServed =
    !!latestServedOrder &&
    latestServedTime != null &&
    !Number.isNaN(latestServedTime) &&
    Date.now() - latestServedTime <= REVIEW_WINDOW_MS &&
    !hasReviewForOrder(latestServedOrder.id);

  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);

  if (scopedOrders.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <EmptyState
          icon={<ReceiptIcon className="w-10 h-10" />}
          title="No orders yet"
          description="Place an order from the menu to track its status here." />

      </div>);

  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Order Status</h1>
            <p className="text-sm text-slate-500 mt-1">Track your order in real-time</p>
          </div>
          <span className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full text-sm font-semibold shadow-md shadow-amber-500/25">
            Table {tableNumber}
          </span>
        </div>

        {/* Active order */}
        {activeOrder &&
        <div className="mb-8">
            <h2 className="font-semibold text-slate-700 mb-3">Current Order</h2>
            <OrderTracker
            status={activeOrder.status}
            createdAt={typeof activeOrder.createdAt === 'string' ? new Date(activeOrder.createdAt) : activeOrder.createdAt}
            estimatedWaitTime={20} />


            {/* Order details */}
            <Card className="mt-4 bg-white">
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium text-slate-900">
                  {activeOrder.id}
                </span>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ClockIcon className="w-4 h-4" />
                  {new Date(activeOrder.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {activeOrder.items.map((item, index) =>
              <div key={index} className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      {item.quantity}x {item.menuItem.name}
                    </span>
                    <span className="text-slate-900 font-medium">
                      {formatPrice(item.menuItem.price * item.quantity)}
                    </span>
                  </div>
              )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-bold text-amber-600">
                  {formatPrice(activeOrder.total)}
                </span>
              </div>
            </Card>
          </div>
        }

        {/* Latest served order in this table session */}
        {latestServedOrder &&
        <div>
            <h2 className="font-semibold text-slate-700 mb-3">Service Feedback</h2>
            <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-medium text-slate-900">Latest served order</span>
                  <p className="text-sm text-slate-500">
                    {new Date(latestServedOrder.servedAt ?? latestServedOrder.updatedAt ?? latestServedOrder.createdAt).toLocaleDateString()} at{' '}
                    {new Date(latestServedOrder.servedAt ?? latestServedOrder.updatedAt ?? latestServedOrder.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="font-semibold text-slate-900">{formatPrice(latestServedOrder.total)}</p>
                </div>
              </div>

              {canRateLatestServed ? (
                <button
                  type="button"
                  onClick={() => setReviewingOrder(latestServedOrder)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold shadow-md shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 transition-all"
                >
                  Rate service
                </button>
              ) : (
                <p className="text-sm text-slate-500">
                  {hasReviewForOrder(latestServedOrder.id)
                    ? 'Thanks! You already rated this service session.'
                    : 'Review window has expired for this session.'}
                </p>
              )}
            </Card>
          </div>
        }
      </div>
      <ServiceReviewModal
        order={reviewingOrder}
        isOpen={!!reviewingOrder}
        onClose={() => setReviewingOrder(null)}
      />
    </div>);

}