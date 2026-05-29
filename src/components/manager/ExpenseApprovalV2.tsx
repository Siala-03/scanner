  import React, { useEffect, useMemo, useState } from 'react';
import { approveExpense, fetchExpenseCategories, fetchExpenses, rejectExpense } from '../../api/expenses';
import type { Expense, ExpenseCategory } from '../../types/expenses';

interface RejectReasonMap {
  [expenseId: string]: string;
}

export default function ExpenseApprovalV2() {
  const [pending, setPending] = useState<Expense[]>([]);
  const [approved, setApproved] = useState<Expense[]>([]);
  const [rejected, setRejected] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectReasons, setRejectReasons] = useState<RejectReasonMap>({});

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [pendingList, approvedList, rejectedList, cats] = await Promise.all([
        fetchExpenses({ approvalStatus: 'pending' }),
        fetchExpenses({ approvalStatus: 'approved' }),
        fetchExpenses({ approvalStatus: 'rejected' }),
        fetchExpenseCategories(),
      ]);

      setPending(pendingList);
      setApproved(approvedList);
      setRejected(rejectedList);
      setCategories(cats);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load manager approvals';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, []);

  const totals = useMemo(() => ({
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
  }), [pending.length, approved.length, rejected.length]);

  const categoryName = (categoryId: string): string => {
    return categories.find((c) => c.id === categoryId)?.name || 'Uncategorized';
  };

  const onApprove = async (expenseId: string) => {
    try {
      setLoading(true);
      setError(null);
      await approveExpense(expenseId);
      await loadData();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to approve expense';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onReject = async (expenseId: string) => {
    const reason = (rejectReasons[expenseId] || '').trim();
    if (!reason) {
      setError('Rejection reason is required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await rejectExpense(expenseId, reason);
      setRejectReasons((prev) => ({ ...prev, [expenseId]: '' }));
      await loadData();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to reject expense';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const listToRender = tab === 'pending' ? pending : tab === 'approved' ? approved : rejected;

  return (
    <div className="space-y-6 bg-slate-900 text-slate-100 p-6 rounded-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Manager Expense Approval</h1>
          <p className="text-slate-400 text-sm">Pending expenses from supervisors appear here for approval.</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400">Pending</p>
          <p className="text-xl font-semibold text-amber-300">{totals.pending}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400">Approved</p>
          <p className="text-xl font-semibold text-emerald-300">{totals.approved}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400">Rejected</p>
          <p className="text-xl font-semibold text-red-300">{totals.rejected}</p>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="rounded border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-3 text-sm ${tab === 'pending' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-slate-300'}`}
          >
            Pending ({totals.pending})
          </button>
          <button
            onClick={() => setTab('approved')}
            className={`px-4 py-3 text-sm ${tab === 'approved' ? 'text-emerald-300 border-b-2 border-emerald-300' : 'text-slate-300'}`}
          >
            Approved ({totals.approved})
          </button>
          <button
            onClick={() => setTab('rejected')}
            className={`px-4 py-3 text-sm ${tab === 'rejected' ? 'text-red-300 border-b-2 border-red-300' : 'text-slate-300'}`}
          >
            Rejected ({totals.rejected})
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Created By</th>
              <th className="text-left px-4 py-3">Status</th>
              {tab === 'pending' && <th className="text-left px-4 py-3">Action</th>}
            </tr>
          </thead>
          <tbody>
            {listToRender.map((expense) => (
              <tr key={expense.id} className="border-t border-slate-700 align-top">
                <td className="px-4 py-3">{expense.description}</td>
                <td className="px-4 py-3">{categoryName(expense.categoryId)}</td>
                <td className="px-4 py-3">RWF {Number(expense.amount || 0).toFixed(0)}</td>
                <td className="px-4 py-3">{expense.createdByName || expense.createdBy || 'staff'}</td>
                <td className="px-4 py-3">{expense.approvalStatus}</td>
                {tab === 'pending' && (
                  <td className="px-4 py-3 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => void onApprove(expense.id)}
                        disabled={loading}
                        className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void onReject(expense.id)}
                        disabled={loading}
                        className="px-3 py-1 rounded bg-red-700 hover:bg-red-800 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Rejection reason"
                      value={rejectReasons[expense.id] || ''}
                      onChange={(e) => setRejectReasons((prev) => ({ ...prev, [expense.id]: e.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
                    />
                  </td>
                )}
              </tr>
            ))}
            {listToRender.length === 0 && (
              <tr>
                <td colSpan={tab === 'pending' ? 6 : 5} className="px-4 py-6 text-center text-slate-400">
                  No expenses in this state.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
