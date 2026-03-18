import React from 'react';
import { Button } from '../../components/ui/Button';
import { MenuIcon } from 'lucide-react';

interface ManagerDashboardProps {
  onNavigate: (page: 'dashboard' | 'menu' | 'staff' | 'analytics' | 'qrcodes' | 'inventory' | 'history') => void;
}

export function ManagerDashboard({ onNavigate }: ManagerDashboardProps) {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Manager Dashboard</h1>
            <p className="text-slate-300">Manage your menu, staff, and analytics.</p>
          </div>
          <Button variant="secondary" onClick={() => onNavigate('menu')}>
            <MenuIcon className="w-4 h-4 mr-1" /> Manage Menu
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => onNavigate('analytics')}>Analytics</Button>
          <Button variant="ghost" onClick={() => onNavigate('staff')}>Staff</Button>
          <Button variant="ghost" onClick={() => onNavigate('inventory')}>Inventory</Button>
          <Button variant="ghost" onClick={() => onNavigate('history')}>Order History</Button>
        </div>
      </div>
    </div>
  );
}
