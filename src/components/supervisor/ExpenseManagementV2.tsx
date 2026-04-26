import React, { useEffect, useMemo, useState } from 'react';
import { Pagination } from '../ui/Pagination';
import { createExpense, fetchExpenseCategories, fetchExpenses } from '../../api/expenses';
import type { Expense, ExpenseCategory, ExpenseFormData } from '../../types/expenses';

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function SupervisorExpenseManagementV2() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [expenses]);

  const [form, setForm] = useState<ExpenseFormData>({
    categoryId: '',
    vendorName: '',
    description: '',
    amount: 0,
    currency: 'RWF',
    expenseDate: todayIsoDate(),
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    referenceNumber: '',
    notes: '',
    isRecurring: false,
    taxAmount: 0,
    taxRate: 0,
    isTaxDeductible: false,
    approvalStatus: 'pending',
    createdByRole: 'supervisor',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [cats, allExpenses] = await Promise.all([
        fetchExpenseCategories(),
        fetchExpenses(),
      ]);

      setCategories(cats);
      if (cats.length > 0 && !form.categoryId) {
        setForm((prev) => ({ ...prev, categoryId: cats[0].id }));
      }

      setExpenses(allExpenses);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load expenses';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const summary = useMemo(() => {
    const pending = expenses.filter((e) => e.approvalStatus === 'pending').length;
    const approved = expenses.filter((e) => e.approvalStatus === 'approved').length;
    const rejected = expenses.filter((e) => e.approvalStatus === 'rejected').length;
    return { pending, approved, rejected };
  }, [expenses]);

  const onCreateExpense = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.categoryId || !form.description.trim() || Number(form.amount) <= 0) {
      setError('Category, description, and amount are required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const created = await createExpense({
        ...form,
        amount: Number(form.amount),
        expenseDate: form.expenseDate || todayIsoDate(),
        approvalStatus: 'pending',
        createdByRole: 'supervisor',
      });

      setExpenses((prev) => [created, ...prev]);
      setForm((prev) => ({
        ...prev,
        description: '',
        amount: 0,
        vendorName: '',
        referenceNumber: '',
        notes: '',
        expenseDate: todayIsoDate(),
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create expense';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-slate-900 text-slate-100 p-6 rounded-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Supervisor Expenses</h1>
          <p className="text-slate-400 text-sm">Create expenses that go to manager pending approval.</p>
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
          <p className="text-xl font-semibold text-amber-300">{summary.pending}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400">Approved</p>
          <p className="text-xl font-semibold text-emerald-300">{summary.approved}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400">Rejected</p>
          <p className="text-xl font-semibold text-red-300">{summary.rejected}</p>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={onCreateExpense} className="rounded border border-slate-700 bg-slate-800 p-4 space-y-4">
        <h2 className="text-lg font-semibold">New Expense</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="text-slate-300">Category</span>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
              required
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm space-y-1">
            <span className="text-slate-300">Amount</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
              required
            />
          </label>

          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-slate-300">Description</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
              required
            />
          </label>

          <label className="text-sm space-y-1">
            <span className="text-slate-300">Vendor</span>
            <input
              type="text"
              value={form.vendorName || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, vendorName: e.target.value }))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
            />
          </label>

          <label className="text-sm space-y-1">
            <span className="text-slate-300">Reference</span>
            <input
              type="text"
              value={form.referenceNumber || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, referenceNumber: e.target.value }))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Create and Send to Pending'}
        </button>
      </form>

      <div className="rounded border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((expense) => {
              const category = categories.find((c) => c.id === expense.categoryId)?.name || 'Uncategorized';
              return (
                <tr key={expense.id} className="border-t border-slate-700">
                  <td className="px-4 py-3">{expense.description}</td>
                  <td className="px-4 py-3">{category}</td>
                  <td className="px-4 py-3">RWF {Number(expense.amount || 0).toFixed(0)}</td>
                  <td className="px-4 py-3">{expense.approvalStatus}</td>
                  <td className="px-4 py-3">{new Date(expense.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">No expenses yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} totalCount={expenses.length} onPageChange={setPage} />
    </div>
  );
}
