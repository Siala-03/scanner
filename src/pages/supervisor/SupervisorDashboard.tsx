import {
  Clock3Icon,
  ClockIcon,
  CheckCircleIcon,
  DollarSignIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UserMinusIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';
import { useStaff, useStaffOnDuty } from '../../hooks/useStaff';
import { useTodayKPIs } from '../../hooks/useAnalytics';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { KPICard } from '../../components/supervisor/KPICard';

interface SupervisorDashboardProps {
  restaurantName?: string;
  ordersByHour: { hour: string; orders: number; revenue: number }[];
  statusBreakdown: { status: string; count: number }[];
  pendingPaymentCount?: number;
  pendingPaymentTotal?: number;
  confirmedPaymentCount?: number;
  confirmedPaymentTotal?: number;
}

const statusTone: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  verified: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  preparing: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  served: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
};

export function SupervisorDashboard({ restaurantName, ordersByHour, statusBreakdown, pendingPaymentCount = 0, pendingPaymentTotal = 0, confirmedPaymentCount = 0, confirmedPaymentTotal = 0 }: SupervisorDashboardProps) {
  const { menuItems } = useMenu();
  const { staff, isLoading: staffLoading } = useStaff();
  const { staff: onDutyStaff, isLoading: onDutyLoading } = useStaffOnDuty();
  const { data: kpis, isLoading: kpiLoading } = useTodayKPIs();
  const { kpis: staffKPIs } = useStaffKPIs();

  const totalStaff = staff.length;
  const peopleOnDuty = onDutyStaff.length;
  const offDuty = Math.max(totalStaff - peopleOnDuty, 0);
  const availableMenuItems = menuItems.filter((item: any) => item?.isAvailable !== false).length;
  const unavailableMenuItems = Math.max(menuItems.length - availableMenuItems, 0);
  const staffingCoverage = totalStaff > 0 ? Math.round((peopleOnDuty / totalStaff) * 100) : 0;
  const revenuePerOnDuty = peopleOnDuty > 0 && kpis ? kpis.totalRevenue / peopleOnDuty : 0;
  const ordersPerOnDuty = peopleOnDuty > 0 && kpis ? kpis.totalOrders / peopleOnDuty : 0;
  const topPeakHour = kpis?.peakHours?.[0];
  const popularItems = kpis?.popularItems ?? [];
  const currentQueue = statusBreakdown.reduce((sum, item) => sum + item.count, 0);
  const busiestTrackedHour = ordersByHour.reduce(
    (best, current) => (current.orders > best.orders ? current : best),
    ordersByHour[0] ?? { hour: '00:00', orders: 0, revenue: 0 }
  );
  const latestHour = ordersByHour[ordersByHour.length - 1];

  const roleBreakdown = staff.reduce<Record<string, number>>((acc, member) => {
    acc[member.role] = (acc[member.role] || 0) + 1;
    return acc;
  }, {});

  const sortedRoleBreakdown = Object.entries(roleBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="supervisor-surface min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 transition-colors">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Supervisor Dashboard</h1>
            <p className="text-slate-300 mt-1">
              Live operations snapshot for {restaurantName || 'your company'}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">Total Staff</div>
              <UsersIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{staffLoading ? '—' : totalStaff}</div>
            <div className="text-xs text-slate-300 mt-1">All registered team members</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">On-Duty Staff</div>
              <UserCheckIcon className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{onDutyLoading ? '—' : peopleOnDuty}</div>
            <div className="text-xs text-slate-300 mt-1">{staffingCoverage}% coverage now</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">Off-Duty Staff</div>
              <UserMinusIcon className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{staffLoading ? '—' : offDuty}</div>
            <div className="text-xs text-slate-300 mt-1">Not currently scheduled</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">Menu Availability</div>
              <UtensilsCrossedIcon className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{menuItems.length}</div>
            <div className="text-xs text-slate-300 mt-1">{availableMenuItems} available, {unavailableMenuItems} unavailable</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-emerald-500/30 p-3 bg-emerald-500/10">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-emerald-300">Total Revenue Today</div>
              <DollarSignIcon className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-emerald-300">{formatPrice(confirmedPaymentTotal + pendingPaymentTotal)}</div>
            <div className="text-xs text-emerald-200/80 mt-1">
              {formatPrice(confirmedPaymentTotal)} confirmed · {formatPrice(pendingPaymentTotal)} awaiting
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">Orders Today</div>
              <ReceiptTextIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{kpiLoading ? '—' : (kpis?.totalOrders ?? 0)}</div>
            <div className="text-xs text-slate-300 mt-1">All order statuses combined</div>
          </div>

          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">Avg Order Value</div>
              <TrendingUpIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{kpiLoading ? '—' : formatPrice(kpis?.avgOrderValue ?? 0)}</div>
            <div className="text-xs text-slate-300 mt-1">From served orders</div>
          </div>

          <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-400">Peak Hour</div>
              <Clock3Icon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">
              {kpiLoading ? '—' : `${topPeakHour?.hour ?? 0}:00`}
            </div>
            <div className="text-xs text-slate-300 mt-1">{topPeakHour?.orders ?? 0} orders in busiest hour</div>
          </div>
        </div>

        {/* Payment status overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-amber-500/30 p-4 bg-amber-500/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <ClockIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-amber-400">Pending Payments</div>
              <div className="text-2xl font-bold text-amber-300 mt-0.5">{pendingPaymentCount} orders</div>
              <div className="text-sm text-amber-200/70">{formatPrice(pendingPaymentTotal)} outstanding</div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 p-4 bg-emerald-500/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-emerald-400">Confirmed Payments</div>
              <div className="text-2xl font-bold text-emerald-300 mt-0.5">{confirmedPaymentCount} orders</div>
              <div className="text-sm text-emerald-200/70">{formatPrice(confirmedPaymentTotal)} collected</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600 lg:col-span-2">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold">Order Momentum</h2>
                <p className="text-sm text-slate-400">Recent order flow across the tracked hours.</p>
              </div>
              <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
                Peak tracked hour: {busiestTrackedHour.hour}
              </div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ordersByHour}>
                  <defs>
                    <linearGradient id="supervisorOrdersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="orders" stroke="#38bdf8" strokeWidth={2} fill="url(#supervisorOrdersGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <h2 className="text-lg font-semibold mb-3">Queue Snapshot</h2>
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mb-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Open queue</div>
              <div className="mt-2 text-3xl font-semibold text-slate-100">{currentQueue}</div>
              <div className="text-xs text-slate-400 mt-1">Orders currently visible across statuses</div>
            </div>
            <div className="space-y-2">
              {statusBreakdown.filter((item) => item.count > 0).length === 0 ? (
                <p className="text-sm text-slate-400">No live queue data right now.</p>
              ) : (
                statusBreakdown.filter((item) => item.count > 0).map((item) => (
                  <div
                    key={item.status}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm capitalize ${statusTone[item.status] ?? 'bg-slate-700/30 text-slate-300 border-slate-700'}`}
                  >
                    <span>{item.status}</span>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600 lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3">Team Utilization</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Coverage</div>
                <div className="text-2xl font-semibold mt-2">{staffLoading || onDutyLoading ? '—' : `${staffingCoverage}%`}</div>
                <div className="text-xs text-slate-400 mt-1">On-duty vs total staff</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Orders / On-duty</div>
                <div className="text-2xl font-semibold mt-2">{kpiLoading || onDutyLoading ? '—' : Math.round(ordersPerOnDuty)}</div>
                <div className="text-xs text-slate-400 mt-1">Load per active teammate</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Revenue / On-duty</div>
                <div className="text-2xl font-semibold mt-2">{kpiLoading || onDutyLoading ? '—' : formatPrice(revenuePerOnDuty)}</div>
                <div className="text-xs text-slate-400 mt-1">Productivity signal</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <h2 className="text-lg font-semibold mb-3">Role Distribution</h2>
            {sortedRoleBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400">No staff loaded yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedRoleBreakdown.map(([role, count]) => {
                  const width = totalStaff > 0 ? Math.round((count / totalStaff) * 100) : 0;
                  return (
                    <div key={role}>
                      <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                        <span className="capitalize">{role}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                        <div className="h-2 rounded-full bg-amber-400" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold">Revenue Pace</h2>
                <p className="text-sm text-slate-400">Served revenue across the tracked hours.</p>
              </div>
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                Latest hour: {latestHour?.hour ?? '00:00'}
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatPrice(value)} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <h2 className="text-lg font-semibold mb-3">Shift Readiness</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Menu uptime</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">
                  {menuItems.length > 0 ? `${Math.round((availableMenuItems / menuItems.length) * 100)}%` : '0%'}
                </div>
                <div className="text-xs text-slate-400 mt-1">Available items on the floor</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Busiest tracked hour</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">{busiestTrackedHour.orders}</div>
                <div className="text-xs text-slate-400 mt-1">Orders at {busiestTrackedHour.hour}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Live ready orders</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">
                  {statusBreakdown.find((item) => item.status === 'ready')?.count ?? 0}
                </div>
                <div className="text-xs text-slate-400 mt-1">Can be handed off or served</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Pending verification</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">
                  {statusBreakdown.find((item) => item.status === 'pending')?.count ?? 0}
                </div>
                <div className="text-xs text-slate-400 mt-1">Orders waiting on supervisor action</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <h2 className="text-lg font-semibold mb-3">Top Selling Items Today</h2>
            {kpiLoading ? (
              <p className="text-slate-400">Loading item performance...</p>
            ) : popularItems.length === 0 ? (
              <p className="text-slate-400">No item sales yet today.</p>
            ) : (
              <div className="space-y-2">
                {popularItems.slice(0, 5).map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
                    <div>
                      <div className="text-sm text-slate-100">{index + 1}. {item.name}</div>
                      <div className="text-xs text-slate-400">{item.count} sold</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-300">{formatPrice(item.revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
            <h2 className="text-lg font-semibold mb-3">On-Duty Snapshot</h2>
            {onDutyLoading ? (
              <p className="text-slate-400">Loading active staff...</p>
            ) : onDutyStaff.length === 0 ? (
              <p className="text-slate-400">No one is currently marked on-duty.</p>
            ) : (
              <div className="space-y-2">
                {onDutyStaff.slice(0, 6).map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
                    <div className="text-sm text-slate-100">{member.name}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-300 bg-slate-700/60 rounded-full px-2 py-1">{member.role}</div>
                  </div>
                ))}
                {onDutyStaff.length > 6 && (
                  <p className="text-xs text-slate-400">+{onDutyStaff.length - 6} more on duty</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-slate-800 p-4 border border-slate-600 mb-4">
          <h2 className="text-lg font-semibold mb-2">Today’s Operations KPIs</h2>
          {kpiLoading ? (
            <p className="text-slate-400">Loading KPIs…</p>
          ) : kpis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <p className="text-slate-300 text-sm">Total Orders</p>
                <p className="text-2xl font-bold">{kpis.totalOrders}</p>
              </div>
              <div>
                <p className="text-slate-300 text-sm">Total Revenue</p>
                <p className="text-2xl font-bold text-emerald-300">{formatPrice(confirmedPaymentTotal + pendingPaymentTotal)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatPrice(confirmedPaymentTotal)} confirmed · {formatPrice(pendingPaymentTotal)} awaiting</p>
              </div>
              <div>
                <p className="text-slate-300 text-sm">Avg Order Value</p>
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
          <p className="mt-3 text-sm text-slate-400">This panel updates from live order and staffing data to support shift decisions.</p>
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

      </div>
    </div>
  );
}
