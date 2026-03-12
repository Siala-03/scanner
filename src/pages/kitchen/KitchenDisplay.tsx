import { useState, useEffect, useCallback } from 'react';
import { ClockIcon, ChefHatIcon, UtensilsIcon, RefreshCwIcon, CheckCircleIcon, FlameIcon, AlertTriangleIcon, BarChart3Icon, ListOrderedIcon } from 'lucide-react';

// Backend API
const API_BASE = '/api';

interface KitchenOrder {
  id: string;
  orderNumber: string;
  tableNumber: number;
  status: 'pending' | 'preparing' | 'ready';
  items: { name: string; quantity: number; notes?: string }[];
  notes?: string;  // Order-level notes (allergies, special requests)
  createdAt: string;
}

interface KitchenStats {
  totalOrders: number;
  completedOrders: number;
  avgPrepTime: number;
  pendingOrders: number;
  preparingOrders: number;
  readyOrders: number;
  itemCounts: { name: string; count: number }[];
}

const STATUS_CONFIG = {
  pending: { 
    label: 'NEW', 
    color: 'bg-blue-600', 
    textColor: 'text-white',
    borderColor: 'border-blue-500',
    pulse: true
  },
  preparing: { 
    label: 'COOKING', 
    color: 'bg-amber-500', 
    textColor: 'text-white',
    borderColor: 'border-amber-500',
    pulse: false
  },
  ready: { 
    label: 'READY', 
    color: 'bg-emerald-600', 
    textColor: 'text-white',
    borderColor: 'border-emerald-500',
    pulse: false
  },
};

function getUrgency(createdAt: string): 'urgent' | 'normal' | 'ok' {
  const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (minutes > 15) return 'urgent';
  if (minutes > 8) return 'normal';
  return 'ok';
}

function formatTime(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

async function fetchKitchenOrders(): Promise<KitchenOrder[]> {
  try {
    const res = await fetch(`${API_BASE}/orders/kitchen`);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return data.map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      tableNumber: o.table_number,
      status: o.status,
      notes: o.notes,  // Order-level notes (allergies, special requests)
      items: Array.isArray(o.items) ? o.items.map((item: any) => ({
        name: item.menuItemName || 'Unknown',
        quantity: item.quantity,
        notes: item.notes  // Item-level notes
      })) : [],
      createdAt: o.created_at
    }));
  } catch (e) {
    console.error('Failed to fetch from API:', e);
    return [];
  }
}

async function fetchKitchenAnalytics(): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/orders/kitchen/analytics`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch analytics:', e);
    return null;
  }
}

async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error('Failed to update');
}

// Calculate stats from orders
function calculateStats(orders: KitchenOrder[], completedToday: number[]): KitchenStats {
  const itemCounts: Record<string, number> = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
    });
  });
  
  const itemCountsArray = Object.entries(itemCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalOrders: orders.length + completedToday.length,
    completedOrders: completedToday.length,
    avgPrepTime: 12, // Demo value
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    preparingOrders: orders.filter(o => o.status === 'preparing').length,
    readyOrders: orders.filter(o => o.status === 'ready').length,
    itemCounts: itemCountsArray
  };
}

export function KitchenDisplay() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [completedToday, setCompletedToday] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'orders' | 'analytics'>('orders');
  const [analytics, setAnalytics] = useState<any>(null);

  // Use analytics from backend when available, otherwise calculate from orders
  const stats: KitchenStats = analytics ? {
    totalOrders: analytics.totalOrders || 0,
    completedOrders: analytics.completedOrders || 0,
    avgPrepTime: analytics.avgPrepTime || 0,
    pendingOrders: analytics.pendingOrders || orders.filter(o => o.status === 'pending').length,
    preparingOrders: analytics.preparingOrders || orders.filter(o => o.status === 'preparing').length,
    readyOrders: analytics.readyOrders || orders.filter(o => o.status === 'ready').length,
    itemCounts: analytics.popularItems || []
  } : calculateStats(orders, completedToday);

  const loadOrders = useCallback(async () => {
    const [data, analyticsData] = await Promise.all([
      fetchKitchenOrders(),
      fetchKitchenAnalytics()
    ]);
    
    if (data.length > 0) {
      setOrders(data);
      setAnalytics(analyticsData);
      setUsingFallback(false);
      setLastUpdate(new Date());
    } else {
      setUsingFallback(true);
      setOrders([
        {
          id: 'demo-1',
          orderNumber: 'ORD-001',
          tableNumber: 5,
          status: 'pending',
          notes: '⚠️ ALLERGY: Nut allergy - no nuts or nut sauces',  // Order-level notes
          items: [
            { name: 'Breakfast Platter', quantity: 2 },
            { name: 'Fresh Juice', quantity: 2, notes: 'No ice' }
          ],
          createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
        },
        {
          id: 'demo-2',
          orderNumber: 'ORD-002',
          tableNumber: 8,
          status: 'preparing',
          notes: 'Gluten-free plate needed',
          items: [
            { name: 'Grilled Chicken', quantity: 1 },
            { name: 'Rice', quantity: 1 },
            { name: 'House Salad', quantity: 1 }
          ],
          createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
        },
        {
          id: 'demo-3',
          orderNumber: 'ORD-003',
          tableNumber: 12,
          status: 'ready',
          items: [
            { name: 'Fish and Chips', quantity: 2, notes: 'Extra tartare' }
          ],
          createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString()
        },
        {
          id: 'demo-4',
          orderNumber: 'ORD-004',
          tableNumber: 3,
          status: 'pending',
          notes: '⚠️ ALLERGY: Shellfish allergy - avoid all seafood',
          items: [
            { name: 'Pancakes Stack', quantity: 1 },
            { name: 'Coffee', quantity: 2 }
          ],
          createdAt: new Date(Date.now() - 1 * 60 * 1000).toISOString()
        }
      ]);
      // Demo analytics
      setAnalytics({
        totalOrders: 24,
        completedOrders: 18,
        avgPrepTime: 12,
        pendingOrders: 4,
        preparingOrders: 2,
        readyOrders: 2,
        popularItems: [
          { name: 'Breakfast Platter', count: 8 },
          { name: 'Grilled Chicken', count: 6 },
          { name: 'Fish and Chips', count: 5 },
          { name: 'Pancakes Stack', count: 4 },
          { name: 'Fresh Juice', count: 3 }
        ]
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleStatusChange = async (orderId: string, newStatus: 'pending' | 'preparing' | 'ready') => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (e) {
      console.error('Failed to update status:', e);
    }
    if (newStatus === 'ready') {
      setCompletedToday(prev => [...prev, Date.now()]);
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };

  const handleComplete = async (orderId: string) => {
    try {
      await updateOrderStatus(orderId, 'served');
    } catch (e) {
      console.error('Failed to complete:', e);
    }
    setCompletedToday(prev => [...prev, Date.now()]);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // Group orders by status
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 text-lg">Connecting to kitchen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-950/80 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <ChefHatIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Kitchen Display</h1>
              <p className="text-slate-400 text-sm">Real-time order management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('orders')}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all ${viewMode === 'orders' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <ListOrderedIcon className="w-4 h-4" />
                Orders
              </button>
              <button
                onClick={() => setViewMode('analytics')}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all ${viewMode === 'analytics' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <BarChart3Icon className="w-4 h-4" />
                Analytics
              </button>
            </div>

            <div className="h-10 w-px bg-slate-700"></div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-slate-400">Last update</div>
                <div className="text-white font-mono">{lastUpdate.toLocaleTimeString()}</div>
              </div>
              <button
                onClick={loadOrders}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all hover:rotate-180 duration-500"
              >
                <RefreshCwIcon className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6">
        {viewMode === 'analytics' ? (
          // Analytics View
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Orders" value={stats.totalOrders.toString()} color="blue" />
              <StatCard title="Completed" value={stats.completedOrders.toString()} color="green" />
              <StatCard title="In Progress" value={(stats.pendingOrders + stats.preparingOrders).toString()} color="amber" />
              <StatCard title="Avg Prep Time" value={`${stats.avgPrepTime} min`} color="purple" />
            </div>

            {/* More Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Status Breakdown */}
              <div className="bg-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Order Status</h3>
                <div className="space-y-4">
                  <ProgressBar label="Pending" value={stats.pendingOrders} total={stats.totalOrders || 1} color="blue" />
                  <ProgressBar label="Preparing" value={stats.preparingOrders} total={stats.totalOrders || 1} color="amber" />
                  <ProgressBar label="Ready" value={stats.readyOrders} total={stats.totalOrders || 1} color="green" />
                </div>
              </div>

              {/* Popular Items */}
              <div className="bg-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Popular Items Today</h3>
                <div className="space-y-3">
                  {stats.itemCounts.length > 0 ? (
                    stats.itemCounts.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-slate-700 rounded flex items-center justify-center text-slate-400 text-sm">{idx + 1}</span>
                          <span className="text-white">{item.name}</span>
                        </div>
                        <span className="text-slate-400 font-bold">{item.count}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500">No orders yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Orders View
          <>
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh]">
                <div className="w-32 h-32 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                  <UtensilsIcon className="w-16 h-16 text-slate-600" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">All caught up!</h2>
                <p className="text-slate-500">No pending orders in the queue</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pending Column */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <h2 className="text-lg font-bold text-blue-400 uppercase tracking-wider">New Orders</h2>
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-sm font-bold">{pendingOrders.length}</span>
                  </div>
                  {pendingOrders.map(order => (
                    <OrderCard 
                      key={order.id} 
                      order={order} 
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                    />
                  ))}
                </div>

                {/* Preparing Column */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                    <h2 className="text-lg font-bold text-amber-400 uppercase tracking-wider">Cooking</h2>
                    <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-sm font-bold">{preparingOrders.length}</span>
                  </div>
                  {preparingOrders.map(order => (
                    <OrderCard 
                      key={order.id} 
                      order={order} 
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                    />
                  ))}
                </div>

                {/* Ready Column */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <h2 className="text-lg font-bold text-green-400 uppercase tracking-wider">Ready</h2>
                    <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-sm font-bold">{readyOrders.length}</span>
                  </div>
                  {readyOrders.map(order => (
                    <OrderCard 
                      key={order.id} 
                      order={order} 
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {usingFallback && (
          <div className="fixed bottom-4 left-4 bg-amber-500/20 border border-amber-500 text-amber-400 px-4 py-2 rounded-lg flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4" />
            <span className="text-sm">Demo Mode - No backend connected</span>
          </div>
        )}
      </main>
    </div>
  );
}

// Order Card Component
function OrderCard({ 
  order, 
  onStatusChange, 
  onComplete 
}: { 
  order: KitchenOrder; 
  onStatusChange: (id: string, status: any) => void;
  onComplete: (id: string) => void;
}) {
  const urgency = getUrgency(order.createdAt);
  const config = STATUS_CONFIG[order.status];

  return (
    <div className={`bg-slate-800 rounded-2xl overflow-hidden border-2 ${config.borderColor} shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]`}>
      {/* Header */}
      <div className={`${config.color} ${config.textColor} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{order.orderNumber}</span>
          <span className="text-lg opacity-90">Table {order.tableNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          {config.pulse && <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>}
          <span className="font-bold">{config.label}</span>
        </div>
      </div>

      {/* Time & Urgency */}
      <div className="px-4 py-2 bg-slate-750 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-2 text-slate-400">
          <ClockIcon className="w-4 h-4" />
          <span className="font-mono">{formatTime(order.createdAt)}</span>
        </div>
        {urgency === 'urgent' && (
          <div className="flex items-center gap-1 text-orange-400 text-sm font-bold animate-pulse">
            <FlameIcon className="w-4 h-4" />
            <span>WAITING</span>
          </div>
        )}
        {urgency === 'normal' && (
          <div className="flex items-center gap-1 text-amber-400 text-sm font-bold">
            <AlertTriangleIcon className="w-4 h-4" />
            <span>SOON</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="p-4 space-y-2">
        {/* Order-level notes (allergies, special requests) */}
        {order.notes && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-3">
            <div className="text-red-400 text-sm font-bold">📋 NOTES:</div>
            <div className="text-white text-sm">{order.notes}</div>
          </div>
        )}
        {order.items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <span className="bg-slate-700 text-white w-6 h-6 rounded flex items-center justify-center text-sm font-bold">
              {item.quantity}
            </span>
            <div className="flex-1">
              <div className="text-white font-medium">{item.name}</div>
              {item.notes && (
                <div className="text-amber-400 text-sm">→ {item.notes}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-4 pt-0">
        {order.status === 'pending' && (
          <button
            onClick={() => onStatusChange(order.id, 'preparing')}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Start Cooking
          </button>
        )}
        {order.status === 'preparing' && (
          <button
            onClick={() => onStatusChange(order.id, 'ready')}
            className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Mark Ready
          </button>
        )}
        {order.status === 'ready' && (
          <button
            onClick={() => onComplete(order.id)}
            className="w-full bg-slate-600 hover:bg-slate-500 text-white py-3 rounded-xl font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <CheckCircleIcon className="w-5 h-5" />
            Complete
          </button>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500 text-blue-400',
    green: 'bg-green-500/20 border-green-500 text-green-400',
    amber: 'bg-amber-500/20 border-amber-500 text-amber-400',
    purple: 'bg-purple-500/20 border-purple-500 text-purple-400',
  };
  
  return (
    <div className={`bg-slate-800 rounded-2xl p-6 border-2 ${colorClasses[color]}`}>
      <div className="text-slate-400 text-sm uppercase tracking-wider mb-2">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = Math.round((value / total) * 100);
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
  };
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-bold">{value} ({percentage}%)</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colorClasses[color]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
