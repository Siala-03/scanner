import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardListIcon,
  CheckCircleIcon,
  MapIcon,
  StarIcon,
  LogOutIcon,
  QrCodeIcon,
  UtensilsIcon,
  UsersIcon,
  ClockIcon,
  TrendingUpIcon,
  BellIcon,
  DollarSignIcon
} from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import { Order, Staff, CartItem } from '../../types';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { OrderCard } from '../../components/waiter/OrderCard';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { QRScanner } from '../../components/waiter/QRScanner';
import { WaiterOrderEntry } from '../../components/waiter/WaiterOrderEntry';
import { loadReviews } from '../../utils/reviewsStorage';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { buildReceiptHtml, orderToReceiptData } from '../../utils/receipt';
import { printReceiptNetwork } from '../../api/printer';
import { ReceiptShareModal } from '../../components/ui/ReceiptShareModal';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useSocket } from '../../hooks/useSocket';

interface WaiterDashboardProps {
  waiter: Staff;
  orders: Order[];
  restaurantName?: string;
  onUpdateOrderStatus: (
    orderId: string,
    status: 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled',
    opts?: { assignedWaiterId?: string }
  ) => void;
  onCreateOrder?: (
    tableNumber: number,
    items: CartItem[],
    notes?: string
  ) => Promise<void>;
  waiterCalls?: {
    tableNumber: number;
    timestamp: Date;
  }[];
  onDismissWaiterCall?: (tableNumber: number) => void;
  onLogout?: () => void;
}

export function WaiterDashboard({
  waiter,
  orders,
  restaurantName,
  onUpdateOrderStatus,
  onCreateOrder,
  waiterCalls = [],
  onDismissWaiterCall,
  onLogout
}: WaiterDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [socketCalls, setSocketCalls] = useState<{ tableNumber: number; timestamp: Date }[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedOrderForShare, setSelectedOrderForShare] = useState<Order | null>(null);
  const { socket, joinRole } = useSocket();
  const { kpis } = useStaffKPIs();
  const { isOnline, pendingOperations } = useOfflineStatus();

  useEffect(() => {
    joinRole('waiter');

    const handleWaiterCall = (data: { tableNumber: number; timestamp: Date }) => {
      console.log('Waiter call received:', data);
      setSocketCalls((prev) => [...prev, { ...data, timestamp: new Date(data.timestamp) }]);
    };

    socket.on('waiter:call', handleWaiterCall);

    return () => {
      socket.off('waiter:call', handleWaiterCall);
    };
  }, [socket, joinRole]);

  // Filter orders - show all active orders from all sources including customer QR menu
  const waiterOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === 'pending' ||
          order.status === 'verified' ||
          order.status === 'preparing' ||
          order.status === 'ready'
      ),
    [orders]
  );

  // All pending orders from customer QR menu and direct entry
  const newOrders = waiterOrders.filter((order) => order.status === 'pending');
  const pendingCustomerMenuOrders = newOrders; // Show all pending orders to waiters
  const pendingWaiterOrders = newOrders.filter((order) => order.assignedWaiterId === waiter.id);
  const kitchenOrders = waiterOrders.filter((order) => ['verified', 'preparing'].includes(order.status));
  const readyOrders = waiterOrders.filter((order) => order.status === 'ready');
  // Filter served orders from ALL orders (not waiterOrders which already excludes 'served')
  const completedOrders = orders.filter((order) => order.status === 'served');

  const allWaiterCalls = useMemo(() => {
    const map = new Map<number, Date>();
    socketCalls.forEach((call) => map.set(call.tableNumber, call.timestamp));
    waiterCalls.forEach((call) => {
      if (!map.has(call.tableNumber)) {
        map.set(call.tableNumber, call.timestamp);
      }
    });
    return Array.from(map.entries()).map(([tableNumber, timestamp]) => ({ tableNumber, timestamp }));
  }, [waiterCalls, socketCalls]);

  const avgServiceTime = waiter.performance.avgServiceTime;
  const waiterReviews = useMemo(() => loadReviews().filter((review) => review.waiterId === waiter.id), [waiter.id]);
  const waiterAvgRating = waiterReviews.length > 0
    ? Math.round((waiterReviews.reduce((sum, review) => sum + review.rating, 0) / waiterReviews.length) * 10) / 10
    : null;

  // Calculate customer menu order stats (all orders, not just active ones)
  const customerMenuOrders = orders.filter(o => !o.assignedWaiterId || o.status === 'pending');
  const customerMenuOrderCount = customerMenuOrders.length;
  const recentCustomerOrders = orders.filter(order =>
    new Date(order.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
  ).length;

  // Today's revenue from served orders
  const todaysRevenue = orders
    .filter(o => o.status === 'served' && new Date(o.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const handleApprove = (order: Order) => {
    const nextStatus = order.requiresKitchen ? 'verified' : 'ready';
    onUpdateOrderStatus(order.id, nextStatus, { assignedWaiterId: waiter.id });
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

  const handlePrintReceipt = async (order: Order) => {
    const receiptOptions: Parameters<typeof orderToReceiptData>[1] = {
      restaurantName: restaurantName || 'Restaurant',
      restaurantAddress: restaurantName ? `${restaurantName} Address` : '123 Main Street, City',
      restaurantPhone: '(555) 123-4567',
      restaurantEmail: 'info@servv.com',
      taxRate: 18,
      serverName: waiter.name,
      orderType: order.deliveryAddress ? 'delivery' as const : 'dine-in' as const,
      paymentMethod: 'Cash',
      paymentStatus: 'paid' as const,
      amountPaid: order.total,
    };

    try {
      await printReceiptNetwork(order, waiter.name);
    } catch (error) {
      console.warn('Receipt print API failed:', error);
    }

    if (typeof window !== 'undefined') {
      try {
        const receiptData = orderToReceiptData(order, receiptOptions);
        const html = buildReceiptHtml(receiptData);
        const printWindow = window.open('', '_blank', 'width=450,height=900');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(html);
          printWindow.document.close();
        }
      } catch (error) {
        console.error('Error generating receipt:', error);
        window.print();
      }
    }
  };

  const handleShareReceipt = (order: Order) => {
    setSelectedOrderForShare(order);
    setShowShareModal(true);
  };

  const handleShareModalClose = () => {
    setShowShareModal(false);
    setSelectedOrderForShare(null);
  };

  const handleDismissCall = (tableNumber: number) => {
    setSocketCalls((prev) => prev.filter((call) => call.tableNumber !== tableNumber));
    onDismissWaiterCall?.(tableNumber);
  };

  return (
    <div className="dark min-h-screen bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold uppercase tracking-[0.24em]">
                  {restaurantName || 'Restaurant'}
                </span>
                <span className="text-xs text-slate-500">Waiter Portal</span>
              </div>
              <h1 className="text-2xl font-bold text-white">Welcome back, {waiter.name.split(' ')[0]}</h1>
              <p className="text-sm text-slate-400">Manage customer orders from QR menu scans and direct table service.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowQRScanner(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
              >
                <QrCodeIcon className="w-5 h-5" />
                <span>Take Table Order</span>
              </button>
              <button
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                title="Table map unavailable"
                disabled
              >
                <MapIcon className="w-5 h-5" />
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Connection Status & Waiter Calls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-500'}`} />
            <span className={`text-xs ${isOnline ? 'text-emerald-300' : 'text-red-400'}`}>
              {isOnline ? 'Connected to customer menu' : 'Offline mode'}
            </span>
            {pendingOperations > 0 && <span className="text-xs text-amber-400">{pendingOperations} pending syncs</span>}
          </div>

          {allWaiterCalls.length > 0 && (
            <div className="mb-4 space-y-3">
              {allWaiterCalls.map((call) => (
                <div key={call.tableNumber} className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <BellIcon className="w-5 h-5 text-amber-300" />
                    <div>
                      <p className="text-sm text-amber-200 font-semibold">Customer assistance needed</p>
                      <p className="text-white">Table {call.tableNumber} - from QR menu</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDismissCall(call.tableNumber)}
                    className="rounded-full bg-amber-500 px-3 py-2 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <UsersIcon className="w-4 h-4 text-amber-400" />
                <p className="text-sm text-slate-400">Customer Orders</p>
              </div>
              <p className="text-3xl font-bold text-white">{customerMenuOrderCount}</p>
              <p className="text-xs text-slate-500">From QR menu scans</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClockIcon className="w-4 h-4 text-blue-400" />
                <p className="text-sm text-slate-400">Pending</p>
              </div>
              <p className="text-3xl font-bold text-white">{newOrders.length}</p>
              <p className="text-xs text-slate-500">Awaiting confirmation</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <UtensilsIcon className="w-4 h-4 text-orange-400" />
                <p className="text-sm text-slate-400">Kitchen</p>
              </div>
              <p className="text-3xl font-bold text-white">{kitchenOrders.length}</p>
              <p className="text-xs text-slate-500">Food in preparation</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircleIcon className="w-4 h-4 text-green-400" />
                <p className="text-sm text-slate-400">Ready</p>
              </div>
              <p className="text-3xl font-bold text-white">{readyOrders.length}</p>
              <p className="text-xs text-slate-500">Ready to serve</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUpIcon className="w-4 h-4 text-purple-400" />
                <p className="text-sm text-slate-400">Served</p>
              </div>
              <p className="text-3xl font-bold text-white">{completedOrders.length}</p>
              <p className="text-xs text-slate-500">Completed today</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSignIcon className="w-4 h-4 text-emerald-400" />
                <p className="text-sm text-slate-400">Revenue</p>
              </div>
              <p className="text-2xl font-bold text-white">{formatPrice(todaysRevenue)}</p>
              <p className="text-xs text-slate-500">Today's served orders</p>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <section className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Order Management</h2>
              <p className="text-sm text-slate-400">Handle customer orders from QR menu scans and manage the complete service workflow.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-full ${activeTab === 'overview' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 rounded-full ${activeTab === 'pending' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Pending ({newOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('kitchen')}
                className={`px-4 py-2 rounded-full ${activeTab === 'kitchen' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Kitchen ({kitchenOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('ready')}
                className={`px-4 py-2 rounded-full ${activeTab === 'ready' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Ready ({readyOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('served')}
                className={`px-4 py-2 rounded-full ${activeTab === 'served' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Served ({completedOrders.length})
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-6">
                  {/* Customer Menu Integration Section */}
                  <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-300">
                        <UsersIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Customer Menu Activity</h3>
                        <p className="text-sm text-slate-400">Real-time orders from QR code scans</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-800/50 p-4">
                        <p className="text-sm text-slate-400 mb-1">Active Customer Orders</p>
                        <p className="text-2xl font-bold text-white">{customerMenuOrderCount}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-800/50 p-4">
                        <p className="text-sm text-slate-400 mb-1">Orders in Last 24h</p>
                        <p className="text-2xl font-bold text-white">{recentCustomerOrders}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {newOrders.slice(0, 4).map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onViewDetails={setSelectedOrder}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onPrintReceipt={handlePrintReceipt}
                      />
                    ))}
                  </div>

                  {newOrders.length === 0 && (
                    <EmptyState
                      icon={<ClipboardListIcon className="w-8 h-8" />}
                      title="No active orders"
                      description="Customer orders from QR menu scans will appear here automatically."
                    />
                  )}
                </motion.div>
              )}

              {activeTab === 'pending' && (
                <motion.div key="pending" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
                  {newOrders.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardListIcon className="w-8 h-8" />}
                      title="No pending orders"
                      description="New orders from customer QR menu scans will appear here automatically for approval."
                    />
                  ) : (
                    <div className="space-y-6">
                      {pendingCustomerMenuOrders.length > 0 && (
                        <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-white">Customer QR Orders</h3>
                              <p className="text-sm text-slate-400">Orders placed from the guest-facing QR menu appear here first.</p>
                            </div>
                            <span className="rounded-full bg-blue-500/15 text-blue-200 px-3 py-1 text-xs font-semibold">{pendingCustomerMenuOrders.length} QR orders</span>
                          </div>
                          <div className="space-y-4">
                            {pendingCustomerMenuOrders.map((order) => (
                              <OrderCard
                                key={order.id}
                                order={order}
                                onViewDetails={setSelectedOrder}
                                onApprove={handleApprove}
                                onReject={handleReject}
                                onPrintReceipt={handlePrintReceipt}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {pendingWaiterOrders.length > 0 && (
                        <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-white">Assigned Waiter Orders</h3>
                              <p className="text-sm text-slate-400">Pending orders already assigned to you appear here.</p>
                            </div>
                            <span className="rounded-full bg-amber-500/15 text-amber-200 px-3 py-1 text-xs font-semibold">{pendingWaiterOrders.length} assigned</span>
                          </div>
                          <div className="space-y-4">
                            {pendingWaiterOrders.map((order) => (
                              <OrderCard
                                key={order.id}
                                order={order}
                                onViewDetails={setSelectedOrder}
                                onApprove={handleApprove}
                                onReject={handleReject}
                                onPrintReceipt={handlePrintReceipt}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'kitchen' && (
                <motion.div key="kitchen" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
                  {kitchenOrders.length === 0 ? (
                    <EmptyState
                      icon={<UtensilsIcon className="w-8 h-8" />}
                      title="No kitchen orders"
                      description="Orders requiring kitchen preparation appear here."
                    />
                  ) : (
                    kitchenOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onViewDetails={setSelectedOrder}
                        onMarkReady={handleMarkReady}
                        onPrintReceipt={handlePrintReceipt}
                      />
                    ))
                  )}
                </motion.div>
              )}

              {activeTab === 'ready' && (
                <motion.div key="ready" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
                  {readyOrders.length === 0 ? (
                    <EmptyState
                      icon={<CheckCircleIcon className="w-8 h-8" />}
                      title="No ready orders"
                      description="Prepared orders ready for service appear here."
                    />
                  ) : (
                    readyOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onViewDetails={setSelectedOrder}
                        onMarkServed={handleMarkServed}
                        onPrintReceipt={handlePrintReceipt}
                      />
                    ))
                  )}
                </motion.div>
              )}

              {activeTab === 'served' && (
                <motion.div key="served" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
                  {completedOrders.length === 0 ? (
                    <EmptyState
                      icon={<StarIcon className="w-8 h-8" />}
                      title="No served orders"
                      description="Completed orders from your shift are tracked here."
                    />
                  ) : (
                    completedOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onViewDetails={setSelectedOrder}
                        onPrintReceipt={handlePrintReceipt}
                      />
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {/* Performance Summary */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Performance</p>
                  <h3 className="text-lg font-semibold text-white">Your Shift Summary</h3>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{completedOrders.length} served</span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Avg Service Time</span>
                  <span className="text-sm font-semibold text-white">{avgServiceTime} min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Customer Rating</span>
                  <span className="text-sm font-semibold text-white">{waiterAvgRating ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Tables Served</span>
                  <span className="text-sm font-semibold text-white">{waiter.assignedTables.length}</span>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Goals</p>
                  <h3 className="text-lg font-semibold text-white">Daily Targets</h3>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{kpis.length} active</span>
              </div>

              {kpis.length === 0 ? (
                <p className="text-sm text-slate-400">No KPIs assigned yet. Check with your manager.</p>
              ) : (
                <div className="space-y-4">
                  {kpis.map((kpi) => {
                    const current = kpi.progress?.currentValue ?? 0;
                    const target = kpi.target_value || 1;
                    const percent = Math.min(100, Math.round((current / target) * 100));
                    return (
                      <div key={kpi.id} className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-400">{kpi.name}</p>
                            <p className="text-xs text-slate-500">{kpi.period === 'daily' ? 'Daily' : kpi.period === 'weekly' ? 'Weekly' : 'Monthly'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-white">{current}/{target}</p>
                            <p className="text-xs text-slate-400">{percent}%</p>
                          </div>
                        </div>
                        <div className="mt-4 h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Customer Menu Connection Status */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-2xl bg-green-500/10 p-3 text-green-300">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Menu Integration</p>
                  <p className="text-lg font-semibold text-white">Connected</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-3">Real-time sync with customer QR orders</p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-xs text-green-300">Live updates active</span>
              </div>
            </div>
          </aside>
        </section>
      </div>

      {/* Modals */}
      {showQRScanner && (
        <QRScanner
          onScan={(tableNumber) => {
            setShowQRScanner(false);
            setSelectedTableNumber(tableNumber);
            setShowOrderEntry(true);
          }}
          onClose={() => setShowQRScanner(false)}
          onError={(error) => {
            console.error('QR Scanner Error:', error);
            alert(error);
          }}
        />
      )}

      {showOrderEntry && selectedTableNumber !== null && (
        <WaiterOrderEntry
          tableNumber={selectedTableNumber}
          isOpen={showOrderEntry}
          onClose={() => {
            setShowOrderEntry(false);
            setSelectedTableNumber(null);
          }}
          onSubmitOrder={async (items: CartItem[], notes?: string) => {
            if (!onCreateOrder) {
              window.alert('Order creation is not available.');
              return;
            }
            await onCreateOrder(selectedTableNumber, items, notes);
          }}
        />
      )}

      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onMarkReady={handleMarkReady}
        onMarkServed={handleMarkServed}
        onPrintReceipt={handleShareReceipt}
      />

      {showShareModal && selectedOrderForShare && (
        <ReceiptShareModal
          isOpen={showShareModal}
          onClose={handleShareModalClose}
          receipt={orderToReceiptData(selectedOrderForShare, {
            restaurantName: restaurantName || 'Restaurant',
            restaurantAddress: '123 Main Street, City',
            restaurantPhone: '(555) 123-4567',
            restaurantEmail: 'info@servv.com',
            taxRate: 18,
            serverName: waiter.name,
            orderType: selectedOrderForShare.deliveryAddress ? 'delivery' : 'dine-in',
            paymentMethod: 'Cash',
            paymentStatus: 'paid',
            amountPaid: selectedOrderForShare.total,
          })}
          customerPhone={selectedOrderForShare.customerId ? undefined : undefined}
          customerEmail={selectedOrderForShare.customerId ? undefined : undefined}
        />
      )}
    </div>
  );
}
