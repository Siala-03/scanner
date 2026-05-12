import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react';
import {
  approveOrderCancellationRequest,
  fetchOrderCancellationRequests,
  rejectOrderCancellationRequest,
  type OrderCancellationRequest,
} from '../../api/orders';

interface OrderCancellationRequestsPanelProps {
  restaurantId?: string;
  managerId?: string;
  managerName?: string;
}

type FilterStatus = 'pending' | 'approved' | 'rejected';

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 10000);
    return () => window.clearInterval(id);
  }, [load]);

  const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);
  const approved = useMemo(() => requests.filter((r) => r.status === 'approved'), [requests]);
  const rejected = useMemo(() => requests.filter((r) => r.status === 'rejected'), [requests]);

  const visible = activeTab === 'pending' ? pending : activeTab === 'approved' ? approved : rejected;

  const markApproved = async (request: OrderCancellationRequest) => {
    if (!window.confirm(`Approve cancellation for order ${request.order_id}?`)) return;
    setBusyId(request.id);
    try {
      await approveOrderCancellationRequest(request.id, {
        reviewedBy: managerId,
        reviewedByName: managerName,
      });
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
      await rejectOrderCancellationRequest(request.id, {
        reviewNotes: reason,
        reviewedBy: managerId,
        reviewedByName: managerName,
      });
      await load();
    } catch (err) {
      console.error('Failed to reject cancellation request:', err);
      alert('Failed to reject request.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Payment Cancellation Requests</h2>
          <p className="text-sm text-slate-400 mt-0.5">Supervisors submit requests here for manager approval.</p>
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
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-red-200 text-sm">
          {error}
        </div>
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
                  <th className="px-4 py-3 text-left font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((req) => (
                  <tr key={req.id} className="border-t border-slate-700/70 text-slate-200">
                    <td className="px-4 py-3 font-medium">{req.order_id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-3">{req.requested_by_name || req.requested_by || 'Supervisor'}</td>
                    <td className="px-4 py-3 text-slate-300">{req.reason || 'No reason provided'}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(req.requested_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {req.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void markApproved(req)}
                            disabled={busyId === req.id}
                            className="inline-flex items-center gap-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-2.5 py-1.5 text-xs text-white"
                          >
                            <CheckCircleIcon className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => void markRejected(req)}
                            disabled={busyId === req.id}
                            className="inline-flex items-center gap-1 rounded bg-red-700 hover:bg-red-600 disabled:opacity-50 px-2.5 py-1.5 text-xs text-white"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">
                          {req.reviewed_by_name || req.reviewed_by || 'Manager'} · {req.reviewed_at ? new Date(req.reviewed_at).toLocaleString() : '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
