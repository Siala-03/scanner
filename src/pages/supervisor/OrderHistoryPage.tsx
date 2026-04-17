import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCartIcon, ArrowLeftIcon, FileTextIcon, CalendarIcon } from 'lucide-react';
import type { Order as OrderType, OrderStatus } from '../../types';
import { Card } from '../../components/ui/Card';
import { OrdersHistoryTable } from '../../components/supervisor/OrdersHistoryTable';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { fetchOrders } from '../../api/orders';
import { downloadCsv, buildOrdersCsv } from '../../utils/csv';
import { orderToReceiptData } from '../../utils/receipt';
import { printOrderReceipt } from '../../utils/sunmiPrinter';

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
}

export function OrderHistoryPage({ onBack, existingOrders }: OrderHistoryPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingLocalData, setUsingLocalData] = useState(false);

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
    const servedOrders = orders.filter(o => o.status === 'served');
    const totalRevenue = servedOrders.reduce((sum, o) => sum + (typeof o.total === 'number' ? o.total : 0), 0);
    const avgOrderValue = servedOrders.length > 0 ? totalRevenue / servedOrders.length : 0;
    
    return {
      totalOrders: orders.length,
      totalRevenue,
      avgOrderValue,
      pendingCount: orders.filter(o => o.status === 'pending').length,
      servedCount: servedOrders.length
    };
  }, [orders]);

  const handleExport = () => {
    downloadCsv('order-history.csv', buildOrdersCsv(orders as any));
  };

  const handleUpdateOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders(prev => prev.map(order => 
      order.id === orderId ? { ...order, status } : order
    ));
    setSelectedOrder(null);
  };

  const handlePrintReceipt = async (order: Order) => {
    const savedUser = (() => { try { return JSON.parse(localStorage.getItem('authUser') || '{}'); } catch { return {}; } })();
    const restaurantName = localStorage.getItem('restaurantName') || savedUser?.restaurantName || 'Company';
    const receiptOptions: Parameters<typeof orderToReceiptData>[1] = {
      restaurantName,
      restaurantAddress: '',
      restaurantPhone: '',
      restaurantEmail: '',
      taxRate: 0,
      serverName: savedUser?.name || 'Supervisor',
      orderType: order.deliveryAddress ? 'delivery' as const : 'dine-in' as const,
      paymentMethod: 'Cash',
      paymentStatus: 'paid' as const,
      amountPaid: order.total,
    };

    try {
      const receiptData = orderToReceiptData(order, receiptOptions);
      await printOrderReceipt(receiptData);
    } catch (error) {
      console.error('Error generating receipt:', error);
      window.print();
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

      <div className="max-w-6xl mx-auto p-4 md:p-6">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0 }}
          >
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCartIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase">Total Orders</span>
              </div>
              <p className="text-2xl font-bold text-slate-100">{stats.totalOrders}</p>
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.05 }}
          >
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileTextIcon className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400 uppercase">Served</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{stats.servedCount}</p>
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <CalendarIcon className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-slate-400 uppercase">Pending</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400">{stats.pendingCount}</p>
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.15 }}
          >
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-400 uppercase">Total Revenue</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">
                RWF {stats.totalRevenue.toLocaleString()}
              </p>
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-400 uppercase">Avg Order Value</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">
                RWF {stats.avgOrderValue.toLocaleString()}
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
                onSelectOrder={setSelectedOrder}
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
        onClose={() => setSelectedOrder(null)}
        onApprove={(order) => handleUpdateOrderStatus(order.id, 'verified')}
        onReject={(id) => handleUpdateOrderStatus(id, 'cancelled')}
        onMarkReady={(id) => handleUpdateOrderStatus(id, 'ready')}
        onMarkServed={(id) => handleUpdateOrderStatus(id, 'served')}
        onPrintReceipt={handlePrintReceipt}
      />
    </div>
  );
}
