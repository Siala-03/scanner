import { Button } from '../../components/ui/Button';
import { MenuIcon, LogOutIcon, TrendingUpIcon } from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';
import { useStaff, useStaffOnDuty } from '../../hooks/useStaff';
import { useTodayKPIs } from '../../hooks/useAnalytics';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { KPICard } from '../../components/supervisor/KPICard';

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
  const totalStaff = staff.length;
  const peopleOnDuty = onDutyStaff.length;

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

      </div>
    </div>
  );
}
