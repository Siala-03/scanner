import { useMemo, useState, useEffect } from 'react';
import { Pagination } from '../ui/Pagination';
import { Package, Clock, AlertCircle, CheckCircle, User, Phone, Mail, MapPin, Globe, SearchIcon } from 'lucide-react';
import { Order } from '../../types';
import { formatPrice } from '../../utils/currency';
import { Button } from '../ui/Button';

interface OnlineOrdersPanel {
  orders: Order[];
  onStatusChange?: (orderId: string, newStatus: string) => void;
}

export function OnlineOrdersPanel({ orders, onStatusChange }: OnlineOrdersPanel) {
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState('all');

  const PIPELINE_PAGE_SIZE = 15;
  const [pipelinePage, setPipelinePage] = useState(1);
  
  const isOnline = (o: Order) =>
    o.isOnlineOrder === true || (o as any).is_online_order === true ||
    o.tableNumber === 999 || (o as any).table_number === 999;

  const onlineOrders = useMemo(
    () => orders.filter(isOnline),
    [orders]
  );

  // Group by status - PENDING orders need supervisor APPROVAL
  const pendingApprovalOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'pending'),
    [onlineOrders]
  );

  const verifiedOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'verified'),
    [onlineOrders]
  );

  const preparingOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'preparing'),
    [onlineOrders]
  );

  const readyOrders = useMemo(
    () => onlineOrders.filter((o) => o.status === 'ready'),
    [onlineOrders]
  );

  // All online orders that are no longer awaiting supervisor approval
  const approvedPipelineOrders = useMemo(
    () => onlineOrders.filter((o) => o.status !== 'pending'),
    [onlineOrders]
  );

  const filteredApprovedPipelineOrders = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return approvedPipelineOrders
      .filter((order) => {
        if (tableStatusFilter !== 'all' && order.status !== tableStatusFilter) return false;
        if (!query) return true;

        const customerName = ((order as any).customer_name || order.customerName || '').toLowerCase();
        const orderNumber = ((order as any).orderNumber || '').toLowerCase();
        const orderId = (order.id || '').toLowerCase();

        return (
          customerName.includes(query) ||
          orderNumber.includes(query) ||
          orderId.includes(query)
        );
      })
      .sort(
        (left, right) =>
          new Date((right as any).created_at || right.createdAt || 0).getTime() -
          new Date((left as any).created_at || left.createdAt || 0).getTime()
      );
  }, [approvedPipelineOrders, tableSearch, tableStatusFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPipelinePage(1); }, [filteredApprovedPipelineOrders]);

  const statusCounts = {
    pending: pendingApprovalOrders.length,
    verified: verifiedOrders.length,
    preparing: preparingOrders.length,
    ready: readyOrders.length,
  };

  const totalOnlineRevenue = useMemo(
    () => onlineOrders.reduce((sum, order) => sum + ((order as any).total || order.total || 0), 0),
    [onlineOrders]
  );

  const latestOrderTime = useMemo(() => {
    if (onlineOrders.length === 0) return null;
    const newest = [...onlineOrders]
      .sort(
        (left, right) =>
          new Date((right as any).created_at || right.createdAt || 0).getTime() -
          new Date((left as any).created_at || left.createdAt || 0).getTime()
      )[0];

    const createdAt = (newest as any).created_at || newest.createdAt;
    return createdAt
      ? new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : null;
  }, [onlineOrders]);

  const sectionStyles: Record<string, { shell: string; badge: string; heading: string; border: string }> = {
    pending: {
      shell: 'bg-red-500/10 border-red-500/30',
      badge: 'bg-red-500/15 text-red-300 border-red-500/30',
      heading: 'text-red-300',
      border: 'border-l-red-400',
    },
    verified: {
      shell: 'bg-blue-500/10 border-blue-500/30',
      badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      heading: 'text-blue-300',
      border: 'border-l-blue-400',
    },
    preparing: {
      shell: 'bg-amber-500/10 border-amber-500/30',
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      heading: 'text-amber-300',
      border: 'border-l-amber-400',
    },
    ready: {
      shell: 'bg-emerald-500/10 border-emerald-500/30',
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      heading: 'text-emerald-300',
      border: 'border-l-emerald-400',
    },
  };

  const OrderCard = ({ order, variant = 'default' }: { order: Order; variant?: string }) => {
    const customerName = (order as any).customer_name || order.customerName || 'Guest';
    const customerPhone = (order as any).customer_phone || order.customerPhone;
    const customerEmail = (order as any).customer_email || order.customerEmail;
    const customerAddress = (order as any).customer_address || order.customerAddress;
    const createdAt = (order as any).created_at || order.createdAt;
    const total = (order as any).total || order.total || 0;
    const itemCount = order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    const style = sectionStyles[order.status || 'pending'] || sectionStyles.pending;

    return (
      <div
        className={`rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.28)] ${style.border} border-l-4 ${
          variant === 'compact' ? 'mb-2' : 'mb-3'
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                Online Order
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
              {createdAt && (
                <span className="text-xs text-slate-400">
                  {new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <h4 className="text-lg font-semibold text-slate-100">
                  {order.orderNumber || `#${order.id.slice(-6)}`}
                </h4>
                <p className="text-sm text-slate-400">Requires supervisor routing before kitchen starts</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Total</div>
                <div className="text-lg font-semibold text-amber-300">{formatPrice(total)}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.95fr)]">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Customer</div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-100">
                      <User className="h-4 w-4 text-amber-300" />
                      <span>{customerName}</span>
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                    {itemCount} items
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-slate-300">
                  {customerPhone && (
                    <div className="flex items-start gap-2">
                      <Phone className="mt-0.5 h-4 w-4 text-slate-500" />
                      <span>{customerPhone}</span>
                    </div>
                  )}
                  {customerEmail && (
                    <div className="flex items-start gap-2">
                      <Mail className="mt-0.5 h-4 w-4 text-slate-500" />
                      <span className="break-all">{customerEmail}</span>
                    </div>
                  )}
                  {customerAddress && (
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-slate-500" />
                      <span>{customerAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Order Items</div>
                  <div className="text-xs text-slate-500">{order.items?.length || 0} lines</div>
                </div>

                {order.items && order.items.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-300">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 text-amber-300">{item.quantity}x</span>
                        {item.menuItemName || 'Item'}
                      </span>
                      <span className="text-slate-500">{formatPrice(item.totalPrice || 0)}</span>
                    </li>
                  ))}
                  {order.items.length > 3 && (
                    <li className="text-xs text-slate-500">
                      + {order.items.length - 3} more items
                    </li>
                  )}
                </ul>
                ) : (
                  <div className="text-sm text-slate-500">No line items attached.</div>
                )}
              </div>
            </div>

            {order.specialInstructions && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-sm text-amber-100">
                <span className="mr-2 text-amber-300">Notes:</span>
                <span className="italic">{order.specialInstructions}</span>
              </div>
            )}

            {order.status === 'pending' && onStatusChange && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => onStatusChange(order.id, 'verified')}
                  variant="primary"
                  className="flex-1 justify-center"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve And Send To Kitchen
                </Button>
                <Button
                  onClick={() => onStatusChange(order.id, 'cancelled')}
                  variant="danger"
                  className="flex-1 justify-center"
                >
                  Reject
                </Button>
              </div>
            )}

            {order.status !== 'pending' && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm">
                <span className="text-slate-400">Workflow Status</span>
                <span className={`font-medium ${style.heading}`}>
                  {order.status === 'verified' && 'Approved and queued for kitchen'}
                  {order.status === 'preparing' && 'Kitchen is actively preparing this order'}
                  {order.status === 'ready' && 'Ready for waiter pickup or handoff'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Empty state
  if (onlineOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
          <Globe className="h-8 w-8 text-amber-300" />
        </div>
        <p className="text-lg font-semibold text-slate-100">No online orders yet</p>
        <p className="mt-2 text-sm text-slate-400">
          Share your QR code to start receiving online orders
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.26)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              <Globe className="h-3.5 w-3.5" />
              Online Orders Desk
            </div>
            <h3 className="text-2xl font-semibold text-slate-50">Supervisor Review Queue</h3>
            <p className="mt-1 text-sm text-slate-400">
              Review incoming web orders, approve them for kitchen, and monitor progress through fulfillment.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Active Orders</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{onlineOrders.length}</div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Revenue</div>
              <div className="mt-1 text-2xl font-semibold text-amber-300">{formatPrice(totalOnlineRevenue)}</div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3 col-span-2 sm:col-span-1">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Latest Activity</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{latestOrderTime || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={`rounded-2xl border p-4 ${sectionStyles.pending.shell}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Awaiting Approval</div>
              <div className="mt-2 text-3xl font-semibold text-slate-50">
            {statusCounts.pending}
              </div>
            </div>
            <AlertCircle className="h-8 w-8 text-red-300" />
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${sectionStyles.verified.shell}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Approved</div>
              <div className="mt-2 text-3xl font-semibold text-slate-50">
            {statusCounts.verified}
              </div>
            </div>
            <CheckCircle className="h-8 w-8 text-blue-300" />
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${sectionStyles.preparing.shell}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Preparing</div>
              <div className="mt-2 text-3xl font-semibold text-slate-50">
            {statusCounts.preparing}
              </div>
            </div>
            <Clock className="h-8 w-8 text-amber-300" />
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${sectionStyles.ready.shell}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Ready</div>
              <div className="mt-2 text-3xl font-semibold text-slate-50">
            {statusCounts.ready}
              </div>
            </div>
            <Package className="h-8 w-8 text-emerald-300" />
          </div>
        </div>
      </div>

      {pendingApprovalOrders.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/55 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-300">
            <AlertCircle className="w-4 h-4" />
            Awaiting Supervisor Approval ({pendingApprovalOrders.length})
          </h4>
          <div className="space-y-2">
            {pendingApprovalOrders.map((order) => (
              <OrderCard key={order.id} order={order} variant="compact" />
            ))}
          </div>
        </div>
      )}

      {approvedPipelineOrders.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/55 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-300">
            <CheckCircle className="w-4 h-4" />
            Approved Orders Pipeline ({approvedPipelineOrders.length})
          </h4>

          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by order #, ID, or customer..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-400"
              />
            </div>
            <select
              value={tableStatusFilter}
              onChange={(e) => setTableStatusFilter(e.target.value)}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All statuses</option>
              <option value="verified">Verified</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="served">Served</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="mb-3 text-sm text-slate-400">
            Showing <span className="font-medium text-slate-100">{filteredApprovedPipelineOrders.length}</span> of{' '}
            <span className="font-medium text-slate-100">{approvedPipelineOrders.length}</span> non-pending online orders
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead className="bg-slate-800/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredApprovedPipelineOrders.length > 0 ? (
                  filteredApprovedPipelineOrders.slice(
                    (pipelinePage - 1) * PIPELINE_PAGE_SIZE,
                    pipelinePage * PIPELINE_PAGE_SIZE
                  ).map((order) => {
                  const customerName = (order as any).customer_name || order.customerName || 'Guest';
                  const createdAt = (order as any).created_at || order.createdAt;
                  const total = (order as any).total || order.total || 0;
                  const itemCount = order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

                  const statusClasses =
                    order.status === 'verified'
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : order.status === 'preparing'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : order.status === 'ready'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : order.status === 'served' || order.status === 'completed'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : order.status === 'cancelled'
                      ? 'bg-red-500/15 text-red-300 border-red-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';

                  return (
                    <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-100">
                        {(order as any).orderNumber || `#${order.id.slice(-6)}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{customerName}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{itemCount} item{itemCount !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 text-sm font-medium text-amber-300">{formatPrice(total)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses}`}>
                          {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {createdAt
                          ? new Date(createdAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No online orders match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pipelinePage} pageSize={PIPELINE_PAGE_SIZE} totalCount={filteredApprovedPipelineOrders.length} onPageChange={setPipelinePage} />
        </div>
      )}
    </div>
  );
}
