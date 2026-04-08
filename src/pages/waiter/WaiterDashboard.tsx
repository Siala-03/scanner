import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellIcon,
  ClipboardListIcon,
  ClockIcon,
  CheckCircleIcon,
  MapIcon,
  TrendingUpIcon,
  StarIcon,
  LogOutIcon,
  QrCodeIcon } from
'lucide-react';
import { Order, Staff, OrderItem } from '../../types';
import { Tabs } from '../../components/ui/Tabs';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { OrderCard } from '../../components/waiter/OrderCard';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { TableMapView } from './TableMapView';
import { QRScanner } from '../../components/waiter/QRScanner';
import { WaiterOrderEntry } from '../../components/waiter/WaiterOrderEntry';
import { loadReviews } from '../../utils/reviewsStorage';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { printOrderReceipt, buildReceiptHtml, orderToReceiptData } from '../../utils/receipt';
import { printReceiptNetwork } from '../../api/printer';
import { ReceiptShareModal } from '../../components/ui/ReceiptShareModal';
import { KPICard } from '../../components/supervisor/KPICard';
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
    items: OrderItem[],
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
  const [showTableMap, setShowTableMap] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [socketCalls, setSocketCalls] = useState<{ tableNumber: number; timestamp: Date }[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedOrderForShare, setSelectedOrderForShare] = useState<Order | null>(null);
  const { socket, joinRole } = useSocket();
  const { kpis } = useStaffKPIs();
  const { isOnline, pendingOperations } = useOfflineStatus();

  // Join waiter role room and listen for call events
  useEffect(() => {
    joinRole('waiter');

    const handleWaiterCall = (data: { tableNumber: number; timestamp: Date }) => {
      console.log('Received waiter call via socket:', data);
      setSocketCalls((prev) => [...prev, { ...data, timestamp: new Date(data.timestamp) }]);
    };

    socket.on('waiter:call', handleWaiterCall);

    return () => {
      socket.off('waiter:call', handleWaiterCall);
    };
  }, [socket, joinRole]);

  // Combine local waiterCalls prop with socket-based calls
  const allWaiterCalls = useMemo(() => {
    const callsMap = new Map<number, Date>();
    
    // Add socket calls
    socketCalls.forEach((call) => {
      callsMap.set(call.tableNumber, call.timestamp);
    });
    
    // Add prop calls (from local state in App)
    waiterCalls.forEach((call) => {
      if (!callsMap.has(call.tableNumber)) {
        callsMap.set(call.tableNumber, call.timestamp);
      }
    });

    return Array.from(callsMap.entries()).map(([tableNumber, timestamp]) => ({
      tableNumber,
      timestamp
    }));
  }, [waiterCalls, socketCalls]);

  // Dismiss handler that also clears from socket calls
  const handleDismissCall = (tableNum: number) => {
    setSocketCalls((prev) => prev.filter((c) => c.tableNumber !== tableNum));
    onDismissWaiterCall?.(tableNum);
  };
  const waiterOrders = useMemo(
    () => {
      console.log('[WaiterDashboard] Waiter orders', {
        waiterId: waiter.id,
        totalOrders: orders.length,
        orderIds: orders.map(o => `${o.id}(${o.status})`)
      });
      return orders;
    },
    [orders, waiter.id]
  );
  const newOrders = waiterOrders.filter((o) => o.status === 'pending');
  const activeOrders = waiterOrders.filter((o) =>
    ['verified', 'preparing', 'ready'].includes(o.status)
  );
  const completedOrders = waiterOrders.filter((o) => o.status === 'served');
  
  console.log('[WaiterDashboard] Order summary', {
    newOrders: newOrders.length,
    activeOrders: activeOrders.length,
    completedOrders: completedOrders.length
  });
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
    // Configuration for the receipt (in production, this would come from restaurant settings)
    const receiptOptions: Parameters<typeof orderToReceiptData>[1] = {
        restaurantName: restaurantName || 'Servv Restaurant',
      restaurantPhone: '(555) 123-4567',
      restaurantEmail: 'info@servv.com',
      taxRate: 18, // 18% tax (configurable by manager)
      serverName: waiter.name,
      orderType: order.deliveryAddress ? 'delivery' as const : 'dine-in' as const,
      paymentMethod: 'Cash',
      paymentStatus: 'paid' as const,
      amountPaid: order.total,
    };

    // Network print call to backend endpoint
    try {
      await printReceiptNetwork(order, waiter.name);
    } catch (err) {
      console.warn('Network receipt print failed, falling back to browser print', err);
    }

    if (typeof window !== 'undefined') {
      try {
        // Use the new comprehensive receipt system
        const receiptData = orderToReceiptData(order, receiptOptions);
        const html = buildReceiptHtml(receiptData);
        const printWindow = window.open('', '_blank', 'width=450,height=900');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(html);
          printWindow.document.close();
        } else {
          console.warn('Unable to open print window');
        }
      } catch (error) {
        console.error('Error generating receipt:', error);
        // Fallback to browser print
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">
                Hello, {waiter.name.split(' ')[0]}
              </h1>
              <p className="text-sm text-slate-400">{restaurantName || 'Restaurant'} · Waiter Dashboard</p>
              <p className="text-sm text-slate-400">Tables {waiter.assignedTables.join(', ')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowQRScanner(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
                title="Scan QR or enter table manually">
                <QrCodeIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Take Order</span>
              </button>
              <button
                onClick={() => setShowTableMap(true)}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Table Map">
                <MapIcon className="w-5 h-5" />
              </button>
              <button className="relative p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <BellIcon className="w-5 h-5" />
                {(newOrders.length > 0 || allWaiterCalls.length > 0) && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {newOrders.length + allWaiterCalls.length}
                  </span>
                )}
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
                title="Logout">
                <LogOutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            {!isOnline && pendingOperations > 0 && (
              <span className="text-xs text-amber-400">
                {pendingOperations} pending sync
              </span>
            )}
          </div>

          {allWaiterCalls.length > 0 && (
            <div className="mb-4 space-y-2">
              {allWaiterCalls.map((call) => (
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
                    onClick={() => handleDismissCall(call.tableNumber)}
                    className="text-amber-400 hover:text-amber-300 text-sm font-medium px-2 py-1 bg-amber-500/20 rounded">
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}

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
      </div>

      {/* KPIs Section */}
      {kpis.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">Your KPIs</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {kpis.map((kpi) => (
              <KPICard
                key={kpi.id}
                label={kpi.name}
                value={kpi.progress?.currentValue || 0}
                change={kpi.progress ? (kpi.progress.currentValue / (kpi as any).targetValue) * 100 - 100 : 0}
                trend={kpi.progress?.achieved ? 'up' : 'neutral'}
                icon={<TrendingUpIcon className="w-5 h-5" />}
              />
            ))}
          </div>
        </div>
      )}

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
                onReject={handleReject}
                onPrintReceipt={handlePrintReceipt} />

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
                onMarkServed={handleMarkServed}
                onPrintReceipt={handlePrintReceipt} />

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

                    <OrderCard order={order} onViewDetails={setSelectedOrder} onPrintReceipt={handlePrintReceipt} />
                  </motion.div>
            )
            }
            </motion.div>
          }
        </AnimatePresence>
      </div>

      {/* QR Scanner Modal */}
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

      {/* Order Entry Modal */}
      {showOrderEntry && selectedTableNumber !== null && (
        <WaiterOrderEntry
          tableNumber={selectedTableNumber}
          isOpen={showOrderEntry}
          onClose={() => {
            setShowOrderEntry(false);
            setSelectedTableNumber(null);
          }}
          onSubmitOrder={async (items: OrderItem[], notes?: string) => {
            if (onCreateOrder) {
              await onCreateOrder(selectedTableNumber, items, notes);
            }
          }}
        />
      )}

      {/* Order detail modal */}
      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onMarkReady={handleMarkReady}
        onMarkServed={handleMarkServed}
        onPrintReceipt={handleShareReceipt} />

      {/* Receipt Share Modal */}
      {showShareModal && selectedOrderForShare && (
        <ReceiptShareModal
          isOpen={showShareModal}
          onClose={handleShareModalClose}
          receipt={orderToReceiptData(selectedOrderForShare, {
            restaurantName: 'Servv Restaurant',
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

    </div>);

}
