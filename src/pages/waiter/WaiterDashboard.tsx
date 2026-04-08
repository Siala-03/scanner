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
  SquareStackIcon
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('new');
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
      setSocketCalls((prev) => [...prev, { ...data, timestamp: new Date(data.timestamp) }]);
    };

    socket.on('waiter:call', handleWaiterCall);

    return () => {
      socket.off('waiter:call', handleWaiterCall);
    };
  }, [socket, joinRole]);

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

  const waiterOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assignedWaiterId === waiter.id ||
          (typeof order.tableNumber === 'number' && waiter.assignedTables.includes(order.tableNumber)) ||
          order.status === 'pending' // Show all pending orders so waiters can claim them
      ),
    [orders, waiter.id, waiter.assignedTables]
  );

  const newOrders = waiterOrders.filter((order) => order.status === 'pending');
  const kitchenOrders = waiterOrders.filter((order) => ['verified', 'preparing'].includes(order.status));
  const readyOrders = waiterOrders.filter((order) => order.status === 'ready');
  const completedOrders = waiterOrders.filter((order) => order.status === 'served');

  const todayServed = completedOrders.length;
  const avgServiceTime = waiter.performance.avgServiceTime;
  const waiterReviews = useMemo(() => loadReviews().filter((review) => review.waiterId === waiter.id), [waiter.id]);
  const waiterAvgRating = waiterReviews.length > 0
    ? Math.round((waiterReviews.reduce((sum, review) => sum + review.rating, 0) / waiterReviews.length) * 10) / 10
    : null;

  const handleApprove = (order: Order) => {
    const nextStatus = order.requiresKitchen ? 'preparing' : 'ready';
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
    <div className="dark min-h-screen bg-slate-900">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-4">
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
              <p className="text-sm text-slate-400">Confirm incoming orders for tables {waiter.assignedTables.join(', ') || 'N/A'} and route food to kitchen.</p>
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

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-500'}`} />
            <span className={`text-xs ${isOnline ? 'text-emerald-300' : 'text-red-400'}`}>{isOnline ? 'Live order feed' : 'Offline mode'}</span>
            {pendingOperations > 0 && <span className="text-xs text-amber-400">{pendingOperations} pending syncs</span>}
          </div>

          {allWaiterCalls.length > 0 && (
            <div className="mb-4 space-y-3">
              {allWaiterCalls.map((call) => (
                <div key={call.tableNumber} className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-amber-200 font-semibold">Assistance requested</p>
                    <p className="text-white">Table {call.tableNumber} needs help</p>
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <p className="text-sm text-slate-400 mb-2">Pending orders</p>
              <p className="text-3xl font-bold text-white">{newOrders.length}</p>
              <p className="text-xs text-slate-500">Needs table confirmation</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <p className="text-sm text-slate-400 mb-2">Kitchen queue</p>
              <p className="text-3xl font-bold text-white">{kitchenOrders.length}</p>
              <p className="text-xs text-slate-500">Food orders in progress</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <p className="text-sm text-slate-400 mb-2">Ready to serve</p>
              <p className="text-3xl font-bold text-white">{readyOrders.length}</p>
              <p className="text-xs text-slate-500">Orders prepared and waiting</p>
            </Card>
            <Card className="bg-slate-800 border border-slate-700 p-4">
              <p className="text-sm text-slate-400 mb-2">Served today</p>
              <p className="text-3xl font-bold text-white">{completedOrders.length}</p>
              <p className="text-xs text-slate-500">Orders completed on your shift</p>
            </Card>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <section className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Orders workflow</h2>
              <p className="text-sm text-slate-400">Approve each order after confirming with the customer at the table, then route food to the kitchen.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('new')}
                className={`px-4 py-2 rounded-full ${activeTab === 'new' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                New
              </button>
              <button
                onClick={() => setActiveTab('kitchen')}
                className={`px-4 py-2 rounded-full ${activeTab === 'kitchen' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Kitchen
              </button>
              <button
                onClick={() => setActiveTab('ready')}
                className={`px-4 py-2 rounded-full ${activeTab === 'ready' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Ready
              </button>
              <button
                onClick={() => setActiveTab('served')}
                className={`px-4 py-2 rounded-full ${activeTab === 'served' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                Served
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {activeTab === 'new' && (
                <motion.div key="new" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
                  {newOrders.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardListIcon className="w-8 h-8" />}
                      title="No new orders"
                      description="Incoming orders for your assigned tables will appear here."
                    />
                  ) : (
                    newOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onViewDetails={setSelectedOrder}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onPrintReceipt={handlePrintReceipt}
                      />
                    ))
                  )}
                </motion.div>
              )}

              {activeTab === 'kitchen' && (
                <motion.div key="kitchen" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
                  {kitchenOrders.length === 0 ? (
                    <EmptyState
                      icon={<UtensilsIcon className="w-8 h-8" />}
                      title="No kitchen orders"
                      description="Food orders approved and being prepared appear here."
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
                      description="Orders ready to serve will appear here."
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
                      description="Orders served during your shift are visible here."
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

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Your KPIs</p>
                  <h3 className="text-lg font-semibold text-white">Progress tracker</h3>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{kpis.length} targets</span>
              </div>

              {kpis.length === 0 ? (
                <p className="text-sm text-slate-400">No KPIs assigned yet. Ask your manager to set daily goals.</p>
              ) : (
                <div className="space-y-4">
                  {kpis.map((kpi) => {
                    const current = kpi.progress?.currentValue ?? 0;
                    const target = kpi.target_value || 1;
                    const percent = Math.min(100, Math.round((current / target) * 100));
                    return (
                      <div key={kpi.id} className="rounded-3xl border border-slate-700 bg-slate-800/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-400">{kpi.name}</p>
                            <p className="text-xs text-slate-500">{kpi.period === 'daily' ? 'Daily target' : kpi.period === 'weekly' ? 'Weekly target' : 'Monthly target'}</p>
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

            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-300">
                  <SquareStackIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Waiter summary</p>
                  <p className="text-lg font-semibold text-white">{waiter.name}</p>
                </div>
              </div>
              <div className="grid gap-3 text-sm text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Assigned tables</span>
                  <span>{waiter.assignedTables.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Avg service</span>
                  <span>{avgServiceTime} min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average rating</span>
                  <span>{waiterAvgRating ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Completed today</span>
                  <span>{todayServed}</span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>

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
