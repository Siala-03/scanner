import React, { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
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
        <thead className="bg-slate-800/50">
          <tr>
            <HeaderCell field="id">Order #</HeaderCell>
            <HeaderCell field="tableNumber">Table</HeaderCell>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Waiter
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Items
            </th>
            <HeaderCell field="total">Total</HeaderCell>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Status
            </th>
            <HeaderCell field="createdAt">Time</HeaderCell>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {sortedOrders.map((order) => {
            const waiter = order.assignedWaiterId ?
            getStaffById(order.assignedWaiterId) :
            null;
            const minutesAgo = Math.floor(
              (Date.now() - order.createdAt.getTime()) / 60000
            );
            return (
              <tr
                key={order.id}
                onClick={() => onSelectOrder(order)}
                className="hover:bg-slate-800/50 cursor-pointer transition-colors">

                <td className="px-4 py-3 text-sm font-medium text-white">
                  {order.id}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                  Table {order.tableNumber}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                  {waiter?.name || 'Unassigned'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                  {order.items.length} items
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-amber-400">
                  {formatPrice(order.total)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {minutesAgo}m ago
                </td>
              </tr>);

          })}
        </tbody>
      </table>
    </div>);

}