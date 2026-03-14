import React, { useMemo, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSignIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  ClockIcon,
  FilterIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ZapIcon,
  StarIcon,
  AlertCircleIcon,
  FilterIcon as FilterLinesIcon,
  MenuIcon,
  DownloadIcon,
  UploadIcon
} from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { weeklyRevenue, todayKPIs } from '../../data/analyticsData';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { KPICard } from '../../components/supervisor/KPICard';
import { RevenueChart } from '../../components/supervisor/RevenueChart';
import { OrdersTable } from '../../components/supervisor/OrdersTable';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { formatPrice } from '../../utils/currency';
import { getAverageRating } from '../../utils/reviewsStorage';
import { listLowStock } from '../../utils/inventoryStorage';
import { menuItems } from '../../data/menuData';
import { downloadCsv, buildOrdersCsv } from '../../utils/csv';
import { getStaffById } from '../../data/staffData';
import { exportMenuToJson, exportMenuToCsv, importMenuFromJson, saveCustomMenu, hasCustomMenu, resetToDefaultMenu } from '../../utils/menuImportExport';
interface SupervisorDashboardProps {
  orders: Order[];
  onUpdateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    opts?: { assignedWaiterId?: string }
  ) => void;
}
export function SupervisorDashboard({
  orders,
  onUpdateOrderStatus
}: SupervisorDashboardProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Menu management state
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCustomMenu, setIsCustomMenu] = useState(hasCustomMenu());
  const todaysOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter((o) => o.createdAt >= today);
  }, [orders]);
  const todaysRevenue = useMemo(
    () =>
    todaysOrders.
    filter((o) => o.status === 'served').
    reduce((sum, o) => sum + o.total, 0),
    [todaysOrders]
  );
  const avgOrderValue =
  todaysOrders.length > 0 ?
  todaysRevenue / todaysOrders.filter((o) => o.status === 'served').length :
  0;
  const avgRating = getAverageRating();
  const lowStock = listLowStock(menuItems);
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [waiterFilter, setWaiterFilter] = useState<string>('all');
  const filteredOrders = useMemo(() => {
    let base = todaysOrders;
    if (activeTab !== 'all') {
      base = base.filter((o) => o.status === activeTab);
    }
    if (tableFilter !== 'all') {
      const tableNum = parseInt(tableFilter, 10);
      base = base.filter((o) => o.tableNumber === tableNum);
    }
    if (waiterFilter !== 'all') {
      base = base.filter((o) => o.assignedWaiterId === waiterFilter);
    }
    return base;
  }, [todaysOrders, activeTab, tableFilter, waiterFilter]);

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
      const items = await importMenuFromJson(file);
      saveCustomMenu(items);
      setIsCustomMenu(true);
      setMenuMessage(`Imported ${items.length} menu items`);
      setTimeout(() => setMenuMessage(null), 3000);
    } catch (err) {
      setMenuMessage('Failed to import menu');
      setTimeout(() => setMenuMessage(null), 3000);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
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
  const tableOptions = useMemo(
    () => Array.from(new Set(todaysOrders.map((o) => o.tableNumber))).sort((a, b) => a - b),
    [todaysOrders]
  );
  const waiterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          todaysOrders
            .map((o) => o.assignedWaiterId)
            .filter((id): id is string => !!id)
        )
      ),
    [todaysOrders]
  );
  const tabs = [
  {
    id: 'all',
    label: 'All',
    count: todaysOrders.length
  },
  {
    id: 'pending',
    label: 'Pending',
    count: todaysOrders.filter((o) => o.status === 'pending').length
  },
  {
    id: 'preparing',
    label: 'In Progress',
    count: todaysOrders.filter((o) =>
    ['verified', 'preparing'].includes(o.status)
    ).length
  },
  {
    id: 'served',
    label: 'Completed',
    count: todaysOrders.filter((o) => o.status === 'served').length
  }];

  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Status */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Supervisor Dashboard
            </h1>
            <p className="text-slate-400">
              Real-time overview of restaurant operations
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 border border-blue-500/30">
            <ZapIcon className="w-5 h-5 text-blue-400 animate-pulse" />
            <span className="text-sm font-medium text-blue-300">
              {filteredOrders.length} Active Orders
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
                accept=".json"
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
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
              label="Total Orders"
              value={todaysOrders.length}
              change={8.2}
              trend="up"
              icon={<ShoppingCartIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <KPICard
              label="Avg Order Value"
              value={formatPrice(avgOrderValue)}
              change={-2.1}
              trend="down"
              icon={<TrendingUpIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <KPICard
              label="Avg Wait Time"
              value="12 min"
              change={-15.3}
              trend="up"
              icon={<ClockIcon className="w-5 h-5" />} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <KPICard
              label="Customer Rating"
              value={avgRating ?? '—'}
              trend="neutral"
              icon={<StarIcon className="w-5 h-5" />} />
          </motion.div>
        </div>

        {/* Alerts Section */}
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

        {todaysOrders.filter((o) => o.status === 'pending').length > 10 &&
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Pending Orders Alert</p>
            <p className="text-sm text-red-200/80">
              {todaysOrders.filter((o) => o.status === 'pending').length} orders waiting. Consider expediting kitchen operations.
            </p>
          </div>
        </motion.div>
        }

        {todaysOrders.filter((o) => o.status === 'served').length > 50 &&
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-300">Excellent Throughput</p>
            <p className="text-sm text-green-200/80">
              Successfully served {todaysOrders.filter((o) => o.status === 'served').length} orders today.
            </p>
          </div>
        </motion.div>
        }

        {/* Filters + Download */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <FilterLinesIcon className="w-4 h-4 text-slate-400" />
            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All tables</option>
              {tableOptions.map((t) => (
                <option key={t} value={t}>
                  Table {t}
                </option>
              ))}
            </select>
            <select
              value={waiterFilter}
              onChange={(e) => setWaiterFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All waiters</option>
              {waiterOptions.map((id) => {
                const s = getStaffById(id);
                return (
                  <option key={id} value={id}>
                    {s?.name ?? id}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            type="button"
            onClick={() => downloadCsv('todays-orders.csv', buildOrdersCsv(filteredOrders))}
            className="self-start px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 hover:bg-slate-700"
          >
            Download CSV
          </button>
        </div>

        {/* Revenue Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-6">
          <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUpIcon className="w-5 h-5 text-amber-400" />
                Revenue Trend
              </h2>
              <span className="text-xs px-2 py-1 bg-amber-400/10 text-amber-300 rounded-full border border-amber-400/20">Last 7 days</span>
            </div>
            <RevenueChart data={weeklyRevenue} height={250} />
          </Card>
        </motion.div>

        {/* Orders Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50" padding="none">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ShoppingCartIcon className="w-5 h-5" />
                  Today's Orders
                </h2>
                <span className="text-sm text-slate-400">{filteredOrders.length} orders</span>
              </div>
              <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab} />

            </div>
            <OrdersTable
              orders={filteredOrders}
              onSelectOrder={setSelectedOrder} />

          </Card>
        </motion.div>
      </div>

      {/* Order detail modal */}
      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onApprove={(id) => {
          onUpdateOrderStatus(id, 'verified');
          setSelectedOrder(null);
        }}
        onReject={(id) => {
          onUpdateOrderStatus(id, 'cancelled');
          setSelectedOrder(null);
        }}
        onMarkReady={(id) => {
          onUpdateOrderStatus(id, 'ready');
          setSelectedOrder(null);
        }}
        onMarkServed={(id) => {
          onUpdateOrderStatus(id, 'served');
          setSelectedOrder(null);
        }} />

    </div>);

}