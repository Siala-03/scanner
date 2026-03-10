import React, { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Order, SortConfig, SortDirection } from '../../types';
import { StatusBadge } from '../ui/Badge';
import { getStaffById } from '../../data/staffData';
import { formatPrice } from '../../utils/currency';
interface OrdersTableProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
}
export function OrdersTable({ orders, onSelectOrder }: OrdersTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'createdAt',
    direction: 'desc'
  });
  const handleSort = (field: string) => {
    setSortConfig((prev) => ({
      field,
      direction:
      prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };
  const sortedOrders = [...orders].sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.field) {
      case 'id':
        return a.id.localeCompare(b.id) * direction;
      case 'tableNumber':
        return (a.tableNumber - b.tableNumber) * direction;
      case 'total':
        return (a.total - b.total) * direction;
      case 'createdAt':
        return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
      default:
        return 0;
    }
  });
  const SortIcon = ({ field }: {field: string;}) => {
    if (sortConfig.field !== field) return null;
    return sortConfig.direction === 'asc' ?
    <ChevronUpIcon className="w-4 h-4" /> :

    <ChevronDownIcon className="w-4 h-4" />;

  };
  const HeaderCell = ({
    field,
    children



  }: {field: string;children: React.ReactNode;}) =>
  <th
    className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
    onClick={() => handleSort(field)}>

      <div className="flex items-center gap-1">
        {children}
        <SortIcon field={field} />
      </div>
    </th>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50 border-b border-slate-700">
          <tr>
            <HeaderCell field="id">Order #</HeaderCell>
            <HeaderCell field="tableNumber">Table</HeaderCell>
            <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Waiter
            </th>
            <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Items
            </th>
            <HeaderCell field="total">Total</HeaderCell>
            <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Date
            </th>
            <HeaderCell field="createdAt">Time</HeaderCell>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {sortedOrders.map((order, index) => {
            const waiter = order.assignedWaiterId ?
            getStaffById(order.assignedWaiterId) :
            null;
            const createdAt = order.createdAt;
            return (
              <motion.tr
                key={order.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onSelectOrder(order)}
                className="hover:bg-slate-700/30 cursor-pointer transition-all duration-200 hover:shadow-lg">

                <td className="px-4 py-3 text-sm font-bold text-white">
                  #{order.id.slice(0, 6)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300 font-medium">
                  {order.tableNumber}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                  <span className="px-2 py-1 bg-slate-700/30 rounded-md">{waiter?.name || 'Unassigned'}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                  <span className="px-2 py-1 bg-slate-700/30 rounded-md">{order.items.length} items</span>
                </td>
                <td className="px-4 py-3 text-sm font-bold text-amber-400">
                  {formatPrice(order.total)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
              </motion.tr>);

          })}
        </tbody>
      </table>
    </div>);

}