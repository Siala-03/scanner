import { useState, useEffect, useCallback, useMemo } from 'react';
import { ClockIcon, ChefHatIcon, UtensilsIcon, RefreshCwIcon, CheckCircleIcon, FlameIcon, AlertTriangleIcon, BarChart3Icon, ListOrderedIcon, TrendingUpIcon, LogOutIcon, PrinterIcon } from 'lucide-react';
import { useSocket } from '../../hooks/useSocket';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { KPICard } from '../../components/supervisor/KPICard';
import { fetchKitchenOrders as fetchKitchenOrdersFromDb, updateOrderStatus as updateOrderStatusApi } from '../../api/orders';
import { fetchRestaurantPublic } from '../../api/restaurants';
import { apiRequest } from '../../api/http';
import { buildKitchenTicketHtml, printKitchenTicket } from '../../utils/receipt';

interface KitchenOrder {
  id: string;
  orderNumber: string;
  tableNumber: number;
  status: 'pending' | 'verified' | 'preparing' | 'ready';
  items: { name: string; quantity: number; notes?: string }[];
  notes?: string;  // Order-level notes (allergies, special requests)
  createdAt: string;
  loyaltyFreeItemId?: string;
  loyaltyDiscount?: number;
  requiresKitchen?: boolean;
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

interface BackendAnalytics {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  preparingOrders: number;
  readyOrders: number;
  avgPrepTime: number;
  popularItems: { name: string; count: number }[];
  hourlyDistribution: { hour: number; count: number }[];
  totalRevenue: number;
}

const STATUS_CONFIG = {
  pending: { 
    label: 'NEW', 
    color: 'bg-blue-500/20', 
    textColor: 'text-blue-300',
    borderColor: 'border-blue-500',
    pulse: true
  },
  verified: {
    label: 'VERIFIED',
    color: 'bg-cyan-500/20',
    textColor: 'text-cyan-300',
    borderColor: 'border-cyan-500',
    pulse: true
  },
  preparing: { 
    label: 'COOKING',
    color: 'bg-amber-500/20',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-500',
    pulse: false
  },
  ready: { 
    label: 'READY', 
    color: 'bg-emerald-500/20', 
    textColor: 'text-emerald-300',
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

function getAgeMinutes(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

async function fetchKitchenOrders(restaurantId?: string): Promise<KitchenOrder[]> {
  try {
    const data = await fetchKitchenOrdersFromDb(restaurantId);
    return data
      // Show orders unless explicitly marked as non-kitchen (e.g. drinks).
      // null/undefined means the column may not exist in this schema — show by default.
      .filter((o: any) => (o.requiresKitchen ?? o.requires_kitchen) !== false)
      .map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber || o.order_number,
        tableNumber: o.tableNumber || o.table_number,
        status: o.status,
        notes: o.notes,
        items: Array.isArray(o.items) ? o.items.map((item: any) => ({
          name: item.menuItem?.name || item.menuItemName || item.menu_item_name || getMenuItemName(item.menuItemId || item.menu_item_id || item.id),
          quantity: item.quantity ?? 1,
          notes: item.notes ?? item.specialInstructions
        })) : [],
        createdAt: o.createdAt || o.created_at,
        loyaltyFreeItemId: o.loyaltyFreeItemId || o.loyalty_free_item_id,
        loyaltyDiscount: o.loyaltyDiscount || o.loyalty_discount,
        requiresKitchen: o.requiresKitchen ?? o.requires_kitchen
      }));
  } catch (e) {
    console.error('Failed to fetch from API:', e);
    return [];
  }
}


async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  await updateOrderStatusApi(orderId, { status: status as any });
}

// Simple menu item lookup for free items (in production, fetch from API)
const MENU_ITEM_NAMES: Record<string, string> = {
  'item-1': 'Breakfast Platter',
  'item-2': 'Fresh Juice',
  'item-3': 'Grilled Chicken',
  'item-4': 'Rice',
  'item-5': 'Fish and Chips',
  // Add more as needed
};

function getMenuItemName(itemId: string): string {
  return MENU_ITEM_NAMES[itemId] || `Item ${itemId}`;
}

// Calculate live queue stats from active orders (session-only item counts)
function calculateStats(orders: KitchenOrder[]): KitchenStats {
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
    totalOrders: orders.length,
    completedOrders: 0,
    avgPrepTime: 0,
    pendingOrders: orders.filter(o => o.status === 'pending' || o.status === 'verified').length,
    preparingOrders: orders.filter(o => o.status === 'preparing').length,
    readyOrders: orders.filter(o => o.status === 'ready').length,
    itemCounts: itemCountsArray
  };
}

export function KitchenDisplay({ onLogout, restaurantId, restaurantName }: { onLogout?: () => void; restaurantId?: string; restaurantName?: string } = {}) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [completedToday, setCompletedToday] = useState<number[]>([]);
  const [backendAnalytics, setBackendAnalytics] = useState<BackendAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'orders' | 'analytics'>('orders');
  const [resolvedRestaurantName, setResolvedRestaurantName] = useState<string>(restaurantName || '');
  const { socket, joinOrders, joinRestaurant } = useSocket();
  const { kpis: staffKPIs, refetch: refetchStaffKPIs } = useStaffKPIs();

  useEffect(() => {
    setResolvedRestaurantName(restaurantName || '');
  }, [restaurantName]);

  useEffect(() => {
    let active = true;
    if (restaurantName || !restaurantId) return;

    fetchRestaurantPublic(restaurantId)
      .then((restaurant: { name?: string }) => {
        if (!active) return;
        setResolvedRestaurantName(restaurant?.name || '');
      })
      .catch(() => {
        if (!active) return;
        setResolvedRestaurantName('');
      });

    return () => {
      active = false;
    };
  }, [restaurantId, restaurantName]);

  const handleKitchenSocketUpdate = useCallback((data: any) => {
    const rawOrder = data?.order;
    if (!rawOrder) return;

    const orderRestaurantId = rawOrder.restaurantId || rawOrder.restaurant_id;
    // Accept orders from matching restaurant or unassigned restaurants
    if (restaurantId && orderRestaurantId && orderRestaurantId !== restaurantId) return;

    const requiresKitchen = rawOrder.requiresKitchen ?? rawOrder.requires_kitchen;
    // Hide only if explicitly marked as non-kitchen (e.g. pure drink orders).
    if (requiresKitchen === false) return;

    const status = rawOrder.status;
    if (!['pending', 'verified', 'preparing', 'ready'].includes(status)) return;

    const normalizedOrder: KitchenOrder = {
      id: rawOrder.id,
      orderNumber: String(rawOrder.orderNumber || rawOrder.order_number || rawOrder.id || '').trim().slice(0, 7).toUpperCase(),
      tableNumber: rawOrder.tableNumber ?? rawOrder.table_number,
      status,
      notes: rawOrder.notes || rawOrder.note,
      items: Array.isArray(rawOrder.items)
        ? rawOrder.items.map((item: any) => ({
            name: item.menuItem?.name || item.menuItemName || item.menu_item_name || getMenuItemName(item.menuItemId || item.menu_item_id || item.id),
            quantity: item.quantity ?? 1,
            notes: item.notes ?? item.specialInstructions ?? item.special_instructions
          }))
        : [],
      createdAt: rawOrder.createdAt || rawOrder.created_at,
      loyaltyFreeItemId: rawOrder.loyaltyFreeItemId || rawOrder.loyalty_free_item_id,
      loyaltyDiscount: rawOrder.loyaltyDiscount || rawOrder.loyalty_discount,
      requiresKitchen
    };

    setOrders((prev) => {
      const index = prev.findIndex((order) => order.id === normalizedOrder.id);
      if (index >= 0) {
        return prev.map((order) => (order.id === normalizedOrder.id ? normalizedOrder : order));
      }
      return [normalizedOrder, ...prev];
    });
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    joinOrders();
    joinRestaurant(restaurantId);
    socket.on('order:update', handleKitchenSocketUpdate);
    return () => {
      socket.off('order:update', handleKitchenSocketUpdate);
    };
  }, [restaurantId, joinOrders, joinRestaurant, socket, handleKitchenSocketUpdate]);

  const handlePrintKOT = (order: KitchenOrder) => {
    const html = buildKitchenTicketHtml({
      restaurantName: resolvedRestaurantName || 'Kitchen',
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      status: order.status,
      createdAt: order.createdAt,
      items: order.items,
      notes: order.notes,
      loyaltyDiscount: order.loyaltyDiscount,
      loyaltyFreeItemName: order.loyaltyFreeItemId ? getMenuItemName(order.loyaltyFreeItemId) : undefined,
    });
    printKitchenTicket(html);
  };

  const liveStats: KitchenStats = calculateStats(orders);
  const stats: KitchenStats = backendAnalytics
    ? {
        totalOrders: backendAnalytics.totalOrders,
        completedOrders: backendAnalytics.completedOrders,
        avgPrepTime: backendAnalytics.avgPrepTime,
        pendingOrders: liveStats.pendingOrders,
        preparingOrders: liveStats.preparingOrders,
        readyOrders: liveStats.readyOrders,
        itemCounts: (backendAnalytics.popularItems ?? []).length > 0 ? backendAnalytics.popularItems : liveStats.itemCounts,
      }
    : liveStats;

  const now = Date.now();
  const sessionThroughputLastHour = completedToday.filter((ts) => now - ts <= 60 * 60 * 1000).length;
  const throughputLastHour = backendAnalytics ? backendAnalytics.completedOrders : sessionThroughputLastHour;
  const urgentOrdersCount = orders.filter((o) => getAgeMinutes(o.createdAt) > 15).length;
  const averageQueueAge = orders.length > 0
    ? Math.round(orders.reduce((sum, order) => sum + getAgeMinutes(order.createdAt), 0) / orders.length)
    : 0;

  const waitDistribution = useMemo(() => {
    const groups = {
      healthy: 0,
      watch: 0,
      critical: 0,
    };

    orders.forEach((order) => {
      const age = getAgeMinutes(order.createdAt);
      if (age <= 7) groups.healthy += 1;
      else if (age <= 15) groups.watch += 1;
      else groups.critical += 1;
    });

    return groups;
  }, [orders]);

  const hourlyLoad = useMemo(() => {
    const buckets = Array.from({ length: 8 }).map((_, index) => {
      const bucketDate = new Date(now - (7 - index) * 60 * 60 * 1000);
      const hourKey = bucketDate.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false });
      return { hour: `${hourKey}:00`, count: 0 };
    });

    orders.forEach((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      buckets.forEach((bucket, index) => {
        const from = now - (8 - index) * 60 * 60 * 1000;
        const to = now - (7 - index) * 60 * 60 * 1000;
        if (createdAt >= from && createdAt < to) {
          bucket.count += 1;
        }
      });
    });

    return buckets;
  }, [orders, now]);

  const maxHourlyLoad = Math.max(1, ...hourlyLoad.map((bucket) => bucket.count));

  const delayedOrders = useMemo(
    () => [...orders].sort((a, b) => getAgeMinutes(b.createdAt) - getAgeMinutes(a.createdAt)).slice(0, 5),
    [orders]
  );

  const kitchenHealthTone = urgentOrdersCount > 0
    ? 'text-red-300 border-red-500/30 bg-red-500/10'
    : orders.length > 0
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';

  const loadOrders = useCallback(async () => {
    const data = await fetchKitchenOrders(restaurantId);
    setOrders(data);
    setLastUpdate(new Date());
    setLoading(false);
  }, [restaurantId]);

  const loadAnalytics = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await apiRequest<BackendAnalytics>(
        `/api/orders/kitchen/analytics?restaurantId=${restaurantId}`
      );
      setBackendAnalytics(data);
    } catch {
      // silently fail — analytics are non-critical
    }
  }, [restaurantId]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, [loadAnalytics]);

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
    window.dispatchEvent(new Event('ordersUpdated'));
    refetchStaffKPIs();
  };

  const handleComplete = async (orderId: string) => {
    try {
      await updateOrderStatus(orderId, 'served');
    } catch (e) {
      console.error('Failed to complete:', e);
    }
    setCompletedToday(prev => [...prev, Date.now()]);
    setOrders(prev => prev.filter(o => o.id !== orderId));
    window.dispatchEvent(new Event('ordersUpdated'));
    refetchStaffKPIs();
  };

  // Group orders by status
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'verified');
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
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-800/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10">
              <ChefHatIcon className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Kitchen Portal</p>
              <h1 className="text-2xl font-semibold text-white">{resolvedRestaurantName || 'Company Kitchen'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-700">
              <button
                onClick={() => setViewMode('orders')}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${viewMode === 'orders' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <ListOrderedIcon className="w-4 h-4" />
                Orders
              </button>
              <button
                onClick={() => setViewMode('analytics')}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${viewMode === 'analytics' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
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
                className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all hover:rotate-180 duration-500"
              >
                <RefreshCwIcon className="w-5 h-5 text-slate-300" />
              </button>
              <button
                onClick={onLogout}
                className="p-3 bg-slate-700 hover:bg-red-600 hover:text-white rounded-lg transition-colors text-slate-200"
                title="Logout"
              >
                <LogOutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-5 rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Kitchen Command Center</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-100">Shift Overview</h2>
              <p className="mt-1 text-sm text-slate-400">
                Live prep visibility across new, cooking, and ready queues.
              </p>
            </div>
            <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${kitchenHealthTone}`}>
              {orders.length === 0 ? 'No queue pressure' : urgentOrdersCount > 0 ? `${urgentOrdersCount} urgent order${urgentOrdersCount !== 1 ? 's' : ''}` : 'Queue under control'}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard title="Active Queue" value={orders.length.toString()} color="blue" />
            <StatCard title="Ready For Handoff" value={readyOrders.length.toString()} color="green" />
            <StatCard title="Avg Queue Age" value={formatDuration(averageQueueAge)} color="amber" />
            <StatCard title={backendAnalytics ? 'Completed Today' : 'Completed (1h)'} value={throughputLastHour.toString()} color="purple" />
          </div>
        </div>

        {/* Staff KPIs Section */}
        {staffKPIs.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Your KPIs</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {staffKPIs.map((kpi) => (
                <KPICard
                  key={kpi.id}
                  label={kpi.name}
                  value={kpi.progress?.currentValue || 0}
                  change={kpi.progress ? (kpi.progress.currentValue / kpi.target_value) * 100 - 100 : 0}
                  trend={kpi.progress?.achieved ? 'up' : 'neutral'}
                  icon={<TrendingUpIcon className="w-5 h-5" />}
                />
              ))}
            </div>
          </div>
        )}

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-2">Queue Health Distribution</h3>
                <p className="text-sm text-slate-400 mb-4">Orders grouped by waiting time.</p>
                <div className="space-y-3">
                  <ProgressBar label="Healthy (0-7 min)" value={waitDistribution.healthy} total={orders.length || 1} color="green" />
                  <ProgressBar label="Watch (8-15 min)" value={waitDistribution.watch} total={orders.length || 1} color="amber" />
                  <ProgressBar label="Critical (>15 min)" value={waitDistribution.critical} total={orders.length || 1} color="blue" />
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-2">Hourly Kitchen Load</h3>
                <p className="text-sm text-slate-400 mb-4">Incoming order volume over the last 8 hours.</p>
                <div className="space-y-3">
                  {hourlyLoad.map((bucket) => (
                    <div key={bucket.hour}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-400">{bucket.hour}</span>
                        <span className="font-semibold text-slate-100">{bucket.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full bg-sky-400"
                          style={{ width: `${Math.round((bucket.count / maxHourlyLoad) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* More Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Status Breakdown */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-4">Order Status</h3>
                <div className="space-y-4">
                  <ProgressBar label="Pending" value={stats.pendingOrders} total={stats.totalOrders || 1} color="blue" />
                  <ProgressBar label="Preparing" value={stats.preparingOrders} total={stats.totalOrders || 1} color="amber" />
                  <ProgressBar label="Ready" value={stats.readyOrders} total={stats.totalOrders || 1} color="green" />
                </div>
              </div>

              {/* Popular Items */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
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

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-2">Most Delayed Active Orders</h3>
              <p className="text-sm text-slate-400 mb-4">Orders with the longest current queue time.</p>
              {delayedOrders.length === 0 ? (
                <p className="text-slate-500">No active delayed orders.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {delayedOrders.map((order) => {
                    const age = getAgeMinutes(order.createdAt);
                    return (
                      <div key={order.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-100">#{order.orderNumber}</span>
                          <span className="text-xs text-slate-400">Table {order.tableNumber}</span>
                        </div>
                        <div className="mt-2 text-sm text-slate-300">Status: {STATUS_CONFIG[order.status].label}</div>
                        <div className="mt-1 text-sm font-semibold text-amber-300">Waiting {formatDuration(age)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Pending Column */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></div>
                    <h2 className="text-sm font-bold text-blue-300 uppercase tracking-wider">New Orders</h2>
                    <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full text-xs font-bold">{pendingOrders.length}</span>
                  </div>
                  {pendingOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                      onPrint={handlePrintKOT}
                    />
                  ))}
                </div>

                {/* Preparing Column */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                    <div className="w-2.5 h-2.5 bg-amber-500 rounded-full"></div>
                    <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider">Cooking</h2>
                    <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full text-xs font-bold">{preparingOrders.length}</span>
                  </div>
                  {preparingOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                      onPrint={handlePrintKOT}
                    />
                  ))}
                </div>

                {/* Ready Column */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                    <h2 className="text-sm font-bold text-green-300 uppercase tracking-wider">Ready</h2>
                    <span className="bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full text-xs font-bold">{readyOrders.length}</span>
                  </div>
                  {readyOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                      onPrint={handlePrintKOT}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}

// Order Card Component
function OrderCard({
  order,
  onStatusChange,
  onComplete,
  onPrint,
}: {
  order: KitchenOrder;
  onStatusChange: (id: string, status: any) => void;
  onComplete: (id: string) => void;
  onPrint: (order: KitchenOrder) => void;
}) {
  const urgency = getUrgency(order.createdAt);
  const config = STATUS_CONFIG[order.status];
  const ageMinutes = getAgeMinutes(order.createdAt);
  const ageProgress = Math.min(100, Math.round((ageMinutes / 20) * 100));

  return (
    <div className={`bg-slate-800 rounded-lg overflow-hidden border ${config.borderColor} transition-all hover:-translate-y-0.5`}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-slate-700 bg-slate-900/70">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold">{order.orderNumber}</span>
          <span className="text-sm font-bold text-slate-200">T{order.tableNumber}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {config.pulse && <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>}
          <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${config.color} ${config.textColor}`}>{config.label}</span>
        </div>
      </div>

      {/* Time & Urgency */}
      <div className="px-3 py-1.5 bg-slate-900/60 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-1.5 text-slate-400 text-xs">
          <ClockIcon className="w-3 h-3" />
          <span className="font-mono">{formatTime(order.createdAt)} • {ageMinutes}m</span>
        </div>
        {urgency === 'urgent' && (
          <div className="flex items-center gap-1 text-orange-400 text-xs font-bold animate-pulse">
            <FlameIcon className="w-3 h-3" />
            <span>WAITING</span>
          </div>
        )}
        {urgency === 'normal' && (
          <div className="flex items-center gap-1 text-amber-400 text-xs font-bold">
            <AlertTriangleIcon className="w-3 h-3" />
            <span>SOON</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-b border-slate-700 bg-slate-900/40">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
          <span>Order Aging</span>
          <span>{formatDuration(ageMinutes)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
          <div
            className={`h-full rounded-full ${urgency === 'urgent' ? 'bg-red-400' : urgency === 'normal' ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${ageProgress}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="p-2.5 space-y-1.5">
        {/* Order-level notes (allergies, special requests) */}
        {order.notes && (
          <div className="bg-red-500/20 border border-red-500 rounded p-2 mb-2">
            <div className="text-red-400 text-xs font-bold">⚠️ {order.notes}</div>
          </div>
        )}

        {/* Loyalty discount indicator */}
        {order.loyaltyDiscount && order.loyaltyDiscount > 0 && (
          <div className="bg-green-500/20 border border-green-500 rounded p-2 mb-2">
            <div className="text-green-400 text-xs font-bold">🎁 Loyalty discount: -${(order.loyaltyDiscount / 100).toFixed(2)}</div>
          </div>
        )}

        {/* Free item indicator */}
        {order.loyaltyFreeItemId && (
          <div className="bg-purple-500/20 border border-purple-500 rounded p-2 mb-2">
            <div className="text-purple-400 text-xs font-bold">🎁 FREE: {getMenuItemName(order.loyaltyFreeItemId)}</div>
          </div>
        )}

        {order.items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="bg-slate-700 text-white w-5 h-5 rounded flex items-center justify-center text-xs font-bold">
              {item.quantity}
            </span>
            <div className="flex-1">
              <div className="text-white text-sm font-medium">{item.name}</div>
              {item.notes && (
                <div className="text-amber-400 text-xs">→ {item.notes}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-2.5 pt-0 space-y-2">
        {(order.status === 'pending' || order.status === 'verified') && (
          <button
            onClick={() => onStatusChange(order.id, 'preparing')}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors"
          >
            Start Cooking
          </button>
        )}
        {order.status === 'preparing' && (
          <button
            onClick={() => onStatusChange(order.id, 'ready')}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors"
          >
            Mark Ready
          </button>
        )}
        {order.status === 'ready' && (
          <button
            onClick={() => onComplete(order.id)}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircleIcon className="w-4 h-4" />
            Complete
          </button>
        )}
        <button
          onClick={() => onPrint(order)}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
        >
          <PrinterIcon className="w-3.5 h-3.5" />
          Print KOT
        </button>
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
    <div className={`bg-slate-800 rounded-lg p-6 border ${colorClasses[color]}`}>
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
