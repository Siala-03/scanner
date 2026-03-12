import { useState, useEffect } from 'react';
import { ClockIcon, ChefHatIcon, UtensilsIcon, RefreshCwIcon, CheckCircleIcon } from 'lucide-react';

// Simple hardcoded order type
interface KitchenOrder {
  id: string;
  orderNumber: string;
  tableNumber: number;
  status: 'pending' | 'preparing' | 'ready';
  items: { name: string; quantity: number; notes?: string }[];
  createdAt: Date;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500' },
  preparing: { label: 'Preparing', color: 'bg-blue-500/20 text-blue-400 border-blue-500' },
  ready: { label: 'Ready', color: 'bg-green-500/20 text-green-400 border-green-500' },
};

export function KitchenDisplay() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Load initial mock orders
  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      const mockOrders: KitchenOrder[] = [
        {
          id: '1',
          orderNumber: 'ORD-001',
          tableNumber: 5,
          status: 'pending',
          items: [
            { name: 'Breakfast Platter', quantity: 2 },
            { name: 'Fresh Juice', quantity: 2, notes: 'No ice' }
          ],
          createdAt: new Date(Date.now() - 5 * 60 * 1000)
        },
        {
          id: '2',
          orderNumber: 'ORD-002',
          tableNumber: 8,
          status: 'preparing',
          items: [
            { name: 'Grilled Chicken', quantity: 1 },
            { name: 'Rice', quantity: 1 }
          ],
          createdAt: new Date(Date.now() - 12 * 60 * 1000)
        },
        {
          id: '3',
          orderNumber: 'ORD-003',
          tableNumber: 12,
          status: 'ready',
          items: [
            { name: 'Fish and Chips', quantity: 1, notes: 'Extra tartare' }
          ],
          createdAt: new Date(Date.now() - 20 * 60 * 1000)
        }
      ];
      setOrders(mockOrders);
      setLoading(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  const handleStatusChange = (orderId: string, newStatus: 'pending' | 'preparing' | 'ready') => {
    setOrders(prev => prev.map(o => 
      o.id === orderId ? { ...o, status: newStatus } : o
    ));
  };

  const handleComplete = (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <ChefHatIcon className="w-16 h-16 text-amber-400 animate-pulse mx-auto mb-4" />
          <p className="text-slate-400">Loading kitchen orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ChefHatIcon className="w-8 h-8 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Kitchen Display</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-slate-400 flex items-center gap-2">
            <ClockIcon className="w-5 h-5" />
            <span>{orders.length} active orders</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-20">
          <UtensilsIcon className="w-24 h-24 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-xl">No active orders</p>
          <p className="text-slate-500">New orders will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-slate-800 rounded-xl border-2 border-slate-700 overflow-hidden"
            >
              {/* Order Header */}
              <div className="bg-slate-700/50 px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-white font-bold">{order.orderNumber}</span>
                  <span className="text-slate-400 ml-2">Table {order.tableNumber}</span>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_CONFIG[order.status].color}`}>
                  {STATUS_CONFIG[order.status].label}
                </span>
              </div>

              {/* Items */}
              <div className="p-4">
                <div className="space-y-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start">
                      <div className="text-white">
                        <span className="font-medium">{item.quantity}x</span> {item.name}
                      </div>
                    </div>
                  ))}
                </div>
                {order.items.some(i => i.notes) && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-amber-400 text-sm">
                      {order.items.find(i => i.notes)?.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 flex gap-2">
                {order.status === 'pending' && (
                  <button
                    onClick={() => handleStatusChange(order.id, 'preparing')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition"
                  >
                    Start Preparing
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button
                    onClick={() => handleStatusChange(order.id, 'ready')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition"
                  >
                    Mark Ready
                  </button>
                )}
                {order.status === 'ready' && (
                  <button
                    onClick={() => handleComplete(order.id)}
                    className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
