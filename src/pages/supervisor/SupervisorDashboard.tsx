import { useState, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { MenuIcon, TruckIcon, PhoneIcon, LogOutIcon } from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';
import { useStaff, useStaffOnDuty } from '../../hooks/useStaff';
import { useTodayKPIs } from '../../hooks/useAnalytics';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { useOrdersContext } from '../../contexts/OrdersContext';
import { KPICard } from '../../components/supervisor/KPICard';
import { OnlineOrdersPanel } from '../../components/supervisor/OnlineOrdersPanel';
import { TrendingUpIcon } from 'lucide-react';

interface SupervisorDashboardProps {
  onManageMenu: () => void;
  onLogout?: () => void;
}

export function SupervisorDashboard({ onManageMenu, onLogout }: SupervisorDashboardProps) {
  const { menuItems } = useMenu();
  const { staff, isLoading: staffLoading } = useStaff();
  const { staff: onDutyStaff, isLoading: onDutyLoading } = useStaffOnDuty();
  const { data: kpis, isLoading: kpiLoading } = useTodayKPIs();
  const { kpis: staffKPIs } = useStaffKPIs();
  const { orders, updateOrderStatus } = useOrdersContext();

  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('all');

  const totalStaff = staff.length;
  const peopleOnDuty = onDutyStaff.length;
  const onDutyIds = new Set(onDutyStaff.map((s) => s.id));

  const isOnline = (o: any) =>
    o.isOnlineOrder === true || o.is_online_order === true ||
    o.tableNumber === 999 || o.table_number === 999;

  // Online delivery orders (table 999), filtered by order status
  const deliveryOrders = useMemo(() => {
    return orders.filter(
      (order) =>
        isOnline(order) &&
        (deliveryStatusFilter === 'all' || order.status === deliveryStatusFilter)
    );
  }, [orders, deliveryStatusFilter]);

  return (
    <div className="supervisor-surface min-h-screen bg-slate-900 text-slate-100 p-4 transition-colors">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-bold">Supervisor Dashboard</h1>
            <p className="text-slate-300">Operations and team insights.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onManageMenu}>
              <MenuIcon className="w-4 h-4 mr-1" /> Manage Menu
            </Button>
            <Button variant="danger" onClick={onLogout}>
              <LogOutIcon className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total Staff</div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{staffLoading ? '—' : totalStaff}</div>
            <div className="text-xs text-slate-300 mt-1">All staff members</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">On-Duty Staff</div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{onDutyLoading ? '—' : peopleOnDuty}</div>
            <div className="text-xs text-slate-300 mt-1">Currently working</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="text-xs uppercase tracking-wide text-slate-400">Menu Items</div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{menuItems.length}</div>
            <div className="text-xs text-slate-300 mt-1">Available items</div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
          <h2 className="text-lg font-semibold mb-2">Today’s Operations KPIs</h2>
          {kpiLoading ? (
            <p className="text-slate-400">Loading KPIs…</p>
          ) : kpis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-slate-300 text-sm">Total Orders</p>
                <p className="text-2xl font-bold">{kpis.totalOrders}</p>
              </div>
              <div>
                <p className="text-slate-300 text-sm">Revenue (served)</p>
                <p className="text-2xl font-bold">{formatPrice(kpis.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-slate-300 text-sm">Avg Order Value (served)</p>
                <p className="text-2xl font-bold">{formatPrice(kpis.avgOrderValue)}</p>
              </div>
              <div>
                <p className="text-slate-300 text-sm">Peak Hour</p>
                <p className="text-2xl font-bold">
                  {kpis.peakHours?.[0]?.hour || 0}:00 ({kpis.peakHours?.[0]?.orders || 0} orders)
                </p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400">No KPI data available yet.</p>
          )}
          <p className="mt-3 text-sm text-slate-400">Data helps supervisors coordinate operations and optimize delivery management.</p>
        </div>

        {/* Staff KPIs Section */}
        {staffKPIs.length > 0 && (
          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <h2 className="text-lg font-semibold mb-3">Your KPIs</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {staffKPIs.map((kpi) => (
                <KPICard
                  key={kpi.id}
                  label={kpi.name}
                  value={kpi.progress?.currentValue || 0}
                  change={kpi.progress ? (kpi.progress.currentValue / Math.max(kpi.target_value || 1, 1)) * 100 - 100 : 0}
                  trend={kpi.progress?.achieved ? 'up' : 'neutral'}
                  icon={<TrendingUpIcon className="w-5 h-5" />}
                />
              ))}
            </div>
          </div>
        )}

        {/* Online Orders Section */}
        <div className="rounded-xl bg-slate-800 p-4 border border-slate-600 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🌐</span>
            <h2 className="text-lg font-semibold">Online Orders</h2>
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
              {orders.filter((o) => isOnline(o) && o.status === 'pending').length} pending
            </span>
          </div>
          <OnlineOrdersPanel
            orders={orders}
            onStatusChange={(orderId, newStatus) =>
              updateOrderStatus(orderId, newStatus as 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled')
            }
          />
        </div>

        {/* Online Deliveries Section */}
        <div className="rounded-xl bg-slate-800 p-4 border border-slate-600 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <TruckIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Online Deliveries</h2>
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
              {deliveryOrders.length}
            </span>
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {['all', 'pending', 'verified', 'preparing', 'ready', 'served'].map((status) => (
              <button
                key={status}
                onClick={() => setDeliveryStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  deliveryStatusFilter === status
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {deliveryOrders.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <TruckIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No {deliveryStatusFilter !== 'all' ? deliveryStatusFilter : ''} online deliveries</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deliveryOrders.map((order) => {
                const statusColors: Record<string, string> = {
                  pending:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                  verified:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
                  preparing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                  ready:     'bg-green-500/20 text-green-400 border-green-500/30',
                  served:    'bg-slate-500/20 text-slate-400 border-slate-500/30',
                  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
                };
                const orderNum = (order as any).order_number || order.orderNumber || `#${order.id.slice(-4)}`;
                const customer = (order as any).customer_name || order.customerName;
                const phone = (order as any).customer_phone || order.customerPhone;
                const status = order.status || 'pending';

                return (
                  <div key={order.id} className="p-3 rounded-lg border border-slate-600 bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-100">{orderNum}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${statusColors[status] || 'bg-slate-600 text-slate-300'}`}>
                            {status.toUpperCase()}
                          </span>
                        </div>
                        {customer && (
                          <p className="text-sm text-slate-300">👤 {customer}</p>
                        )}
                        {phone && (
                          <div className="flex items-center gap-1 text-sm text-slate-400">
                            <PhoneIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{phone}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-blue-400">
                          {formatPrice((order as any).total || 0)}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {(order as any).created_at || order.createdAt
                            ? new Date((order as any).created_at || order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
