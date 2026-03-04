import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSignIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  ClockIcon,
  FilterIcon } from
'lucide-react';
import { Order, OrderStatus } from '../../types';
import { weeklyRevenue, todayKPIs } from '../../data/analyticsData';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { KPICard } from '../../components/supervisor/KPICard';
import { RevenueChart } from '../../components/supervisor/RevenueChart';
import { OrdersTable } from '../../components/supervisor/OrdersTable';
import { OrderDetailModal } from '../../components/waiter/OrderDetailModal';
import { formatPrice } from '../../utils/currency';
interface SupervisorDashboardProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
}
export function SupervisorDashboard({
  orders,
  onUpdateOrderStatus
}: SupervisorDashboardProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
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
  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return todaysOrders;
    return todaysOrders.filter((o) => o.status === activeTab);
  }, [todaysOrders, activeTab]);
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
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            Supervisor Dashboard
          </h1>
          <p className="text-slate-400">
            Real-time overview of restaurant operations
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Revenue Today"
            value={formatPrice(todaysRevenue)}
            change={12.5}
            trend="up"
            icon={<DollarSignIcon className="w-5 h-5" />} />

          <KPICard
            label="Total Orders"
            value={todaysOrders.length}
            change={8.2}
            trend="up"
            icon={<ShoppingCartIcon className="w-5 h-5" />} />

          <KPICard
            label="Avg Order Value"
            value={formatPrice(avgOrderValue)}
            change={-2.1}
            trend="down"
            icon={<TrendingUpIcon className="w-5 h-5" />} />

          <KPICard
            label="Avg Wait Time"
            value="12 min"
            change={-15.3}
            trend="up"
            icon={<ClockIcon className="w-5 h-5" />} />

        </div>

        {/* Revenue Chart */}
        <Card className="bg-slate-800 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Revenue Trend</h2>
            <span className="text-sm text-slate-400">Last 7 days</span>
          </div>
          <RevenueChart data={weeklyRevenue} height={250} />
        </Card>

        {/* Orders Table */}
        <Card className="bg-slate-800" padding="none">
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Today's Orders
              </h2>
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