import { useState, useCallback } from 'react';
import {
  Expense,
  ExpenseFormData,
  ExpenseNote,
  ExpenseAuditLog,
} from '../types/expenses';
import {
  fetchExpenses,
  createExpense,
  updateExpense,
  submitExpenseForApproval,
  approveExpense,
  rejectExpense,
  recallExpense,
  generateReceipt,
  getExpenseNotes,
  createExpenseNote,
  getExpenseAuditLog,
  getExpensesPendingApproval,
} from '../api/expenses';

interface UseExpenseManagementState {
  expenses: Expense[];
  pendingExpenses: Expense[];
  loading: boolean;
  error: string | null;
}

export function useExpenseManagement() {
  const [state, setState] = useState<UseExpenseManagementState>({
    expenses: [],
    pendingExpenses: [],
    loading: false,
    error: null,
  });

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const loadExpenses = useCallback(async (filters?: any) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const result = await fetchExpenses(filters);
      setState(prev => ({
        ...prev,
        expenses: result.data,
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: 'Failed to load expenses',
        loading: false,
      }));
      console.error(err);
    }
  }, []);

  const loadPendingExpenses = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const result = await getExpensesPendingApproval();
      setState(prev => ({
        ...prev,
        pendingExpenses: result.data,
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: 'Failed to load pending expenses',
        loading: false,
      }));
      console.error(err);
    }
  }, []);

  const createNewExpense = useCallback(
    async (formData: ExpenseFormData): Promise<Expense | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const expense = await createExpense(formData);
        setState(prev => ({
          ...prev,
          expenses: [expense, ...prev.expenses],
          loading: false,
        }));
        return expense;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to create expense',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const updateExistingExpense = useCallback(
    async (id: string, formData: Partial<ExpenseFormData>): Promise<Expense | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const expense = await updateExpense(id, formData);
        setState(prev => ({
          ...prev,
          expenses: prev.expenses.map(e => (e.id === id ? expense : e)),
          loading: false,
        }));
        return expense;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to update expense',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const submitForApproval = useCallback(
    async (expenseId: string): Promise<Expense | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const expense = await submitExpenseForApproval(expenseId);
        setState(prev => ({
          ...prev,
          expenses: prev.expenses.map(e => (e.id === expenseId ? expense : e)),
          loading: false,
        }));
        return expense;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to submit expense for approval',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const approveExpenseRequest = useCallback(
    async (expenseId: string, notes?: string): Promise<Expense | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const expense = await approveExpense(expenseId, notes);
        setState(prev => ({
          ...prev,
          expenses: prev.expenses.map(e => (e.id === expenseId ? expense : e)),
          pendingExpenses: prev.pendingExpenses.filter(
            e => e.id !== expenseId
          ),
          loading: false,
        }));
        return expense;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to approve expense',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const rejectExpenseRequest = useCallback(
    async (expenseId: string, rejectionReason: string): Promise<Expense | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const expense = await rejectExpense(expenseId, rejectionReason);
        setState(prev => ({
          ...prev,
          expenses: prev.expenses.map(e => (e.id === expenseId ? expense : e)),
          pendingExpenses: prev.pendingExpenses.filter(
            e => e.id !== expenseId
          ),
          loading: false,
        }));
        return expense;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to reject expense',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const recallExpenseRequest = useCallback(
    async (expenseId: string, reason?: string): Promise<Expense | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const expense = await recallExpense(expenseId, reason);
        setState(prev => ({
          ...prev,
          expenses: prev.expenses.map(e => (e.id === expenseId ? expense : e)),
          loading: false,
        }));
        return expense;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to recall expense',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const generateReceiptForExpense = useCallback(
    async (expenseId: string, receiptDate?: string): Promise<any | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const receipt = await generateReceipt(expenseId, receiptDate);
        setState(prev => ({ ...prev, loading: false }));
        return receipt;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to generate receipt',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const getExpenseNotesData = useCallback(
    async (expenseId: string): Promise<ExpenseNote[] | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const notes = await getExpenseNotes(expenseId);
        setState(prev => ({ ...prev, loading: false }));
        return notes;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to fetch notes',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const addExpenseNote = useCallback(
    async (
      expenseId: string,
      noteType: string,
      content: string
    ): Promise<ExpenseNote | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const note = await createExpenseNote(expenseId, noteType, content);
        setState(prev => ({ ...prev, loading: false }));
        return note;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to add note',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const getExpenseHistory = useCallback(
    async (expenseId: string): Promise<ExpenseAuditLog[] | null> => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const history = await getExpenseAuditLog(expenseId);
        setState(prev => ({ ...prev, loading: false }));
        return history;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: 'Failed to fetch history',
          loading: false,
        }));
        console.error(err);
        return null;
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    expenses: state.expenses,
    pendingExpenses: state.pendingExpenses,
    loading: state.loading,
    error: state.error,

    // Methods
    loadExpenses,
    loadPendingExpenses,
    createNewExpense,
    updateExistingExpense,
    submitForApproval,
    approveExpenseRequest,
    rejectExpenseRequest,
    recallExpenseRequest,
    generateReceiptForExpense,
    getExpenseNotesData,
    addExpenseNote,
    getExpenseHistory,
    clearError,
    setError,
  };
}
