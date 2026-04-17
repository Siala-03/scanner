import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchExpenses,
  createExpense,
  submitExpenseForApproval,
  fetchExpenseCategories,
  getExpenseNotes,
  createExpenseNote,
  getExpenseAuditLog,
} from '../../api/expenses';
import {
  Expense,
  ExpenseCategory,
  ExpenseFormData,
  ApprovalStatus,
} from '../../types/expenses';
import {
  Plus,
  Send,
  MessageSquare,
  History,
  AlertCircle,
  RefreshCw,
  Search,
} from 'lucide-react';

interface ExpenseWithDetails extends Omit<Expense, 'notes'> {
  notes_?: any[];
  auditLog?: any[];
  receipt?: any;
}

export default function SupervisorExpenseManagement() {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [formData, setFormData] = useState<ExpenseFormData>({
    categoryId: '',
    vendorName: '',
    description: '',
    amount: 0,
    currency: 'RWF',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    isRecurring: false,
    taxAmount: 0,
    taxRate: 0,
    isTaxDeductible: false,
  });

  // Load categories and expenses on mount
  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setFormData({
      categoryId: '',
      vendorName: '',
      description: '',
      amount: 0,
      currency: 'RWF',
      expenseDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      isRecurring: false,
      taxAmount: 0,
      taxRate: 0,
      isTaxDeductible: false,
    });
  };

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => map.set(cat.id, cat.name));
    return map;
  }, [categories]);

  const filteredExpenses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return expenses.filter((expense) => {
      const categoryName = expense.category?.name || categoryNameById.get(expense.categoryId) || expense.categoryId || '';
      const matchesStatus = statusFilter === 'all' || expense.approvalStatus === statusFilter;
      const matchesCategory = categoryFilter === 'all' || expense.categoryId === categoryFilter;
      const matchesQuery =
        !query ||
        expense.description.toLowerCase().includes(query) ||
        String(expense.vendorName || '').toLowerCase().includes(query) ||
        categoryName.toLowerCase().includes(query) ||
        String(expense.referenceNumber || '').toLowerCase().includes(query);

      return matchesStatus && matchesCategory && matchesQuery;
    });
  }, [expenses, searchQuery, statusFilter, categoryFilter, categoryNameById]);

  const summary = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const draftCount = filteredExpenses.filter((e) => e.approvalStatus === 'draft').length;
    const pendingCount = filteredExpenses.filter((e) => e.approvalStatus === 'pending' || e.approvalStatus === 'pending_approval').length;
    const approvedCount = filteredExpenses.filter((e) => e.approvalStatus === 'approved').length;
    return {
      totalAmount,
      totalCount: filteredExpenses.length,
      draftCount,
      pendingCount,
      approvedCount,
    };
  }, [filteredExpenses]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch categories
      let categoriesData: ExpenseCategory[] = [];
      try {
        categoriesData = await fetchExpenseCategories();
        console.log('📋 Categories loaded:', categoriesData.length, 'categories');
      } catch (catErr) {
        console.error('❌ Failed to load categories:', catErr);
        setError('Failed to load expense categories');
      }
      
      // Fetch expenses
      let expensesData: Expense[] = [];
      try {
        expensesData = await fetchExpenses({ createdByRole: 'supervisor' });
      } catch (expErr) {
        console.error('❌ Failed to load expenses:', expErr);
        setError((prev) => prev || 'Failed to load expenses');
      }
      
      setCategories(categoriesData || []);
      if ((categoriesData || []).length > 0) {
        setFormData((prev) => ({
          ...prev,
          categoryId: prev.categoryId || categoriesData[0].id,
        }));
      }
      setExpenses(expensesData || []);
    } catch (err) {
      setError('Failed to load data');
      console.error('❌ Critical error in loadData:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedAmount = Number(formData.amount);
    const normalizedTaxRate = Number(formData.taxRate || 0);

    if (!formData.categoryId || !formData.description.trim() || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setError('Please fill in all required fields');
      return;
    }

    if (!Number.isFinite(normalizedTaxRate) || normalizedTaxRate < 0 || normalizedTaxRate > 100) {
      setError('Tax rate must be between 0 and 100');
      return;
    }

    const computedTaxAmount = Math.round((normalizedAmount * normalizedTaxRate) / 100);

    try {
      setLoading(true);
      const newExpense = await createExpense({
        ...formData,
        amount: normalizedAmount,
        taxRate: normalizedTaxRate,
        taxAmount: computedTaxAmount,
        approvalStatus: 'pending',
        createdByRole: 'supervisor',
      });
      setExpenses([newExpense, ...expenses]);
      setShowForm(false);
      resetForm();
      setError(null);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Failed to create expense';
      setError(`Failed to create expense: ${message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForApproval = async (expenseId: string) => {
    try {
      setLoading(true);
      const updated = await submitExpenseForApproval(expenseId);
      setExpenses(expenses.map(e => e.id === expenseId ? updated : e));
      setSelectedExpense(null);
      setError(null);
    } catch (err) {
      setError('Failed to submit expense for approval');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReceipt = (_expenseId: string) => {
    window.print();
  };

  const handleAddNote = async (expenseId: string) => {
    if (!newNote.trim()) return;

    try {
      setLoading(true);
      await createExpenseNote(expenseId, 'comment', newNote);
      const notes = await getExpenseNotes(expenseId);
      if (selectedExpense?.id === expenseId) {
        setSelectedExpense({ ...selectedExpense, notes_: notes });
      }
      setNewNote('');
      setError(null);
    } catch (err) {
      setError('Failed to add note');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (expense: Expense) => {
    try {
      setLoading(true);
      const [notes, auditLog] = await Promise.all([
        getExpenseNotes(expense.id),
        getExpenseAuditLog(expense.id),
      ]);
      setSelectedExpense({ ...expense, notes_: notes, auditLog });
      setShowDetails(true);
      setError(null);
    } catch (err) {
      setError('Failed to load expense details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: ApprovalStatus) => {
    switch (status) {
      case 'draft':
        return 'bg-slate-700 text-slate-100';
      case 'pending_approval':
      case 'pending':
        return 'bg-amber-900/40 text-amber-300';
      case 'approved':
        return 'bg-emerald-900/40 text-emerald-300';
      case 'rejected':
        return 'bg-red-900/40 text-red-300';
      case 'recalled':
        return 'bg-purple-900/40 text-purple-300';
      default:
        return 'bg-slate-700 text-slate-100';
    }
  };

  return (
    <div className="supervisor-surface space-y-6 bg-slate-900 text-slate-100 p-6 rounded-lg transition-colors">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Expense Management</h1>
          <p className="text-slate-400 text-sm mt-1">Track, submit, and follow expense approvals with better visibility.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-700 text-slate-100 px-4 py-2 rounded-lg hover:bg-slate-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => {
              if (showForm) resetForm();
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            {showForm ? 'Close Form' : 'New Expense'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400 uppercase">Visible Expenses</p>
          <p className="text-xl font-semibold">{summary.totalCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400 uppercase">Total Amount</p>
          <p className="text-xl font-semibold">RWF {summary.totalAmount.toFixed(0)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400 uppercase">Draft</p>
          <p className="text-xl font-semibold">{summary.draftCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400 uppercase">Pending</p>
          <p className="text-xl font-semibold text-amber-400">{summary.pendingCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p className="text-xs text-slate-400 uppercase">Approved</p>
          <p className="text-xl font-semibold text-emerald-400">{summary.approvedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, vendor, category, ref..."
            className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg pl-9 pr-3 py-2"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ApprovalStatus)}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending Approval</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="recalled">Recalled</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600" size={20} />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-lg shadow p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 text-slate-100">Create New Expense</h2>
          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Category*</label>
                {categories.length === 0 ? (
                  <div className="w-full border border-red-600 rounded-lg px-3 py-2 bg-red-900/20 text-red-300 text-sm">
                    ⚠️ No categories available. Please refresh the page.
                  </div>
                ) : (
                  <select
                    value={formData.categoryId}
                    onChange={e =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    className="w-full border border-slate-600 rounded-lg px-3 py-2 bg-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Vendor Name
                </label>
                <input
                  type="text"
                  value={formData.vendorName}
                  onChange={e =>
                    setFormData({ ...formData, vendorName: e.target.value })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  placeholder="e.g., ABC Supplies"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Description*
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  placeholder="Expense description"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Amount*
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      amount: parseFloat(e.target.value),
                    })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Expense Date*
                </label>
                <input
                  type="date"
                  value={formData.expenseDate}
                  onChange={e =>
                    setFormData({ ...formData, expenseDate: e.target.value })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Payment Method
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      paymentMethod: e.target.value as any,
                    })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="cash">Cash</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="debit_card">Debit Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  value={formData.taxRate}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      taxRate: parseFloat(e.target.value),
                    })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  step="0.01"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={formData.referenceNumber}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      referenceNumber: e.target.value,
                    })
                  }
                  className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  placeholder="Invoice/Receipt number"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                rows={3}
                placeholder="Additional notes"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isTaxDeductible}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      isTaxDeductible: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <span className="text-sm">Tax Deductible</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition"
              >
                {loading ? 'Creating...' : 'Create Expense'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses List */}
      <div className="bg-slate-800 rounded-lg shadow overflow-hidden border border-slate-700">
        <table className="w-full">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                Description
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                Category
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredExpenses.map(expense => (
              <tr key={expense.id} className="hover:bg-slate-700/50 text-slate-200">
                <td className="px-6 py-4 text-sm">{expense.description}</td>
                <td className="px-6 py-4 text-sm">
                  {expense.category?.name || categoryNameById.get(expense.categoryId) || expense.categoryId || 'Uncategorized'}
                </td>
                <td className="px-6 py-4 text-sm font-medium">
                  {expense.currency} {Number(expense.amount).toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      expense.approvalStatus
                    )}`}
                  >
                    {expense.approvalStatus}
                  </span>
                </td>
                <td className="px-6 py-4 space-x-2">
                  <button
                    onClick={() => handleViewDetails(expense)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View
                  </button>
                  {(expense.approvalStatus === 'draft' || expense.approvalStatus === 'pending_approval') && (
                    <button
                      onClick={() => handleSubmitForApproval(expense.id)}
                      disabled={loading}
                      className="text-green-600 hover:text-green-800 text-sm"
                    >
                      Submit
                    </button>
                  )}
                  {!expense.receipt && (
                    <button
                      onClick={() => handleGenerateReceipt(expense.id)}
                      className="text-purple-600 hover:text-purple-800 text-sm"
                    >
                      Receipt
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredExpenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  No expenses match your current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {showDetails && selectedExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto border border-slate-700">
            <div className="p-6 space-y-4 text-slate-100">
              <h2 className="text-2xl font-bold">Expense Details</h2>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Description</p>
                  <p className="font-medium">{selectedExpense.description}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Category</p>
                  <p className="font-medium">
                    {selectedExpense.category?.name || categoryNameById.get(selectedExpense.categoryId) || selectedExpense.categoryId || 'Uncategorized'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Amount</p>
                  <p className="font-medium">
                    {selectedExpense.currency} {Number(selectedExpense.amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Status</p>
                  <p
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      selectedExpense.approvalStatus
                    )}`}
                  >
                    {selectedExpense.approvalStatus}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-t pt-4">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setShowNotes(false)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      !showNotes
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    <History size={16} />
                    History
                  </button>
                  <button
                    onClick={() => setShowNotes(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      showNotes
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    <MessageSquare size={16} />
                    Notes
                  </button>
                </div>

                {/* History Tab */}
                {!showNotes && selectedExpense.auditLog && (
                  <div className="space-y-2">
                    {selectedExpense.auditLog.map((log: any) => (
                      <div key={log.id} className="p-3 bg-slate-700 rounded border border-slate-600">
                        <p className="text-sm font-medium">{log.action}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(log.createdAt).toLocaleDateString()} -{' '}
                          {log.performedByRole}
                        </p>
                        {log.notes && (
                          <p className="text-sm text-slate-200 mt-1">{log.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes Tab */}
                {showNotes && (
                  <div className="space-y-3">
                    {selectedExpense.notes_ &&
                      selectedExpense.notes_.map((note: any) => (
                        <div key={note.id} className="p-3 bg-slate-700 rounded border border-slate-600">
                          <div className="flex justify-between items-start">
                            <p className="text-xs font-medium text-slate-300">
                              {note.createdByName} ({note.createdByRole})
                            </p>
                            <p className="text-xs text-slate-400">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-sm text-slate-100 mt-2">
                            {note.content}
                          </p>
                        </div>
                      ))}
                    <div className="mt-4">
                      <textarea
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        className="w-full border border-slate-600 bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                        rows={3}
                        placeholder="Add a note..."
                      />
                      <button
                        onClick={() =>
                          handleAddNote(selectedExpense.id)
                        }
                        className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
                      >
                        <Send size={16} />
                        Add Note
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowDetails(false)}
                className="w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
