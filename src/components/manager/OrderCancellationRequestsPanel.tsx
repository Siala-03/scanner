import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon, RefreshCwIcon, XCircleIcon, XIcon } from 'lucide-react';
import {
  approveOrderCancellationRequest,
  fetchOrderById,
  fetchOrderCancellationRequests,
  rejectOrderCancellationRequest,
  type OrderCancellationRequest,
} from '../../api/orders';
import type { Order } from '../../types';
import { formatPrice } from '../../utils/currency';

interface OrderCancellationRequestsPanelProps {
  restaurantId?: string;
  managerId?: string;
  managerName?: string;
}

type FilterStatus = 'pending' | 'approved' | 'rejected';

function OrderDetailModal({
  req,
  order,
  orderState,
  busyId,
  onClose,
  onApprove,
  onReject,
}: {
  req: OrderCancellationRequest;
  order: Order | null;
  orderState: 'loading' | 'error' | 'ready';
  busyId: string | null;
  onClose: () => void;
  onApprove: (req: OrderCancellationRequest) => void;
  onReject: (req: OrderCancellationRequest) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-700">
          <div>
            <h3 className="font-semibold text-slate-100 text-base">Order {req.order_id.slice(-8).toUpperCase()}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Cancellation request details</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors mt-0.5">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Request meta */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 divide-y divide-slate-700/60 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-400">Requested by</span>
              <span className="text-slate-100 font-medium">{req.requested_by_name || req.requested_by || 'Staff'}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-400">Reason</span>
              <span className="text-slate-100 text-right max-w-[60%]">{req.reason || 'No reason provided'}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-400">Requested at</span>
              <span className="text-slate-100">{new Date(req.requested_at).toLocaleString()}</span>
            </div>
            {req.status !== 'pending' && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-400">{req.status === 'approved' ? 'Approved by' : 'Rejected by'}</span>
                <span className="text-slate-100">{req.reviewed_by_name || req.reviewed_by || 'Manager'}</span>
              </div>
            )}
            {req.review_notes && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-400">Review note</span>
                <span className="text-slate-100 text-right max-w-[60%]">{req.review_notes}</span>
              </div>
            )}
          </div>

          {/* Order details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Order Details</p>
            {orderState === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                <RefreshCwIcon className="w-4 h-4 animate-spin" /> Loading…
              </div>
            )}
            {orderState === 'error' && (
              <p className="text-sm text-red-400 py-2">Failed to load order details.</p>
            )}
            {orderState === 'ready' && order && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 text-xs">
                  {order.tableNumber && (
                    <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-300">
                      Table {order.tableNumber}
                    </span>
                  )}
                  {order.customerName && (
                    <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-300">
                      {order.customerName}
                    </span>
                  )}
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-300 capitalize">
                    {order.status}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/80 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-center font-medium w-12">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => {
                        const name = item.menuItem?.name ?? item.menuItemName ?? 'Unknown item';
                        const unit = item.unitPrice ?? 0;
                        const subtotal = item.totalPrice ?? unit * item.quantity;
                        return (
                          <tr key={i} className="border-t border-slate-700/60 text-slate-200">
                            <td className="px-3 py-2">
                              {name}
                              {item.specialInstructions && (
                                <span className="block text-xs text-slate-500 mt-0.5">{item.specialInstructions}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-slate-300">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">{formatPrice(subtotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-800/60">
                      <tr className="border-t border-slate-700">
                        <td colSpan={2} className="px-3 py-2 text-right text-slate-400 text-xs font-medium">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-300">{formatPrice(order.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {(order.notes || order.specialInstructions) && (
                  <p className="text-xs text-slate-400 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                    <span className="font-medium text-slate-300">Notes: </span>
                    {order.notes || order.specialInstructions}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {req.status === 'pending' && (
          <div className="flex gap-2 px-5 py-4 border-t border-slate-700">
            <button
              onClick={() => onReject(req)}
              disabled={busyId === req.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <XCircleIcon className="w-4 h-4" /> Reject
            </button>
            <button
              onClick={() => onApprove(req)}
              disabled={busyId === req.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <CheckCircleIcon className="w-4 h-4" /> Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderCancellationRequestsPanel({
  restaurantId,
  managerId,
  managerName,
}: OrderCancellationRequestsPanelProps) {
  const [requests, setRequests] = useState<OrderCancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterStatus>('pending');
  const [selectedReq, setSelectedReq] = useState<OrderCancellationRequest | null>(null);
  const [orderCache, setOrderCache] = useState<Record<string, Order | 'loading' | 'error'>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await fetchOrderCancellationRequests('all', restaurantId);
      setRequests(all);
    } catch (err) {
      console.error('Failed to load cancellation requests:', err);
      setError('Failed to load cancellation requests');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => { void load(); }, 10000);
    return () => window.clearInterval(id);
  }, [load]);

  const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);
  const approved = useMemo(() => requests.filter((r) => r.status === 'approved'), [requests]);
  const rejected = useMemo(() => requests.filter((r) => r.status === 'rejected'), [requests]);

  const visible = activeTab === 'pending' ? pending : activeTab === 'approved' ? approved : rejected;

  const openModal = (req: OrderCancellationRequest) => {
    setSelectedReq(req);
    if (!orderCache[req.order_id]) {
      setOrderCache((prev) => ({ ...prev, [req.order_id]: 'loading' }));
      fetchOrderById(req.order_id)
        .then((order) => setOrderCache((prev) => ({ ...prev, [req.order_id]: order })))
        .catch(() => setOrderCache((prev) => ({ ...prev, [req.order_id]: 'error' })));
    }
  };

  const markApproved = async (request: OrderCancellationRequest) => {
    if (!window.confirm(`Approve cancellation for order ${request.order_id}?`)) return;
    setBusyId(request.id);
    try {
      await approveOrderCancellationRequest(request.id, { reviewedBy: managerId, reviewedByName: managerName });
      setSelectedReq(null);
      await load();
    } catch (err) {
      console.error('Failed to approve cancellation request:', err);
      alert('Failed to approve request.');
    } finally {
      setBusyId(null);
    }
  };

  const markRejected = async (request: OrderCancellationRequest) => {
    const reason = window.prompt('Optional rejection note:') || '';
    setBusyId(request.id);
    try {
      await rejectOrderCancellationRequest(request.id, { reviewNotes: reason, reviewedBy: managerId, reviewedByName: managerName });
      setSelectedReq(null);
      await load();
    } catch (err) {
      console.error('Failed to reject cancellation request:', err);
      alert('Failed to reject request.');
    } finally {
      setBusyId(null);
    }
  };

  const modalOrderEntry = selectedReq ? orderCache[selectedReq.order_id] : undefined;
  const modalOrder = modalOrderEntry && modalOrderEntry !== 'loading' && modalOrderEntry !== 'error' ? modalOrderEntry as Order : null;
  const modalOrderState = !modalOrderEntry ? 'loading' : modalOrderEntry === 'loading' ? 'loading' : modalOrderEntry === 'error' ? 'error' : 'ready';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Cancellation Requests</h2>
          <p className="text-sm text-slate-400 mt-0.5">Supervisors and waiters submit requests here for manager approval.</p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-700"
          disabled={loading}
        >
          <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => setActiveTab('pending')}
          className={`rounded-lg border px-4 py-3 text-left ${activeTab === 'pending' ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/60'}`}
        >
          <p className="text-xs text-slate-400">Pending</p>
          <p className="text-xl font-semibold text-amber-300">{pending.length}</p>
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`rounded-lg border px-4 py-3 text-left ${activeTab === 'approved' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/60'}`}
        >
          <p className="text-xs text-slate-400">Approved</p>
          <p className="text-xl font-semibold text-emerald-300">{approved.length}</p>
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`rounded-lg border px-4 py-3 text-left ${activeTab === 'rejected' ? 'border-red-500 bg-red-500/10' : 'border-slate-700 bg-slate-800/60'}`}
        >
          <p className="text-xs text-slate-400">Rejected</p>
          <p className="text-xl font-semibold text-red-300">{rejected.length}</p>
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-red-200 text-sm">{error}</div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 overflow-hidden">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-slate-400">No {activeTab} cancellation requests</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Requested By</th>
                  <th className="px-4 py-3 text-left font-medium">Reason</th>
                  <th className="px-4 py-3 text-left font-medium">Requested At</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((req) => (
                  <tr
                    key={req.id}
                    onClick={() => openModal(req)}
                    className="border-t border-slate-700/70 text-slate-200 cursor-pointer hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{req.order_id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-3">{req.requested_by_name || req.requested_by || 'Staff'}</td>
                    <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">{req.reason || 'No reason provided'}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(req.requested_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">Pending</span>
                      )}
                      {req.status === 'approved' && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">Approved</span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">Rejected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedReq && (
        <OrderDetailModal
          req={selectedReq}
          order={modalOrder}
          orderState={modalOrderState}
          busyId={busyId}
          onClose={() => setSelectedReq(null)}
          onApprove={markApproved}
          onReject={markRejected}
        />
      )}
    </div>
  );
}
