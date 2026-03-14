import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSignIcon,
  ShoppingCartIcon,
  ClockIcon,
  UsersIcon,
  StarIcon,
  MenuIcon,
  UserCogIcon,
  FileTextIcon,
  TrendingUpIcon,
  QrCodeIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ChefHatIcon,
  FlameIcon,
  PackageIcon,
  DownloadIcon,
  UploadIcon
} from
'lucide-react';
import {
  weeklyRevenue,
  popularItems,
  recentActivity,
  todayKPIs } from
'../../data/analyticsData';
import { getStaffOnDuty } from '../../data/staffData';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { KPICard } from '../../components/supervisor/KPICard';
import { RevenueChart } from '../../components/supervisor/RevenueChart';
import { ActivityFeed } from '../../components/manager/ActivityFeed';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPrice } from '../../utils/currency';
import { getAverageRating } from '../../utils/reviewsStorage';
import { listLowStock } from '../../utils/inventoryStorage';
import { menuItems } from '../../data/menuData';
import { exportMenuToJson, exportMenuToCsv, importMenuFromFile, saveCustomMenu, hasCustomMenu, resetToDefaultMenu } from '../../utils/menuImportExport';
interface ManagerDashboardProps {
  onNavigate: (page: string) => void;
}
export function ManagerDashboard({ onNavigate }: ManagerDashboardProps) {
  const staffOnDuty = getStaffOnDuty();
  const todaysRevenue = weeklyRevenue[weeklyRevenue.length - 1]?.revenue || 0;
  const todaysOrders = weeklyRevenue[weeklyRevenue.length - 1]?.orders || 0;
  const avgRating = getAverageRating();
  const now = new Date();
  const greeting =
  now.getHours() < 12 ?
  'Good morning' :
  now.getHours() < 18 ?
  'Good afternoon' :
  'Good evening';

  // Menu management state
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCustomMenu, setIsCustomMenu] = useState(hasCustomMenu());

  // Menu management handlers
  const handleExportJson = () => {
    const items = isCustomMenu ? JSON.parse(localStorage.getItem('custom_menu_items') || '[]') : menuItems;
    exportMenuToJson(items);
    setMenuMessage('Menu exported as JSON');
    setTimeout(() => setMenuMessage(null), 3000);
  };

  const handleExportCsv = () => {
    const items = isCustomMenu ? JSON.parse(localStorage.getItem('custom_menu_items') || '[]') : menuItems;
    exportMenuToCsv(items);
    setMenuMessage('Menu exported as CSV');
    setTimeout(() => setMenuMessage(null), 3000);
  };

  const handleImportMenu = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const items = await importMenuFromFile(file);
      setIsCustomMenu(true);
      setMenuMessage(`Imported ${items.length} menu items`);
      setTimeout(() => setMenuMessage(null), 3000);
    } catch (err) {
      setMenuMessage('Failed to import menu');
      setTimeout(() => setMenuMessage(null), 3000);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetMenu = () => {
    if (confirm('Reset to default menu? This will remove any custom menu items.')) {
      resetToDefaultMenu();
      setIsCustomMenu(false);
      setMenuMessage('Menu reset to default');
      setTimeout(() => setMenuMessage(null), 3000);
    }
  };

  // Calculate operational metrics
  const avgServiceTime = 12;
  const operationalHealth = todaysOrders > 50 ? (todaysRevenue / todaysOrders > 15 ? 'excellent' : 'good') : 'fair';
  const lowStock = listLowStock(menuItems);
  const healthColors = {
    excellent: 'text-green-400',
    good: 'text-blue-400',
    fair: 'text-amber-400',
    critical: 'text-red-400'
  };

  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Status */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{greeting}, Manager</h1>
            <p className="text-slate-400">
              {now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 border ${ operationalHealth === 'excellent' ? 'border-green-500/30' : operationalHealth === 'good' ? 'border-blue-500/30' : 'border-amber-500/30' }`}>
            <CheckCircleIcon className={`w-5 h-5 ${healthColors[operationalHealth]}`} />
            <span className={`text-sm font-medium ${healthColors[operationalHealth]}`}>
              {operationalHealth.charAt(0).toUpperCase() + operationalHealth.slice(1)} Status
            </span>
          </div>
        </div>

        {/* Menu Management Section */}
        <div className="mb-6 p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <MenuIcon className="w-5 h-5 text-blue-400" />
              <span className="text-white font-medium">Menu Management</span>
              {isCustomMenu && <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Custom</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
              >
                <DownloadIcon className="w-4 h-4" /> JSON
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
              >
                <DownloadIcon className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                <UploadIcon className="w-4 h-4" /> Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.xlsx,.xls"
                onChange={handleImportMenu}
                className="hidden"
              />
              {isCustomMenu && (
                <button
                  onClick={handleResetMenu}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600/50 hover:bg-red-600 text-white rounded transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            {menuMessage && (
              <span className="text-sm text-green-400">{menuMessage}</span>
            )}
          </div>
        </div>

        {/* Primary KPI Cards - Enhanced */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <KPICard
              label="Revenue Today"
              value={formatPrice(todaysRevenue)}
              change={12.5}
              trend="up"
              icon={<DollarSignIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <KPICard
              label="Orders"
              value={todaysOrders}
              change={8.2}
              trend="up"
              icon={<ShoppingCartIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <KPICard
              label="Avg Wait Time"
              value={`${avgServiceTime} min`}
              change={-15.3}
              trend="up"
              icon={<ClockIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <KPICard
              label="Staff On Duty"
              value={staffOnDuty.length}
              trend="neutral"
              icon={<UsersIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <KPICard
              label="Customer Rating"
              value={avgRating ?? '—'}
              change={3.2}
              trend="up"
              icon={<StarIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <KPICard
              label="Table Utilization"
              value="78%"
              change={5.1}
              trend="up"
              icon={<TrendingUpIcon className="w-5 h-5" />} />
          </motion.div>
        </div>

        {/* Alerts/Insights Section */}
        {lowStock.length > 0 &&
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Low stock</p>
            <p className="text-sm text-red-200/80">
              {lowStock.slice(0, 3).map((x) => `${x.item.name} (${x.stock})`).join(', ')}
              {lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ''}
            </p>
          </div>
        </motion.div>
        }

        {todaysOrders > 80 &&
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <FlameIcon className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Peak Service Time</p>
            <p className="text-sm text-amber-200/80">Restaurant is operating at high capacity. Consider extra support for kitchen.</p>
          </div>
        </motion.div>
        }

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Revenue Chart */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <TrendingUpIcon className="w-5 h-5 text-amber-400" />
                  Revenue Trend
                </h2>
                <span className="text-xs px-2 py-1 bg-amber-400/10 text-amber-300 rounded-full border border-amber-400/20">Last 7 days</span>
              </div>
              <RevenueChart data={weeklyRevenue} height={280} />
            </Card>
          </motion.div>

          {/* Popular Items */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <ChefHatIcon className="w-5 h-5 text-amber-400" />
                Top Sellers
              </h2>
              <div className="space-y-4">
                {popularItems.slice(0, 5).map((item, index) =>
                <motion.div key={item.item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + index * 0.05 }} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.item.name}
                      </p>
                      <ProgressBar
                      value={item.orderCount}
                      max={popularItems[0].orderCount}
                      size="sm"
                      className="mt-1" />

                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-sm text-amber-400 font-semibold">
                        {formatPrice(item.revenue)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {item.orderCount} orders
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Activity Feed */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2">
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-4">
                Recent Activity
              </h2>
              <ActivityFeed activities={recentActivity} maxItems={8} />
            </Card>
          </motion.div>

          {/* Quick Actions & Staff */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-4">
                Quick Actions
              </h2>
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => onNavigate('menu')}
                  className="justify-start">

                  <MenuIcon className="w-5 h-5" />
                  Manage Menu
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => onNavigate('staff')}
                  className="justify-start">

                  <UserCogIcon className="w-5 h-5" />
                  View Staff
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => onNavigate('analytics')}
                  className="justify-start">

                  <FileTextIcon className="w-5 h-5" />
                  Generate Report
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => onNavigate('qrcodes')}
                  className="justify-start">

                  <QrCodeIcon className="w-5 h-5" />
                  Print Table QRs
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => onNavigate('inventory')}
                  className="justify-start">
                  <PackageIcon className="w-5 h-5" />
                  Inventory
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => onNavigate('history')}
                  className="justify-start">
                  <FileTextIcon className="w-5 h-5" />
                  Order History
                </Button>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-700">
                <h3 className="text-sm font-medium text-slate-400 mb-3">
                  Staff On Duty ({staffOnDuty.length})
                </h3>
                <div className="space-y-2">
                  {staffOnDuty.slice(0, 4).map((staff) =>
                  <motion.div key={staff.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-700/30 transition">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-xs font-medium">
                          {staff.name.
                        split(' ').
                        map((n) => n[0]).
                        join('')}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border border-slate-800"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {staff.name}
                        </p>
                        <p className="text-xs text-slate-400 capitalize">
                          {staff.role}
                        </p>
                      </div>
                    </motion.div>
                  )}
                  
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>);

}