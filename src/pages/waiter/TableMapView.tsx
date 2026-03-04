import React from 'react';
import { motion } from 'framer-motion';
import { Order } from '../../types';
import { Card } from '../../components/ui/Card';
import { formatPrice } from '../../utils/currency';
interface TableMapViewProps {
  assignedTables: number[];
  orders: Order[];
  onSelectTable: (tableNumber: number) => void;
}
export function TableMapView({
  assignedTables,
  orders,
  onSelectTable
}: TableMapViewProps) {
  const getTableStatus = (tableNumber: number) => {
    const tableOrders = orders.filter(
      (o) =>
      o.tableNumber === tableNumber &&
      ['pending', 'verified', 'preparing', 'ready'].includes(o.status)
    );
    if (tableOrders.length === 0) return 'available';
    if (tableOrders.some((o) => o.status === 'pending')) return 'pending';
    if (tableOrders.some((o) => o.status === 'ready')) return 'ready';
    return 'active';
  };
  const statusColors = {
    available: 'bg-green-500/20 border-green-500/50 text-green-400',
    pending: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
    active: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
    ready: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
    unassigned: 'bg-slate-700/50 border-slate-600 text-slate-500'
  };
  const allTables = Array.from(
    {
      length: 20
    },
    (_, i) => i + 1
  );
  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <h1 className="text-2xl font-bold text-white mb-6">Table Map</h1>

      <div className="grid grid-cols-4 gap-3 mb-8">
        {allTables.map((tableNumber) => {
          const isAssigned = assignedTables.includes(tableNumber);
          const status = isAssigned ? getTableStatus(tableNumber) : 'unassigned';
          const activeOrder = orders.find(
            (o) =>
            o.tableNumber === tableNumber &&
            ['pending', 'verified', 'preparing', 'ready'].includes(o.status)
          );
          return (
            <motion.button
              key={tableNumber}
              whileTap={{
                scale: 0.95
              }}
              onClick={() => isAssigned && onSelectTable(tableNumber)}
              disabled={!isAssigned}
              className={`
                aspect-square rounded-xl border-2 flex flex-col items-center justify-center
                transition-all duration-200
                ${statusColors[status]}
                ${isAssigned ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}
              `}>

              <span className="text-2xl font-bold">{tableNumber}</span>
              {activeOrder &&
              <span className="text-xs mt-1 opacity-75">
                  {formatPrice(activeOrder.total)}
                </span>
              }
            </motion.button>);

        })}
      </div>

      {/* Legend */}
      <Card className="bg-slate-800 border-slate-700">
        <h3 className="font-semibold text-white mb-3">Legend</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/50" />
            <span className="text-sm text-slate-300">No active order</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-500/50" />
            <span className="text-sm text-slate-300">Order pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/50" />
            <span className="text-sm text-slate-300">Order in progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-500/50" />
            <span className="text-sm text-slate-300">Order ready</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-600" />
            <span className="text-sm text-slate-300">Not assigned</span>
          </div>
        </div>
      </Card>
    </div>);

}