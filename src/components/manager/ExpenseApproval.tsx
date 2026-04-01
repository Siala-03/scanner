import React, { useState, useEffect } from 'react';
import {
  fetchExpenses,
  createExpense,
  approveExpense,
  rejectExpense,
  getExpensesPendingApproval,
  getExpenseApprovalSummary,
  fetchExpenseCategories,
  generateReceipt,
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
  CheckCircle,
  XCircle,
  Send,
  MessageSquare,
  History,
  AlertCircle,
} from 'lucide-react';

interface ExpenseWithDetails extends Omit<Expense, 'notes'> {
  notes_?: any[];
  auditLog?: any[];
  receipt?: any;
}

export default function ManagerExpenseApproval() {
  const [pendingExpenses, setPendingExpenses] = useState<ExpenseWithDetails[]>([]);
  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseWithDetails[]>([]);
  const [rejectedExpenses, setRejectedExpenses] = useState<ExpenseWithDetails[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'create'>('pending');
  const [formData, setFormData] = useState<ExpenseFormData>({
    categoryId: '',
    vendorName: '',
    description: '',
    amount: 0,
    currency: 'USD',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    isRecurring: false,
    taxAmount: 0,
    taxRate: 0,
    isTaxDeductible: false,
  });

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pending, approved, rejected, cats, sum] = await Promise.all([
        getExpensesPendingApproval(),
        fetchExpenses({ approvalStatus: 'approved' }),
        fetchExpenses({ approvalStatus: 'rejected' }),
        fetchExpenseCategories(),
        getExpenseApprovalSummary(),
      ]);

      setPendingExpenses(pending.data);
      setApprovedExpenses(approved.data);
      setRejectedExpenses(rejected.data);
      setCategories(cats);
      setSummary(sum);
      setError(null);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId || !formData.description || formData.amount <= 0) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const newExpense = await createExpense({
        ...formData,
        createdByRole: 'manager',
      });
      setApprovedExpenses([newExpense, ...approvedExpenses]); // Managers can create pre-approved expenses
      setTab('pending');
      setFormData({
        categoryId: '',
        vendorName: '',
        description: '',
        amount: 0,
        currency: 'USD',
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        isRecurring: false,
        taxAmount: 0,
        taxRate: 0,
        isTaxDeductible: false,
      });
      setTab('approved');
      setError(null);
    } catch (err) {
      setError('Failed to create expense');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveExpense = async (expenseId: string) => {
    try {
      setLoading(true);
      await approveExpense(expenseId, approvalNotes);

      setPendingExpenses(pendingExpenses.filter(e => e.id !== expenseId));
      const approved = pendingExpenses.find(e => e.id === expenseId);
      if (approved) {
        setApprovedExpenses([
          { ...approved, approvalStatus: 'approved' as ApprovalStatus },
          ...approvedExpenses,
        ]);
      }

      setSelectedExpense(null);
      setShowDetails(false);
      setApprovalNotes('');
      setError(null);
    } catch (err) {
      setError('Failed to approve expense');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectExpense = async (expenseId: string) => {
    if (!rejectionReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }

    try {
      setLoading(true);
      await rejectExpense(expenseId, rejectionReason);

      setPendingExpenses(pendingExpenses.filter(e => e.id !== expenseId));
      const rejected = pendingExpenses.find(e => e.id === expenseId);
      if (rejected) {
        setRejectedExpenses([
          {
            ...rejected,
            approvalStatus: 'rejected' as ApprovalStatus,
            rejectionReason,
          },
          ...rejectedExpenses,
        ]);
      }

      setSelectedExpense(null);
      setShowDetails(false);
      setRejectionReason('');
      setError(null);
    } catch (err) {
      setError('Failed to reject expense');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReceipt = async (expenseId: string) => {
    try {
      setLoading(true);
      await generateReceipt(expenseId);
      if (selectedExpense?.id === expenseId) {
        const updated = [
          ...pendingExpenses,
          ...approvedExpenses,
          ...rejectedExpenses,
        ].find(e => e.id === expenseId);
        setSelectedExpense(updated || null);
      }
      setError(null);
    } catch (err) {
      setError('Failed to generate receipt');
      console.error(err);
    } finally {
      setLoading(false);
    }
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

  const renderExpenseTable = (expenses: ExpenseWithDetails[], showActions: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800 border-b border-slate-700">
          <tr>
            <th className="px-3 md:px-6 py-3 text-left text-sm md:text-base font-medium text-slate-300">
              Description
            </th>
            <th className="px-3 md:px-6 py-3 text-left text-sm md:text-base font-medium text-slate-300">
              Category
            </th>
            <th className="px-3 md:px-6 py-3 text-left text-sm md:text-base font-medium text-slate-300">
              Amount
            </th>
            <th className="px-3 md:px-6 py-3 text-left text-sm md:text-base font-medium text-slate-300">
              Created By
            </th>
            <th className="px-3 md:px-6 py-3 text-left text-sm md:text-base font-medium text-slate-300">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {expenses.map(expense => (
            <tr key={expense.id} className="hover:bg-slate-700/50 border-t border-slate-700">
              <td className="px-3 md:px-6 py-4 text-sm md:text-base text-slate-100">{expense.description}</td>
              <td className="px-3 md:px-6 py-4 text-sm md:text-base text-slate-100">
                {expense.category?.name || 'N/A'}
              </td>
              <td className="px-3 md:px-6 py-4 text-sm md:text-base font-medium text-slate-100">
                {expense.currency} {Number(expense.amount).toFixed(2)}
              </td>
              <td className="px-3 md:px-6 py-4 text-sm md:text-base text-slate-100">
                <span className="inline-block px-2 py-1 bg-amber-900/40 text-amber-200 rounded text-xs border border-amber-700">
                  {expense.createdByRole}
                </span>
              </td>
              <td className="px-3 md:px-6 py-4 space-x-2">
                <button
                  onClick={() => handleViewDetails(expense)}
                  className="text-amber-400 hover:text-amber-300 text-sm"
                >
                  View
                </button>
                {showActions && (
                  !expense.receipt && (
                    <button
                      onClick={() => handleGenerateReceipt(expense.id)}
                      className="text-purple-600 hover:text-purple-800 text-sm"
                    >
                      Receipt
                    </button>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-full mx-auto px-4 md:px-6 py-4">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Expense Approval Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage and approve expenses</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="text-red-400" size={20} />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {summary.map((item: any) => (
            <div key={item.approval_status} className="bg-slate-800 rounded-lg shadow p-4 border border-slate-700">
              <p className="text-sm text-slate-400 mb-2">
                {item.approval_status.replace(/_/g, ' ').toUpperCase()}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-slate-100">{item.count}</p>
              <p className="text-sm text-slate-400 mt-2">
                RWF {Number(item.total_amount || 0).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-slate-800 rounded-lg shadow border border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setTab('pending')}
            className={`flex-1 px-6 py-4 font-medium border-b-2 transition ${
              tab === 'pending'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending Approval ({pendingExpenses.length})
          </button>
          <button
            onClick={() => setTab('approved')}
            className={`flex-1 px-6 py-4 font-medium border-b-2 transition ${
              tab === 'approved'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Approved ({approvedExpenses.length})
          </button>
          <button
            onClick={() => setTab('rejected')}
            className={`flex-1 px-6 py-4 font-medium border-b-2 transition ${
              tab === 'rejected'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Rejected ({rejectedExpenses.length})
          </button>
          <button
            onClick={() => setTab('create')}
            className={`flex-1 px-6 py-4 font-medium border-b-2 transition ${
              tab === 'create'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Create
          </button>
        </div>

        {/* Pending Expenses */}
        {tab === 'pending' && (
          <div className="overflow-hidden">
            {pendingExpenses.length > 0 ? (
              renderExpenseTable(pendingExpenses, true)
            ) : (
              <p className="p-6 text-center text-slate-400">
                No pending expenses for approval
              </p>
            )}
          </div>
        )}

        {/* Approved Expenses */}
        {tab === 'approved' && (
          <div className="overflow-hidden">
            {approvedExpenses.length > 0 ? (
              renderExpenseTable(approvedExpenses, true)
            ) : (
              <p className="p-6 text-center text-slate-400">
                No approved expenses
              </p>
            )}
          </div>
        )}

        {/* Rejected Expenses */}
        {tab === 'rejected' && (
          <div className="overflow-hidden">
            {rejectedExpenses.length > 0 ? (
              renderExpenseTable(rejectedExpenses, false)
            ) : (
              <p className="p-6 text-center text-slate-400">
                No rejected expenses
              </p>
            )}
          </div>
        )}

        {/* Create Form */}
        {tab === 'create' && (
          <div className="p-4 md:p-6 lg:p-8">
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-white">Create New Expense</h2>
            <form onSubmit={handleCreateExpense} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <div>
                  <label className="block text-sm md:text-base font-medium mb-2 text-slate-300">
                    Category*
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={e =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    className="w-full border border-slate-600 rounded-lg px-3 py-2 md:py-3 bg-slate-700 text-slate-200 text-sm md:text-base focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm md:text-base font-medium mb-2 text-slate-300">
                    Vendor Name
                  </label>
                  <input
                    type="text"
                    value={formData.vendorName}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        vendorName: e.target.value,
                      })
                    }
                    className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g., ABC Supplies"
                  />
                </div>
                <div>
                  <label className="block text-sm md:text-base font-medium mb-2 text-slate-300">
                    Description*
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                    className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                    placeholder="Expense description"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm md:text-base font-medium mb-2 text-slate-300">
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
                    className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm md:text-base font-medium mb-2 text-slate-300">
                    Expense Date*
                  </label>
                  <input
                    type="date"
                    value={formData.expenseDate}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        expenseDate: e.target.value,
                      })
                    }
                    className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm md:text-base font-medium mb-2 text-slate-300">
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
                    className="w-full border border-slate-600 bg-slate-700 text-slate-200 rounded-lg px-3 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="check">Check</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-start pt-4 border-t border-slate-700">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-6 md:px-8 py-2 md:py-3 rounded-lg font-medium text-sm md:text-base transition"
                >
                  {loading ? 'Creating...' : 'Create Expense'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && selectedExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-800 rounded-lg max-w-4xl w-full my-8 border border-slate-700">
            <div className="p-6 space-y-4">
              <h2 className="text-2xl font-bold text-slate-100">Expense Details</h2>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Description</p>
                  <p className="font-medium text-slate-100">{selectedExpense.description}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Category</p>
                  <p className="font-medium text-slate-100">{selectedExpense.category?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Amount</p>
                  <p className="font-medium text-slate-100">
                    {selectedExpense.currency}{' '}
                    {Number(selectedExpense.amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Created By</p>
                  <p className="font-medium text-slate-100">
                    {selectedExpense.createdByRole}
                  </p>
                </div>
              </div>

              {/* Approval Section - Only show if pending */}
              {selectedExpense.approvalStatus === 'pending_approval' && (
                <div className="border-t border-slate-700 pt-4 space-y-3">
                  <h3 className="font-bold text-slate-100">Approval Actions</h3>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Approval Notes (Optional)
                    </label>
                    <textarea
                      value={approvalNotes}
                      onChange={e => setApprovalNotes(e.target.value)}
                      className="w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-700 text-slate-100 focus:outline-none focus:border-amber-500"
                      rows={2}
                      placeholder="Add any notes about this approval..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveExpense(selectedExpense.id)}
                      disabled={loading}
                      className="flex-1 bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50 flex items-center justify-center gap-2 transition"
                    >
                      <CheckCircle size={18} />
                      Approve
                    </button>
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-2 text-slate-300">
                        Rejection Reason
                      </label>
                      <textarea
                        value={rejectionReason}
                        onChange={e => setRejectionReason(e.target.value)}
                        className="w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-700 text-slate-100 focus:outline-none focus:border-amber-500"
                        placeholder="Reason for rejection (required if rejecting)"
                      />
                      <button
                        onClick={() =>
                          handleRejectExpense(selectedExpense.id)
                        }
                        disabled={loading}
                        className="w-full mt-2 bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-2 transition"
                      >
                        <XCircle size={18} />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Rejection Reason - Show if rejected */}
              {selectedExpense.approvalStatus === 'rejected' &&
                selectedExpense.rejectionReason && (
                  <div className="border-t border-slate-700 pt-4 bg-red-900/30 p-4 rounded border border-red-700">
                    <p className="text-sm font-medium text-red-300 mb-2">
                      Rejection Reason:
                    </p>
                    <p className="text-sm text-red-200">
                      {selectedExpense.rejectionReason}
                    </p>
                  </div>
                )}

              {/* Tabs */}
              <div className="border-t border-slate-700 pt-4">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setShowNotes(false)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                      !showNotes
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <History size={16} />
                    History
                  </button>
                  <button
                    onClick={() => setShowNotes(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                      showNotes
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare size={16} />
                    Notes
                  </button>
                </div>

                {/* History Tab */}
                {!showNotes && selectedExpense.auditLog && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedExpense.auditLog.map((log: any) => (
                      <div key={log.id} className="p-3 bg-gray-50 rounded">
                        <p className="text-sm font-medium">{log.action}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(log.createdAt).toLocaleDateString()} -{' '}
                          {log.performedByRole}
                        </p>
                        {log.notes && (
                          <p className="text-sm text-gray-700 mt-1">
                            {log.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes Tab */}
                {showNotes && (
                  <div className="space-y-3">
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {selectedExpense.notes_ &&
                        selectedExpense.notes_.map((note: any) => (
                          <div
                            key={note.id}
                            className="p-3 bg-gray-50 rounded"
                          >
                            <div className="flex justify-between items-start">
                              <p className="text-xs font-medium text-gray-600">
                                {note.createdByName} ({note.createdByRole})
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(
                                  note.createdAt
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <p className="text-sm text-gray-700 mt-2">
                              {note.content}
                            </p>
                          </div>
                        ))}
                    </div>
                    <div>
                      <textarea
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Add a note..."
                      />
                      <button
                        onClick={() => handleAddNote(selectedExpense.id)}
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
                className="w-full bg-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
