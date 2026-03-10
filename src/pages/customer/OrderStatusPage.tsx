import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClockIcon, ReceiptIcon } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { OrderTracker } from '../../components/customer/OrderTracker';
import { ServiceReviewModal } from '../../components/customer/ServiceReviewModal';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatPrice } from '../../utils/currency';
import { hasReviewForOrder } from '../../utils/reviewsStorage';
interface OrderStatusPageProps {
  orders: Order[];
  tableNumber: number;
}
export function OrderStatusPage({ orders, tableNumber }: OrderStatusPageProps) {
  const tableOrders = orders.filter(
    (order) => order.tableNumber === tableNumber
  );
  const activeOrder = tableOrders.find((order) =>
  ['pending', 'verified', 'preparing', 'ready'].includes(order.status)
  );
  const pastOrders = tableOrders.filter((order) =>
  ['served', 'cancelled'].includes(order.status)
  );
  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  // Simulate order progression for demo
  const [simulatedStatus, setSimulatedStatus] = useState<OrderStatus>(
    activeOrder?.status || 'pending'
  );
  useEffect(() => {
    if (!activeOrder) return;
    const statuses: OrderStatus[] = [
    'pending',
    'verified',
    'preparing',
    'ready',
    'served'];

    const currentIndex = statuses.indexOf(simulatedStatus);
    if (currentIndex < statuses.length - 1) {
      const timer = setTimeout(() => {
        setSimulatedStatus(statuses[currentIndex + 1]);
      }, 5000); // Progress every 5 seconds for demo
      return () => clearTimeout(timer);
    }
  }, [simulatedStatus, activeOrder]);
  if (tableOrders.length === 0) {
    return (
      <div className="min-h-screen bg-[#faf6f0] flex items-center justify-center p-4">
        <EmptyState
          icon={<ReceiptIcon className="w-8 h-8" />}
          title="No orders yet"
          description="Place an order from the menu to track its status here." />

      </div>);

  }
  return (
    <div className="min-h-screen bg-[#faf6f0] pb-24">
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Order Status</h1>
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            Table {tableNumber}
          </span>
        </div>

        {/* Active order */}
        {activeOrder &&
        <div className="mb-8">
            <h2 className="font-semibold text-slate-700 mb-3">Current Order</h2>
            <OrderTracker
            status={activeOrder.status}
            createdAt={activeOrder.createdAt}
            estimatedWaitTime={20} />


            {/* Order details */}
            <Card className="mt-4 bg-white">
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium text-slate-900">
                  {activeOrder.id}
                </span>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ClockIcon className="w-4 h-4" />
                  {activeOrder.createdAt.toLocaleTimeString([], {
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

              <div className="pt-3 border-t flex justify-between">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-bold text-amber-600">
                  {formatPrice(activeOrder.total)}
                </span>
              </div>
            </Card>
          </div>
        }

        {/* Past orders */}
        {pastOrders.length > 0 &&
        <div>
            <h2 className="font-semibold text-slate-700 mb-3">Past Orders</h2>
            <div className="space-y-3">
              <AnimatePresence>
                {pastOrders.map((order, index) =>
              <motion.div
                key={order.id}
                initial={{
                  opacity: 0,
                  y: 20
                }}
                animate={{
                  opacity: 1,
                  y: 0
                }}
                transition={{
                  delay: index * 0.1
                }}>

                    <Card className="bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-medium text-slate-900">
                            {order.id}
                          </span>
                          <p className="text-sm text-slate-500">
                            {order.createdAt.toLocaleDateString()} at{' '}
                            {order.createdAt.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>

                      <div className="text-sm text-slate-600 mb-2">
                        {order.items.length} item
                        {order.items.length > 1 ? 's' : ''}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex flex-col">
                          <span className="text-slate-500">Total</span>
                          <span className="font-semibold text-slate-900">
                            {formatPrice(order.total)}
                          </span>
                        </div>
                        {order.status === 'served' && !hasReviewForOrder(order.id) && (
                          <button
                            type="button"
                            onClick={() => setReviewingOrder(order)}
                            className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
                          >
                            Rate service
                          </button>
                        )}
                      </div>
                    </Card>
                  </motion.div>
              )}
              </AnimatePresence>
            </div>
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