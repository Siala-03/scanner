import React from 'react';
import { Button } from '../../components/ui/Button';
import { MenuIcon } from 'lucide-react';
import { useMenu } from '../../hooks/useMenu';

interface SupervisorDashboardProps {
  onManageMenu: () => void;
}

export function SupervisorDashboard({ onManageMenu }: SupervisorDashboardProps) {
  const { menuItems } = useMenu();

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-bold">Supervisor Dashboard</h1>
            <p className="text-slate-300">Operations and team insights.</p>
          </div>
          <Button variant="secondary" onClick={onManageMenu}>
            <MenuIcon className="w-4 h-4 mr-1" /> Manage Menu
          </Button>
        </div>

        <div className="rounded-xl bg-slate-800 p-4 border border-slate-600">
          <div className="text-slate-200">Total menu items: {menuItems.length}</div>
          <div className="mt-2 text-sm text-slate-300">Use this dashboard to monitor operations and open menu management.</div>
        </div>
      </div>
    </div>
  );
}
