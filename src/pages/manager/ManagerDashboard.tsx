import React, { useState } from 'react';
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
  QrCodeIcon } from
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
interface ManagerDashboardProps {
  onNavigate: (page: string) => void;
}
export function ManagerDashboard({ onNavigate }: ManagerDashboardProps) {
  const staffOnDuty = getStaffOnDuty();
  const todaysRevenue = weeklyRevenue[weeklyRevenue.length - 1]?.revenue || 0;
  const todaysOrders = weeklyRevenue[weeklyRevenue.length - 1]?.orders || 0;
  const now = new Date();
  const greeting =
  now.getHours() < 12 ?
  'Good morning' :
  now.getHours() < 18 ?
  'Good afternoon' :
  'Good evening';
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{greeting}, Manager</h1>
          <p className="text-slate-400">
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <KPICard
            label="Revenue Today"
            value={formatPrice(todaysRevenue)}
            change={12.5}
            trend="up"
            icon={<DollarSignIcon className="w-5 h-5" />} />

          <KPICard
            label="Orders"
            value={todaysOrders}
            change={8.2}
            trend="up"
            icon={<ShoppingCartIcon className="w-5 h-5" />} />

          <KPICard
            label="Avg Wait Time"
            value="12 min"
            change={-15.3}
            trend="up"
            icon={<ClockIcon className="w-5 h-5" />} />

          <KPICard
            label="Staff On Duty"
            value={staffOnDuty.length}
            trend="neutral"
            icon={<UsersIcon className="w-5 h-5" />} />

          <KPICard
            label="Customer Rating"
            value="4.8"
            change={3.2}
            trend="up"
            icon={<StarIcon className="w-5 h-5" />} />

          <KPICard
            label="Table Utilization"
            value="78%"
            change={5.1}
            trend="up"
            icon={<TrendingUpIcon className="w-5 h-5" />} />

        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Revenue Chart */}
          <Card className="bg-slate-800 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Revenue Trend
              </h2>
              <span className="text-sm text-slate-400">Last 7 days</span>
            </div>
            <RevenueChart data={weeklyRevenue} height={280} />
          </Card>

          {/* Popular Items */}
          <Card className="bg-slate-800">
            <h2 className="text-lg font-semibold text-white mb-4">
              Top Sellers
            </h2>
            <div className="space-y-4">
              {popularItems.slice(0, 5).map((item, index) =>
              <div key={item.item.id} className="flex items-center gap-3">
                  <span className="text-2xl">{item.item.emoji}</span>
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
                  <span className="text-sm text-amber-400 font-medium">
                    {item.orderCount}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Activity Feed */}
          <Card className="bg-slate-800 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">
              Recent Activity
            </h2>
            <ActivityFeed activities={recentActivity} maxItems={8} />
          </Card>

          {/* Quick Actions */}
          <Card className="bg-slate-800">
            <h2 className="text-lg font-semibold text-white mb-4">
              Quick Actions
            </h2>
            <div className="space-y-3">
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
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700">
              <h3 className="text-sm font-medium text-slate-400 mb-3">
                Staff On Duty
              </h3>
              <div className="space-y-2">
                {staffOnDuty.slice(0, 4).map((staff) =>
                <div key={staff.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-medium">
                      {staff.name.
                    split(' ').
                    map((n) => n[0]).
                    join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {staff.name}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">
                        {staff.role}
                      </p>
                    </div>
                  </div>
                )}
                {staffOnDuty.length > 4 &&
                <p className="text-sm text-slate-400">
                    +{staffOnDuty.length - 4} more
                  </p>
                }
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>);

}