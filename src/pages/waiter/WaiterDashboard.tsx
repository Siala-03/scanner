import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellIcon,
  ClipboardListIcon,
  ClockIcon,
  CheckCircleIcon,
  MapIcon,
  TrendingUpIcon,
  StarIcon } from
'lucide-react';
import { Order, Staff } from '../../types';
import { Tabs } from '../../components/ui/Tabs';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { OrderCard } from '../../components/waiter/OrderCard';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { TableMapView } from './TableMapView';
import { loadReviews } from '../../utils/reviewsStorage';
interface WaiterDashboardProps {
  waiter: Staff;
  orders: Order[];
  onUpdateOrderStatus: (
  orderId: string,
  status: 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled',
  opts?: { assignedWaiterId?: string })
  => void;
  waiterCalls?: {
    tableNumber: number;
    timestamp: Date;
  }[];
  onDismissWaiterCall?: (tableNumber: number) => void;
}
export function WaiterDashboard({
  waiter,
  orders,
  onUpdateOrderStatus,
  waiterCalls = [],
  onDismissWaiterCall
}: WaiterDashboardProps) {
  const [activeTab, setActiveTab] = useState('new');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showTableMap, setShowTableMap] = useState(false);
  const waiterOrders = useMemo(
    () => orders.filter((o) => waiter.assignedTables.includes(o.tableNumber)),
    [orders, waiter.assignedTables]
  );
  const newOrders = waiterOrders.filter((o) => o.status === 'pending');
  const activeOrders = waiterOrders.filter((o) =>
  ['verified', 'preparing', 'ready'].includes(o.status)
  );
  const completedOrders = waiterOrders.filter((o) => o.status === 'served');
  const todayServed = completedOrders.length;
  const avgServiceTime = waiter.performance.avgServiceTime;
  const waiterReviews = useMemo(
    () => loadReviews().filter((r) => r.waiterId === waiter.id),
    [waiter.id]
  );
  const waiterAvgRating =
    waiterReviews.length > 0
      ? Math.round(
          (waiterReviews.reduce((s, r) => s + r.rating, 0) / waiterReviews.length) * 10
        ) / 10
      : null;
  const tabs = [
  {
    id: 'new',
    label: 'New Orders',
    count: newOrders.length
  },
  {
    id: 'active',
    label: 'Active',
    count: activeOrders.length
  },
  {
    id: 'completed',
    label: 'Completed',
    count: completedOrders.length
  }];

  // Sync order to kitchen display via localStorage and API
  const syncToKitchen = async (order: Order) => {
    try {
      // Save to localStorage for fallback
      const existing = JSON.parse(localStorage.getItem('kitchen_orders') || '[]');
      const newKitchenOrder = {
        id: order.id,
        orderNumber: order.id,
        tableNumber: order.tableNumber,
        status: 'pending' as const,
        items: order.items.map((item: any) => ({
          name: item.menuItem?.name || 'Item',
          quantity: item.quantity,
          notes: item.specialInstructions
        })),
        createdAt: new Date().toISOString()
      };
      const filtered = existing.filter((o: any) => o.id !== order.id);
      localStorage.setItem('kitchen_orders', JSON.stringify([...filtered, newKitchenOrder]));

      // Also try to sync to backend API
      const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: orderNumber,
          table_number: order.tableNumber,
          items: order.items.map((item: any) => ({
            menuItemId: item.menuItem?.id || 'unknown',
            menuItemName: item.menuItem?.name || 'Item',
            quantity: item.quantity,
            unitPrice: Math.round((item.menuItem?.price || 0) * 100),
            totalPrice: Math.round((item.menuItem?.price || 0) * item.quantity * 100),
            notes: item.specialInstructions
          })),
          subtotal: Math.round((order.subtotal || 0) * 100),
          tax: 0,
          total: Math.round((order.total || 0) * 100),
          status: 'pending',
          notes: order.specialInstructions
        })
      });
    } catch (e) {
      console.error('Failed to sync to kitchen:', e);
    }
  };

  const handleApprove = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      syncToKitchen(order);
    }
    onUpdateOrderStatus(orderId, 'verified', { assignedWaiterId: waiter.id });
    // Simulate kitchen starting to prepare
    setTimeout(
      () => onUpdateOrderStatus(orderId, 'preparing', { assignedWaiterId: waiter.id }),
      2000
    );
  };
  const handleReject = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'cancelled', { assignedWaiterId: waiter.id });
  };
  const handleMarkReady = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'ready', { assignedWaiterId: waiter.id });
  };
  const handleMarkServed = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'served', { assignedWaiterId: waiter.id });
  };
  if (showTableMap) {
    return (
      <div className="dark">
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setShowTableMap(false)}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg">

            Back to Orders
          </button>
        </div>
        <TableMapView
          assignedTables={waiter.assignedTables}
          orders={orders}
          onSelectTable={(tableNumber) => {
            const order = waiterOrders.find(
              (o) =>
              o.tableNumber === tableNumber &&
              ['pending', 'verified', 'preparing', 'ready'].includes(
                o.status
              )
            );
            if (order) {
              setSelectedOrder(order);
            }
            setShowTableMap(false);
          }} />

      </div>);

  }
  return (
    <div className="dark min-h-screen bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">
              Hello, {waiter.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-slate-400">
              Tables {waiter.assignedTables.join(', ')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTableMap(true)}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">

              <MapIcon className="w-5 h-5" />
            </button>
            <button className="relative p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <BellIcon className="w-5 h-5" />
              {(newOrders.length > 0 || waiterCalls.length > 0) &&
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {newOrders.length + waiterCalls.length}
                </span>
              }
            </button>
          </div>
        </div>

        {/* Waiter Calls Alerts */}
        {waiterCalls.length > 0 &&
        <div className="mb-4 space-y-2">
            {waiterCalls.map((call) =>
          <div
            key={call.tableNumber}
            className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 flex items-center justify-between">

                <div className="flex items-center gap-2">
                  <BellIcon className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-400 font-medium">
                    Table {call.tableNumber} needs assistance
                  </span>
                </div>
                <button
              onClick={() => onDismissWaiterCall?.(call.tableNumber)}
              className="text-amber-400 hover:text-amber-300 text-sm font-medium px-2 py-1 bg-amber-500/20 rounded">

                  Dismiss
                </button>
              </div>
          )}
          </div>
        }

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <Card className="bg-slate-800 p-3" padding="none">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">
                {newOrders.length}
              </p>
              <p className="text-xs text-slate-400">Pending</p>
            </div>
          </Card>
          <Card className="bg-slate-800 p-3 col-span-2 md:col-span-1" padding="none">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-yellow-400 mb-1">
                <StarIcon className="w-4 h-4" />
                <p className="text-lg font-bold">
                  {waiterAvgRating ?? '—'}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Your rating {waiterReviews.length > 0 ? `(${waiterReviews.length})` : ''}
              </p>
            </div>
          </Card>
          <Card className="bg-slate-800 p-3" padding="none">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">
                {activeOrders.length}
              </p>
              <p className="text-xs text-slate-400">Active</p>
            </div>
          </Card>
          <Card className="bg-slate-800 p-3" padding="none">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{todayServed}</p>
              <p className="text-xs text-slate-400">Served</p>
            </div>
          </Card>
          <Card className="bg-slate-800 p-3" padding="none">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">
                {avgServiceTime}m
              </p>
              <p className="text-xs text-slate-400">Avg Time</p>
            </div>
          </Card>
        </div>

        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'new' &&
          <motion.div
            key="new"
            initial={{
              opacity: 0,
              x: 20
            }}
            animate={{
              opacity: 1,
              x: 0
            }}
            exit={{
              opacity: 0,
              x: -20
            }}
            className="space-y-3">

              {newOrders.length === 0 ?
            <EmptyState
              icon={<ClipboardListIcon className="w-8 h-8" />}
              title="No pending orders"
              description="New orders from your tables will appear here." /> :


            newOrders.map((order, index) =>
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
                delay: index * 0.05
              }}>

                    <OrderCard
                order={order}
                onViewDetails={setSelectedOrder}
                onApprove={handleApprove}
                onReject={handleReject} />

                  </motion.div>
            )
            }
            </motion.div>
          }

          {activeTab === 'active' &&
          <motion.div
            key="active"
            initial={{
              opacity: 0,
              x: 20
            }}
            animate={{
              opacity: 1,
              x: 0
            }}
            exit={{
              opacity: 0,
              x: -20
            }}
            className="space-y-3">

              {activeOrders.length === 0 ?
            <EmptyState
              icon={<ClockIcon className="w-8 h-8" />}
              title="No active orders"
              description="Orders being prepared will appear here." /> :


            activeOrders.map((order, index) =>
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
                delay: index * 0.05
              }}>

                    <OrderCard
                order={order}
                onViewDetails={setSelectedOrder}
                onMarkReady={handleMarkReady}
                onMarkServed={handleMarkServed} />

                  </motion.div>
            )
            }
            </motion.div>
          }

          {activeTab === 'completed' &&
          <motion.div
            key="completed"
            initial={{
              opacity: 0,
              x: 20
            }}
            animate={{
              opacity: 1,
              x: 0
            }}
            exit={{
              opacity: 0,
              x: -20
            }}
            className="space-y-3">

              {completedOrders.length === 0 ?
            <EmptyState
              icon={<CheckCircleIcon className="w-8 h-8" />}
              title="No completed orders"
              description="Served orders will appear here." /> :


            completedOrders.map((order, index) =>
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
                delay: index * 0.05
              }}>

                    <OrderCard order={order} onViewDetails={setSelectedOrder} />
                  </motion.div>
            )
            }
            </motion.div>
          }
        </AnimatePresence>
      </div>

      {/* Order detail modal */}
      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onMarkReady={handleMarkReady}
        onMarkServed={handleMarkServed} />

    </div>);

}