import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCartIcon, ArrowLeftIcon, FileTextIcon, CalendarIcon } from 'lucide-react';
import type { Order as OrderType, OrderStatus } from '../../types';
import { Card } from '../../components/ui/Card';
import { OrdersHistoryTable } from '../../components/supervisor/OrdersHistoryTable';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { fetchOrders, cancelOrder, fetchCancellationRequestByOrderId, fetchOrderCount } from '../../api/orders';
import type { CancellationDetails } from '../../components/waiter/OrderDetailModal';
import { VoidReasonModal } from '../../components/shared/VoidReasonModal';
import type { RestaurantReceiptSettings } from '../../api/restaurants';
import { buildReceiptHtml, orderToReceiptData, printReceipt } from '../../utils/receipt';
import { downloadCsv, buildOrdersCsv } from '../../utils/csv';

// Type alias to handle both API and local Order types
type Order = OrderType & {
  orderNumber?: string;
  customerName?: string;
  items?: any[];
  tax?: number;
};

interface OrderHistoryPageProps {
  onBack: () => void;
  existingOrders?: Order[];
  restaurantName?: string;
  receiptSettings?: RestaurantReceiptSettings;
}

export function OrderHistoryPage({ onBack, existingOrders, restaurantName = '', receiptSettings = {} }: OrderHistoryPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancellationDetails, setCancellationDetails] = useState<CancellationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingLocalData, setUsingLocalData] = useState(false);
  const [exactTotalCount, setExactTotalCount] = useState<number | null>(null);
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false);
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  // Normalize orders from Supabase snake_case to camelCase
  const convertOrders = (orders: any[]): Order[] => {
    return orders.map(order => ({
      ...order,
      id: order.id,
      orderNumber: String(order.orderNumber || order.order_number || order.id || '').trim().slice(0, 7).toUpperCase(),
      tableNumber: order.tableNumber ?? order.table_number,
      customerName: order.customerName || order.customer_name,
      status: order.status,
      items: order.items || [],
      total: order.total || 0,
      subtotal: order.subtotal || 0,
      createdAt: order.createdAt ? new Date(order.createdAt) : new Date(order.created_at),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : new Date(order.updated_at || order.created_at),
    }));
  };

  // Fetch all orders on mount
  useEffect(() => {
    async function loadOrders() {
      try {
        setLoading(true);

        // Fetch the exact count independently — Supabase's server-side row cap
        // does not apply to count-only queries, so this is always accurate.
        fetchOrderCount().then(c => setExactTotalCount(c)).catch(() => {});

        // Use existing orders first (from parent state)
        if (existingOrders && existingOrders.length > 0) {
          setOrders(existingOrders);
          setUsingLocalData(false);
          setError(null);
          setLoading(false);
          return;
        }

        // Fetch from API
        const allOrders = await fetchOrders('all');
        if (allOrders.length > 0) {
          setOrders(convertOrders(allOrders));
          setUsingLocalData(false);
        } else {
          setOrders([]);
          setUsingLocalData(false);
        }
        setError(null);
      } catch (err) {
        console.warn('Failed to fetch orders from API:', err);
        setOrders([]);
        setUsingLocalData(false);
        setError('Unable to load orders from server.');
      } finally {
        setLoading(false);
      }
    }
    loadOrders();
  }, [existingOrders]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    const isConfirmed = (o: Order) =>
      (o as any).paymentStatus === 'confirmed' || (o as any).payment_status === 'confirmed';

    const nonCancelled = orders.filter(o => o.status !== 'cancelled');
    const servedOrders = orders.filter(o => o.status === 'served');

    const confirmedRevenue = nonCancelled
      .filter(isConfirmed)
      .reduce((sum, o) => sum + (typeof o.total === 'number' ? o.total : 0), 0);

    const unconfirmedRevenue = nonCancelled
      .filter(o => !isConfirmed(o))
      .reduce((sum, o) => sum + (typeof o.total === 'number' ? o.total : 0), 0);

    const displayedRevenue = includeUnconfirmed
      ? confirmedRevenue + unconfirmedRevenue
      : confirmedRevenue;

    const avgOrderValue = servedOrders.length > 0
      ? (confirmedRevenue + unconfirmedRevenue) / servedOrders.length
      : 0;

    return {
      totalOrders: exactTotalCount ?? orders.length,
      confirmedRevenue,
      unconfirmedRevenue,
      displayedRevenue,
      avgOrderValue,
      pendingCount: orders.filter(o => o.status === 'pending').length,
      servedCount: servedOrders.length,
    };
  }, [orders, exactTotalCount, includeUnconfirmed]);

  const handleExport = () => {
    downloadCsv('order-history.csv', buildOrdersCsv(orders as any));
  };

  const handleUpdateOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders(prev => prev.map(order => 
      order.id === orderId ? { ...order, status } : order
    ));
    setSelectedOrder(null);
  };

  const handleSelectOrder = async (order: Order) => {
    setSelectedOrder(order);
    setCancellationDetails(null);
    if (order.status === 'cancelled') {
      // Try the approval-workflow table first, then fall back to order fields
      const req = await fetchCancellationRequestByOrderId(order.id).catch(() => null);
      if (req) {
        setCancellationDetails({
          reason: req.reason || (order as any).cancel_reason || null,
          requestedByName: req.requested_by_name,
          requestedAt: req.requested_at,
          approvedByName: req.reviewed_by_name,
          approvedAt: req.reviewed_at,
        });
      } else {
        // Direct cancel — only reason is stored on the order itself
        const reason = (order as any).cancel_reason ?? (order as any).cancelReason ?? null;
        if (reason) {
          setCancellationDetails({
            reason,
            requestedByName: null,
            requestedAt: null,
            approvedByName: null,
            approvedAt: null,
          });
        }
      }
    }
  };

  const handleCancelOrder = (orderId: string) => {
    setVoidTargetId(orderId);
  };

  const handleVoidConfirmed = async (reason: string) => {
    if (!voidTargetId) return;
    const id = voidTargetId;
    setVoidTargetId(null);
    setIsVoiding(true);
    try {
      await cancelOrder(id, reason);
      handleUpdateOrderStatus(id, 'cancelled');
    } catch (err) {
      console.error('Failed to cancel order:', err);
      alert('Failed to cancel order. Please try again.');
    } finally {
      setIsVoiding(false);
    }
  };

  const handlePrintReceipt = (order: Order) => {
    const rawItems = Array.isArray(order.items)
      ? order.items
      : typeof order.items === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(order.items);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })()
        : [];

    const normalizedOrder = {
      ...order,
      items: rawItems,
    } as OrderType;

    try {
      const receiptData = orderToReceiptData(normalizedOrder, {
        restaurantName: restaurantName || 'Company',
        restaurantAddress: receiptSettings.address || '',
        restaurantPhone: receiptSettings.phone || '',
        restaurantEmail: receiptSettings.email || '',
        restaurantLogo: receiptSettings.logo,
        restaurantCity: receiptSettings.city,
        restaurantCountry: receiptSettings.country,
        restaurantMomoCode: receiptSettings.momoCode,
        taxRate: 0,
        serverName: 'Supervisor',
        orderType: order.deliveryAddress ? 'delivery' : order.tableNumber == null ? 'takeout' : 'dine-in',
        paymentStatus: 'pending',
        payments: [{ method: 'Pending', amount: 0 }],
      });
      printReceipt(buildReceiptHtml(receiptData));
    } catch (err) {
      console.error('Failed to print order history receipt:', err);
      alert('Could not open print window. Please allow pop-ups in your browser.');
    }
  };

  return (
    <div className="supervisor-surface min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 transition-colors">
      {/* Fixed Header with Back Button */}
      <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all duration-200 active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-100">
              Order History
            </h1>
            <p className="text-sm text-slate-400">
              View and analyze all past orders
              {usingLocalData && <span className="ml-2 text-amber-400">(Local Data)</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-8">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCartIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase">Total Orders</span>
              </div>
              <p className="text-2xl font-bold text-slate-100">{stats.totalOrders}</p>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileTextIcon className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400 uppercase">Served</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{stats.servedCount}</p>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <CalendarIcon className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-slate-400 uppercase">Pending</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400">{stats.pendingCount}</p>
            </Card>
          </motion.div>

          {/* Revenue card with confirmed / all toggle */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400 uppercase">
                  {includeUnconfirmed ? 'Total Revenue' : 'Confirmed Revenue'}
                </span>
                <button
                  onClick={() => setIncludeUnconfirmed(v => !v)}
                  title={includeUnconfirmed ? 'Showing all payments — click to show confirmed only' : 'Showing confirmed only — click to include unconfirmed'}
                  className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${includeUnconfirmed ? 'bg-amber-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 ${includeUnconfirmed ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-2xl font-bold text-amber-400">
                RWF {Math.round(stats.displayedRevenue).toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {includeUnconfirmed ? 'Confirmed + awaiting' : 'Confirmed only'}
              </p>
            </Card>
          </motion.div>

          {/* Unconfirmed / awaiting payment */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className={`backdrop-blur p-4 border ${stats.unconfirmedRevenue > 0 ? 'bg-orange-500/10 border-orange-500/40' : 'bg-slate-800/50 border-slate-700/50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs uppercase ${stats.unconfirmedRevenue > 0 ? 'text-orange-400' : 'text-slate-400'}`}>Awaiting Payment</span>
              </div>
              <p className={`text-2xl font-bold ${stats.unconfirmedRevenue > 0 ? 'text-orange-400' : 'text-slate-400'}`}>
                RWF {Math.round(stats.unconfirmedRevenue).toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Not yet confirmed</p>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-400 uppercase">Avg Order Value</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">
                RWF {Math.round(stats.avgOrderValue).toLocaleString()}
              </p>
            </Card>
          </motion.div>
        </div>

        {/* Orders Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.25 }}
        >
          <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50" padding="none">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <ShoppingCartIcon className="w-5 h-5" />
                  All Orders
                </h2>
              </div>
            </div>
            
            {loading ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-400">Loading orders...</p>
              </div>
            ) : error ? (
              <div className="p-12 text-center">
                <p className="text-red-400">{error}</p>
              </div>
            ) : (
              <OrdersHistoryTable
                orders={orders}
                onSelectOrder={handleSelectOrder}
                onExport={handleExport}
              />
            )}
          </Card>
        </motion.div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={selectedOrder as any}
        isOpen={!!selectedOrder}
        onClose={() => { setSelectedOrder(null); setCancellationDetails(null); }}
        onApprove={(order) => handleUpdateOrderStatus(order.id, 'verified')}
        onReject={(id) => handleUpdateOrderStatus(id, 'cancelled')}
        onCancel={handleCancelOrder}
        onMarkReady={(id) => handleUpdateOrderStatus(id, 'ready')}
        onMarkServed={(id) => handleUpdateOrderStatus(id, 'served')}
        onPrintReceipt={handlePrintReceipt}
        cancellationDetails={cancellationDetails}
      />

      {voidTargetId && (
        <VoidReasonModal
          orderLabel={`Order ${voidTargetId.slice(-8).toUpperCase()}`}
          isSubmitting={isVoiding}
          onConfirm={handleVoidConfirmed}
          onCancel={() => setVoidTargetId(null)}
        />
      )}
    </div>
  );
}
