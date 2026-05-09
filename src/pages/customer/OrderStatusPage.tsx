import React, { useEffect, useMemo, useState } from 'react';
import { ClockIcon, ReceiptIcon, StarIcon, MessageSquareIcon } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { OrderTracker } from '../../components/customer/OrderTracker';
import { ServiceReviewModal } from '../../components/customer/ServiceReviewModal';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { formatPrice } from '../../utils/currency';
import { hasReviewForOrder } from '../../utils/reviewsStorage';
import { submitMenuItemReview, submitReview } from '../../api/reviews';
import { hasReviewedMenuItem, markMenuItemReviewed } from '../../utils/menuItemReviewsStorage';
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

  // General service/experience rating (not waiter-specific)
  const expRatingKey = `expRated_table_${tableNumber}`;
  const [expRating, setExpRating] = useState(5);
  const [expComment, setExpComment] = useState('');
  const [expSubmitting, setExpSubmitting] = useState(false);
  const [expSubmitted, setExpSubmitted] = useState(() => !!localStorage.getItem(expRatingKey));

  const handleSubmitExpRating = async () => {
    if (expSubmitting || expSubmitted) return;
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;
    setExpSubmitting(true);
    try {
      await submitReview({
        restaurantId,
        tableNumber,
        rating: expRating,
        comment: expComment.trim() || undefined,
      });
    } catch {
      // persist locally even if network fails
    } finally {
      localStorage.setItem(expRatingKey, '1');
      setExpSubmitted(true);
      setExpSubmitting(false);
    }
  };


  const handleItemRatingChange = (menuItemId: string, rating: number) => {
    setItemRatings((prev) => ({ ...prev, [menuItemId]: { rating, submitted: false } }));
  };

  const handleSubmitItemRating = async (menuItemId: string, orderId: string) => {
    const entry = itemRatings[menuItemId];
    if (!entry || entry.submitted) return;
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;
    try {
      const review = await submitMenuItemReview({
        restaurantId,
        menuItemId,
        orderId,
        rating: entry.rating,
      });
      markMenuItemReviewed(menuItemId, review.id);
    } catch {
      markMenuItemReviewed(menuItemId, `local-${Date.now()}`);
    }
    setItemRatings((prev) => ({ ...prev, [menuItemId]: { ...prev[menuItemId], submitted: true } }));
  };

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

              {/* Per-dish quick ratings */}
              {latestServedOrder.items.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold text-slate-800 mb-3">How was your food?</p>
                  <div className="space-y-3">
                    {latestServedOrder.items.map((item, idx) => {
                      const menuItemId = item.menuItem.id;
                      const alreadyDone = hasReviewedMenuItem(menuItemId);
                      const entry = itemRatings[menuItemId];
                      return (
                        <div key={`${menuItemId}-${idx}`} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-700 truncate flex-1 min-w-0">
                            {item.menuItem.name}
                          </span>
                          {alreadyDone || entry?.submitted ? (
                            <span className="text-xs text-green-600 font-medium flex-shrink-0">Rated ✓</span>
                          ) : (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {[1,2,3,4,5].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => {
                                    handleItemRatingChange(menuItemId, v);
                                    // auto-submit on tap
                                    setItemRatings((prev) => {
                                      const next = { ...prev, [menuItemId]: { rating: v, submitted: false } };
                                      return next;
                                    });
                                    setTimeout(() => handleSubmitItemRating(menuItemId, latestServedOrder.id), 0);
                                  }}
                                  aria-label={`Rate ${item.menuItem.name} ${v} stars`}
                                  className="p-0.5 touch-manipulation"
                                >
                                  <StarIcon
                                    className={`w-6 h-6 transition-colors ${
                                      (entry?.rating ?? 0) >= v
                                        ? 'fill-amber-500 text-amber-500'
                                        : 'text-slate-300 hover:text-amber-300'
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">Service</p>
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
              </div>
            </Card>
          </div>
        }

        {/* Overall experience rating — always available once orders exist */}
        <div className="mt-6">
          <h2 className="font-semibold text-slate-700 mb-3">Rate Your Experience</h2>
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            {expSubmitted ? (
              <div className="flex items-center gap-2 text-sm text-green-600 py-1">
                <StarIcon className="w-4 h-4 fill-green-500 text-green-500 flex-shrink-0" />
                Thank you for your feedback!
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquareIcon className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium text-slate-800">How was your overall experience?</p>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setExpRating(v)}
                      className="p-0.5 touch-manipulation transition-transform active:scale-95"
                      aria-label={`${v} stars`}
                    >
                      <StarIcon
                        className={`w-8 h-8 transition-colors ${
                          v <= expRating ? 'fill-amber-500 text-amber-500' : 'text-slate-300 hover:text-amber-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={expComment}
                  onChange={(e) => setExpComment(e.target.value)}
                  rows={2}
                  placeholder="Tell us what you loved or how we can improve... (optional)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 resize-none"
                />
                <Button
                  variant="primary"
                  fullWidth
                  isLoading={expSubmitting}
                  onClick={handleSubmitExpRating}
                >
                  Submit Feedback
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      <ServiceReviewModal
        order={reviewingOrder}
        isOpen={!!reviewingOrder}
        onClose={() => setReviewingOrder(null)}
      />
    </div>);

}