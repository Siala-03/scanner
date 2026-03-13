import React, { useState, useMemo, ReactNode } from 'react';
import { ChevronUpIcon, ChevronDownIcon, SearchIcon, CalendarIcon, DownloadIcon, FilterIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Order, OrderStatus } from '../../types/orders';
import { StatusBadge } from '../ui/Badge';
import { getStaffById } from '../../data/staffData';
import { formatPrice } from '../../utils/currency';

interface OrdersHistoryTableProps {
  orders: any[];
  onSelectOrder: (order: any) => void;
  onExport?: () => void;
}

type SortField = 'id' | 'tableNumber' | 'total' | 'createdAt' | 'status';
type SortDirection = 'asc' | 'desc';

export function OrdersHistoryTable({ orders, onSelectOrder, onExport }: OrdersHistoryTableProps) {
  const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'createdAt',
    direction: 'desc'
  });
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [waiterFilter, setWaiterFilter] = useState<string>('all');
  
  // Get unique waiters from orders
  const waiters = useMemo(() => {
    const uniqueWaiters = new Map<string, string>();
    orders.forEach(order => {
      if (order.assignedWaiterId) {
        const staff = getStaffById(order.assignedWaiterId);
        uniqueWaiters.set(order.assignedWaiterId, staff?.name || order.assignedWaiterId);
      }
    });
    return Array.from(uniqueWaiters.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Status options
  const statusOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'verified', label: 'Verified' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'ready', label: 'Ready' },
    { value: 'served', label: 'Served' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  // Filter orders
  const filteredOrders = useMemo(() => {
    let result = [...orders];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(order => 
        order.id.toLowerCase().includes(query) ||
        (order as any).orderNumber?.toLowerCase().includes(query) ||
        order.tableNumber?.toString().includes(query) ||
        (order as any).customerName?.toLowerCase().includes(query)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(order => order.status === statusFilter);
    }
    
    // Waiter filter
    if (waiterFilter !== 'all') {
      result = result.filter(order => order.assignedWaiterId === waiterFilter);
    }
    
    // Date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      result = result.filter(order => new Date(order.createdAt) >= fromDate);
    }
    
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(order => new Date(order.createdAt) <= toDate);
    }
    
    return result;
  }, [orders, searchQuery, statusFilter, waiterFilter, dateFrom, dateTo]);

  // Sort orders
  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders].sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      switch (sortConfig.field) {
        case 'id':
          return a.id.localeCompare(b.id) * direction;
        case 'tableNumber':
          return ((a.tableNumber || 0) - (b.tableNumber || 0)) * direction;
        case 'total':
          return (a.total - b.total) * direction;
        case 'status':
          return a.status.localeCompare(b.status) * direction;
        case 'createdAt':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
        default:
          return 0;
      }
    });
    return sorted;
  }, [filteredOrders, sortConfig]);

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setWaiterFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) return null;
    return sortConfig.direction === 'asc' ?
      <ChevronUpIcon className="w-4 h-4" /> :
      <ChevronDownIcon className="w-4 h-4" />;
  };

  const HeaderCell = ({ field, children }: { field: SortField; children: ReactNode }) =>
    <th
      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon field={field} />
      </div>
    </th>;

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || waiterFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Order ID, Table, or Customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-400"
              />
            </div>
          </div>
          
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          
          {/* Waiter Filter */}
          <select
            value={waiterFilter}
            onChange={(e) => setWaiterFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Waiters</option>
            {waiters.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-4 mt-4">
          {/* Date From */}
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-slate-400" />
            <label className="text-sm text-slate-400">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          
          {/* Date To */}
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-slate-400" />
            <label className="text-sm text-slate-400">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          
          {/* Clear & Export */}
          <div className="flex items-center gap-2 ml-auto">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Clear Filters
              </button>
            )}
            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Showing <span className="text-white font-medium">{sortedOrders.length}</span> of{' '}
          <span className="text-white font-medium">{orders.length}</span> orders
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700/50">
        <table className="w-full">
          <thead className="bg-slate-800/50 border-b border-slate-700">
            <tr>
              <HeaderCell field="id">Order #</HeaderCell>
              <HeaderCell field="tableNumber">Table</HeaderCell>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Waiter
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Items
              </th>
              <HeaderCell field="total">Total</HeaderCell>
              <HeaderCell field="status">Status</HeaderCell>
              <HeaderCell field="createdAt">Date & Time</HeaderCell>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  <FilterIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No orders found matching your filters</p>
                </td>
              </tr>
            ) : (
              sortedOrders.map((order: any, index) => {
                const waiter = order.assignedWaiterId ? getStaffById(order.assignedWaiterId) : null;
                const createdAt = new Date(order.createdAt);
                
                return (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => onSelectOrder(order)}
                    className="hover:bg-slate-700/30 cursor-pointer transition-all duration-200"
                  >
                    <td className="px-4 py-3 text-sm font-bold text-white">
                      #{(order as any).orderNumber || order.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-medium">
                      {order.tableNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {(order as any).customerName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      <span className="px-2 py-1 bg-slate-700/30 rounded-md">
                        {waiter?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      <span className="px-2 py-1 bg-slate-700/30 rounded-md">
                        {order.items?.length || 0} items
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-amber-400">
                      {formatPrice(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      <div>{createdAt.toLocaleDateString()}</div>
                      <div className="text-xs">{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
