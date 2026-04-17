import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer } from
'recharts';
import { StarIcon, TrophyIcon, ClockIcon, DollarSignIcon, ArrowLeftIcon } from 'lucide-react';
import { useWaiters } from '../../hooks/useStaff';
import { useOrdersContext } from '../../contexts/OrdersContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPrice } from '../../utils/currency';
import { useTheme } from '../../contexts/ThemeContext';

interface StaffPerformanceProps {
  onBack?: () => void;
}

export function StaffPerformance({ onBack }: StaffPerformanceProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { waiters, isLoading } = useWaiters();
  const { orders } = useOrdersContext();

  // Build a table-number → waiter-id lookup from current assignments
  const tableToWaiter = useMemo(() => {
    const map = new Map<number, string>();
    waiters.forEach(w => {
      (w.assignedTables || []).forEach((t: number) => map.set(t, w.id));
    });
    return map;
  }, [waiters]);

  // Compute real performance from actual orders.
  // Priority for resolving the waiter: assignedWaiterId → created_by → table assignment
  const performanceMap = useMemo(() => {
    const map = new Map<string, { ordersServed: number; totalRevenue: number }>();
    const waiterIds = new Set(waiters.map(w => w.id));

    orders.forEach(order => {
      const o = order as any;
      const waiterId =
        (order.assignedWaiterId && waiterIds.has(order.assignedWaiterId) ? order.assignedWaiterId : null) ??
        (o.created_by && waiterIds.has(o.created_by) ? o.created_by : null) ??
        (order.tableNumber != null ? tableToWaiter.get(order.tableNumber) ?? null : null);

      if (!waiterId) return;

      const cur = map.get(waiterId) || { ordersServed: 0, totalRevenue: 0 };
      if (order.status === 'served') {
        cur.ordersServed += 1;
        cur.totalRevenue += order.total || 0;
      }
      map.set(waiterId, cur);
    });
    return map;
  }, [orders, waiters, tableToWaiter]);

  const maxOrders = useMemo(() => {
    let max = 1;
    performanceMap.forEach(p => { if (p.ordersServed > max) max = p.ordersServed; });
    return max;
  }, [performanceMap]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center transition-colors">
        <div className="text-slate-100 text-lg">Loading staff performance...</div>
      </div>
    );
  }

  const getPerf = (id: string) => performanceMap.get(id) || { ordersServed: 0, totalRevenue: 0 };

  const sortedByOrders = [...waiters].sort(
    (a, b) => getPerf(b.id).ordersServed - getPerf(a.id).ordersServed
  );

  const chartData = waiters.map((w) => ({
    name: w.name.split(' ')[0],
    orders: getPerf(w.id).ordersServed,
    revenue: getPerf(w.id).totalRevenue,
    rating: w.performance?.rating || 0,
  }));
  return (
    <div className="supervisor-surface min-h-screen bg-slate-900 p-4 md:p-6 transition-colors">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-100">Staff Performance</h1>
          <p className="text-slate-400">Track and compare team performance</p>
        </div>

        {/* Leaderboard */}
        <Card className="bg-slate-800 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrophyIcon className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-100">Leaderboard</h3>
          </div>
          <div className="space-y-3">
            {sortedByOrders.map((waiter, index) => {
              const perf = getPerf(waiter.id);
              return (
                <div
                  key={waiter.id}
                  className={`flex items-center gap-4 p-3 rounded-lg ${index === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-700/30'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${index === 0 ? 'bg-amber-500 text-slate-950' : index === 1 ? 'bg-slate-400 text-slate-950' : index === 2 ? 'bg-orange-700 text-slate-100' : 'bg-slate-600 text-slate-300'}`}>
                    {index + 1}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-100 font-medium">
                    {waiter.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-100">{waiter.name}</p>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon key={i} className={`w-3 h-3 ${i < Math.floor(waiter.performance?.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
                      ))}
                      <span className="text-sm text-slate-400 ml-1">{waiter.performance?.rating || 0}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-400">{formatPrice(perf.totalRevenue)}</p>
                    <p className="text-sm text-slate-400">{perf.ordersServed} orders served</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Performance Charts */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Orders Served
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#CBD5E1' : '#334155'} />
                  <XAxis type="number" stroke={isLight ? '#334155' : '#64748b'} fontSize={12} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke={isLight ? '#334155' : '#64748b'}
                    fontSize={12}
                    width={60} />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: isLight ? '#ffffff' : '#1e293b',
                      border: `1px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                      color: isLight ? '#0f172a' : '#f1f5f9',
                      borderRadius: '8px'
                    }} />

                  <Bar dataKey="orders" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="bg-slate-800">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Revenue Generated
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#CBD5E1' : '#334155'} />
                  <XAxis
                    type="number"
                    stroke={isLight ? '#334155' : '#64748b'}
                    fontSize={12}
                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />

                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke={isLight ? '#334155' : '#64748b'}
                    fontSize={12}
                    width={60} />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: isLight ? '#ffffff' : '#1e293b',
                      border: `1px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                      color: isLight ? '#0f172a' : '#f1f5f9',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [
                    formatPrice(value),
                    'Revenue']
                    } />

                  <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Staff Cards */}
        <h3 className="text-lg font-semibold text-slate-100 mb-4">
          Individual Performance
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {waiters.map((waiter) => {
            const perf = getPerf(waiter.id);
            return (
              <Card key={waiter.id} className="bg-slate-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium text-lg">
                    {waiter.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">{waiter.name}</p>
                    <Badge variant={waiter.isOnDuty ? 'verified' : 'default'} size="sm">
                      {waiter.isOnDuty ? 'On Duty' : 'Off Duty'}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-400">
                      <StarIcon className="w-4 h-4" />
                      <span className="text-sm">Rating</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon key={i} className={`w-4 h-4 ${i < Math.floor(waiter.performance?.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-400">
                      <ClockIcon className="w-4 h-4" />
                      <span className="text-sm">Avg Service Time</span>
                    </div>
                    <span className="text-slate-100 font-medium">
                      {waiter.performance?.avgServiceTime ?? '—'} min
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-400">
                      <DollarSignIcon className="w-4 h-4" />
                      <span className="text-sm">Revenue (served)</span>
                    </div>
                    <span className="text-amber-400 font-medium">
                      {formatPrice(perf.totalRevenue)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-700">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Orders Served</span>
                      <span className="text-slate-100">{perf.ordersServed}</span>
                    </div>
                    <ProgressBar value={perf.ordersServed} max={Math.max(maxOrders, 1)} size="sm" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>);

}