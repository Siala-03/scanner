import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftIcon, PackageIcon, TruckIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  SupplierUser,
  SupplierOrder,
  SupplierStats,
  fetchSupplierOrders,
  fetchSupplierStats,
  confirmSupplierOrder,
  shipSupplierOrder,
  getSupplierToken,
  clearSupplierToken,
} from '../../api/supplier';
import { io } from 'socket.io-client';

interface SupplierDashboardProps {
  user: SupplierUser;
  onLogout: () => void;
}

type FilterTab = 'all' | 'pending' | 'active' | 'completed';

export function SupplierDashboard({ user, onLogout }: SupplierDashboardProps) {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [shipFormData, setShipFormData] = useState({ carrier: '', tracking_number: '' });

  const loadData = useCallback(async () => {
    try {
      const [ordersData, statsData] = await Promise.all([
        fetchSupplierOrders(filter === 'all' ? undefined : filter),
        fetchSupplierStats(),
      ]);
      setOrders(ordersData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const token = getSupplierToken();
    if (!token) return;

    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    socket.emit('join:supplier', user.supplierId);

    socket.on('order:new', (data: { orderId: string }) => {
      console.log('New order received:', data);
      loadData();
    });

    socket.on('order:received', (data: { orderId: string }) => {
      console.log('Order received by client:', data);
      loadData();
    });

    return () => {
      socket.disconnect();
    };
  }, [user.supplierId, loadData]);

  const handleConfirmOrder = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      await confirmSupplierOrder(orderId);
      await loadData();
    } catch (err) {
      console.error('Failed to confirm order:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleShipOrder = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      await shipSupplierOrder(orderId, shipFormData);
      setShipFormData({ carrier: '', tracking_number: '' });
      setSelectedOrder(null);
      await loadData();
    } catch (err) {
      console.error('Failed to ship order:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    clearSupplierToken();
    onLogout();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      draft: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
      sent: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      confirmed: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      shipped: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      partial: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
      received: { bg: 'bg-green-500/20', text: 'text-green-400' },
      cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
    };
    const style = styles[status] || styles.draft;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => {
        if (filter === 'pending') return ['sent', 'draft'].includes(o.status);
        if (filter === 'active') return ['confirmed', 'shipped', 'partial'].includes(o.status);
        if (filter === 'completed') return ['received', 'cancelled'].includes(o.status);
        return true;
      });

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">Supplier Dashboard</h1>
                <p className="text-sm text-slate-400">{user.supplierName}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.pending_orders || 0}</p>
                <p className="text-xs text-slate-400">Pending</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <TruckIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.shipped_orders || 0}</p>
                <p className="text-xs text-slate-400">Shipped</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.completed_orders || 0}</p>
                <p className="text-xs text-slate-400">Completed</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <PackageIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats ? (stats.pending_value / 100).toFixed(0) : 0}
                </p>
                <p className="text-xs text-slate-400">Pending Value (RWF)</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {(['all', 'pending', 'active', 'completed'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                filter === tab
                  ? 'bg-amber-500 text-slate-900'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <PackageIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No orders found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-800/50 rounded-xl border border-slate-700 p-4"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{order.restaurant_name || 'Unknown Client'}</span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-slate-400 text-sm">
                      Order #{order.id.slice(-8).toUpperCase()}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {new Date(order.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">
                      {(order.total_cost / 100).toFixed(2)} RWF
                    </p>
                    <p className="text-slate-400 text-sm">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {order.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1 bg-slate-700/50 rounded-lg text-sm text-slate-300"
                      >
                        {item.orderedQty}x {item.menuItemName}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {order.status === 'sent' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleConfirmOrder(order.id)}
                        disabled={actionLoading === order.id}
                      >
                        <CheckCircleIcon className="w-4 h-4 mr-1" />
                        {actionLoading === order.id ? 'Confirming...' : 'Confirm Order'}
                      </Button>
                    )}

                    {order.status === 'confirmed' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <TruckIcon className="w-4 h-4 mr-1" />
                        Mark as Shipped
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedOrder(order)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Order Details</h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Client</p>
                  <p className="text-white">{selectedOrder.restaurant_name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Status</p>
                  <p className="text-white">{getStatusBadge(selectedOrder.status)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Expected Delivery</p>
                  <p className="text-white">
                    {selectedOrder.expected_delivery
                      ? new Date(selectedOrder.expected_delivery).toLocaleDateString()
                      : 'Not specified'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Total</p>
                  <p className="text-white font-bold">
                    {(selectedOrder.total_cost / 100).toFixed(2)} RWF
                  </p>
                </div>
              </div>

              {selectedOrder.delivery_address && (
                <div>
                  <p className="text-slate-400 text-sm">Delivery Address</p>
                  <p className="text-white">{selectedOrder.delivery_address}</p>
                </div>
              )}

              <div>
                <p className="text-slate-400 text-sm mb-2">Items</p>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg"
                    >
                      <div>
                        <p className="text-white">{item.menuItemName}</p>
                        <p className="text-slate-400 text-sm">
                          {item.orderedQty} x {(item.unitCost / 100).toFixed(2)} RWF
                        </p>
                      </div>
                      <p className="text-white font-medium">
                        {(item.totalCost / 100).toFixed(2)} RWF
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.status === 'confirmed' && (
                <div className="border-t border-slate-700 pt-4 mt-4">
                  <h3 className="text-white font-medium mb-3">Ship Order</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Carrier (optional)</label>
                      <input
                        type="text"
                        value={shipFormData.carrier}
                        onChange={(e) => setShipFormData({ ...shipFormData, carrier: e.target.value })}
                        placeholder="e.g., DHL, FedEx, In-house"
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Tracking Number (optional)</label>
                      <input
                        type="text"
                        value={shipFormData.tracking_number}
                        onChange={(e) => setShipFormData({ ...shipFormData, tracking_number: e.target.value })}
                        placeholder="Enter tracking number"
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      />
                    </div>
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => handleShipOrder(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                    >
                      <TruckIcon className="w-4 h-4 mr-2" />
                      {actionLoading === selectedOrder.id ? 'Shipping...' : 'Confirm Shipment'}
                    </Button>
                  </div>
                </div>
              )}

              {selectedOrder.status_history && selectedOrder.status_history.length > 0 && (
                <div className="border-t border-slate-700 pt-4 mt-4">
                  <h3 className="text-white font-medium mb-3">Status History</h3>
                  <div className="space-y-2">
                    {selectedOrder.status_history.map((history) => (
                      <div key={history.id} className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <div className="flex-1">
                          <p className="text-white">
                            <span className="font-medium capitalize">{history.status}</span>
                            {' by '}
                            <span className="capitalize">{history.changed_by_type}</span>
                          </p>
                          {history.notes && (
                            <p className="text-slate-400">{history.notes}</p>
                          )}
                        </div>
                        <p className="text-slate-500 text-xs">
                          {new Date(history.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
