import React, { useState, useEffect } from 'react';
import {
  fetchExpenses,
  createExpense,
  submitExpenseForApproval,
  fetchExpenseCategories,
  generateReceipt,
  getExpenseNotes,
  createExpenseNote,
  getExpenseAuditLog,
} from '../../api/expenses';
import { buildExpenseReceiptHtml, downloadExpenseReceiptHtml } from '../../utils/receipt';
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

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch categories
      let categoriesData: ExpenseCategory[] = [];
      try {
        categoriesData = await fetchExpenseCategories();
        console.log('📋 Categories loaded:', categoriesData.length, 'categories');
        
        if (!categoriesData || categoriesData.length === 0) {
          console.warn('⚠️ No expense categories available');
          setError('No expense categories available. Please contact administrator.');
        }
      } catch (catErr) {
        console.error('❌ Failed to load categories:', catErr);
        setError('Failed to load expense categories');
      }
      
      // Fetch expenses
      let expensesData = { data: [] };
      try {
        expensesData = await fetchExpenses({ createdByRole: 'supervisor' });
      } catch (expErr) {
        console.error('❌ Failed to load expenses:', expErr);
        if (!error) setError('Failed to load expenses');
      }
      
      setCategories(categoriesData || []);
      setExpenses(expensesData?.data || []);
    } catch (err) {
      setError('Failed to load data');
      console.error('❌ Critical error in loadData:', err);
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
        createdByRole: 'supervisor',
      });
      setExpenses([newExpense, ...expenses]);
      setShowForm(false);
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
      setError(null);
    } catch (err) {
      setError('Failed to create expense');
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

  const handleGenerateReceipt = async (expenseId: string) => {
    try {
      setLoading(true);
      const receipt = await generateReceipt(expenseId);
      const expenseToPrint = expenses.find(e => e.id === expenseId) || selectedExpense;
      if (expenseToPrint) {
        const html = buildExpenseReceiptHtml(expenseToPrint as any);
        downloadExpenseReceiptHtml(
          html,
          `expense-receipt-${(expenseToPrint.referenceNumber || expenseToPrint.id).replace(/\s+/g, '_')}.html`
        );
      }
      if (receipt && expenseToPrint) {
        setExpenses(expenses.map((e) => (e.id === expenseId ? { ...e, receipt } : e)));
        if (selectedExpense?.id === expenseId) {
          setSelectedExpense({ ...selectedExpense, receipt });
        }
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

  const getStatusColor = (status: ApprovalStatus) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'recalled':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 bg-slate-900 text-slate-100 p-6 rounded-lg">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Expense Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          New Expense
        </button>
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
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-400"
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
            {expenses.map(expense => (
              <tr key={expense.id} className="hover:bg-slate-700/50 text-slate-200">
                <td className="px-6 py-4 text-sm">{expense.description}</td>
                <td className="px-6 py-4 text-sm">
                  {expense.category?.name || categories.find(c => c.id === expense.categoryId)?.name || expense.categoryId || 'Uncategorized'}
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
                  {expense.approvalStatus === 'draft' && (
                    <button
                      onClick={() => handleSubmitForApproval(expense.id)}
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
                  <p className="text-sm text-gray-600">Description</p>
                  <p className="font-medium">{selectedExpense.description}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="font-medium">
                    {selectedExpense.category?.name || categories.find(c => c.id === selectedExpense.categoryId)?.name || selectedExpense.categoryId || 'Uncategorized'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-medium">
                    {selectedExpense.currency} {Number(selectedExpense.amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
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
                        : 'bg-gray-100 text-gray-800'
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
                        : 'bg-gray-100 text-gray-800'
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
                      <div key={log.id} className="p-3 bg-gray-50 rounded">
                        <p className="text-sm font-medium">{log.action}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(log.createdAt).toLocaleDateString()} -{' '}
                          {log.performedByRole}
                        </p>
                        {log.notes && (
                          <p className="text-sm text-gray-700 mt-1">{log.notes}</p>
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
                        <div key={note.id} className="p-3 bg-gray-50 rounded">
                          <div className="flex justify-between items-start">
                            <p className="text-xs font-medium text-gray-600">
                              {note.createdByName} ({note.createdByRole})
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-sm text-gray-700 mt-2">
                            {note.content}
                          </p>
                        </div>
                      ))}
                    <div className="mt-4">
                      <textarea
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
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
                className="w-full bg-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-400"
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
