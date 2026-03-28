import { apiRequest } from './http';
import type {
  Expense,
  ExpenseCategory,
  RecurringExpense,
  ExpenseBudget,
  ExpenseAnalytics,
  ExpenseFormData,
  RecurringExpenseFormData,
  ExpenseCategoryFormData,
  ExpenseBudgetFormData,
  ExpenseFilters
} from '../types/expenses';

// Base API URL
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

// ============================================
// EXPENSE CATEGORIES
// ============================================

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  return apiRequest<ExpenseCategory[]>(`${API_BASE}/expenses/categories`);
}

export async function createExpenseCategory(data: ExpenseCategoryFormData): Promise<ExpenseCategory> {
  return apiRequest<ExpenseCategory>(`${API_BASE}/expenses/categories`, {
    method: 'POST',
    json: data,
  });
}

export async function updateExpenseCategory(
  id: string,
  data: Partial<ExpenseCategoryFormData>
): Promise<ExpenseCategory> {
  return apiRequest<ExpenseCategory>(`${API_BASE}/expenses/categories/${id}`, {
    method: 'PUT',
    json: data,
  });
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/expenses/categories/${id}`, {
    method: 'DELETE',
  });
}

// ============================================
// EXPENSES
// ============================================

export async function fetchExpenses(
  filters?: ExpenseFilters,
  page: number = 1,
  limit: number = 50,
  sortBy: string = 'expenseDate',
  sortOrder: string = 'desc'
): Promise<{
  data: Expense[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const params = new URLSearchParams();
  
  if (filters) {
    if (filters.categoryId) params.append('categoryId', filters.categoryId);
    if (filters.paymentStatus) params.append('paymentStatus', filters.paymentStatus);
    if (filters.paymentMethod) params.append('paymentMethod', filters.paymentMethod);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.minAmount !== undefined) params.append('minAmount', filters.minAmount.toString());
    if (filters.maxAmount !== undefined) params.append('maxAmount', filters.maxAmount.toString());
    if (filters.isRecurring !== undefined) params.append('isRecurring', filters.isRecurring.toString());
    if (filters.isTaxDeductible !== undefined) params.append('isTaxDeductible', filters.isTaxDeductible.toString());
    if (filters.vendorName) params.append('vendorName', filters.vendorName);
    if (filters.searchQuery) params.append('searchQuery', filters.searchQuery);
  }
  
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  params.append('sortBy', sortBy);
  params.append('sortOrder', sortOrder);
  
  const queryString = params.toString();
  const url = queryString ? `${API_BASE}/expenses?${queryString}` : `${API_BASE}/expenses`;
  
  return apiRequest<{
    data: Expense[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>(url);
}

export async function fetchExpenseById(id: string): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses/${id}`);
}

export async function createExpense(data: ExpenseFormData): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses`, {
    method: 'POST',
    json: data,
  });
}

export async function updateExpense(
  id: string,
  data: Partial<ExpenseFormData>
): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses/${id}`, {
    method: 'PUT',
    json: data,
  });
}

export async function deleteExpense(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/expenses/${id}`, {
    method: 'DELETE',
  });
}

// ============================================
// RECURRING EXPENSES
// ============================================

export async function fetchRecurringExpenses(): Promise<RecurringExpense[]> {
  return apiRequest<RecurringExpense[]>(`${API_BASE}/expenses/recurring`);
}

export async function createRecurringExpense(data: RecurringExpenseFormData): Promise<RecurringExpense> {
  return apiRequest<RecurringExpense>(`${API_BASE}/expenses/recurring`, {
    method: 'POST',
    json: data,
  });
}

export async function updateRecurringExpense(
  id: string,
  data: Partial<RecurringExpenseFormData>
): Promise<RecurringExpense> {
  return apiRequest<RecurringExpense>(`${API_BASE}/expenses/recurring/${id}`, {
    method: 'PUT',
    json: data,
  });
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/expenses/recurring/${id}`, {
    method: 'DELETE',
  });
}

export async function generateRecurringExpenses(): Promise<{
  generated: number;
  expenses: Expense[];
}> {
  return apiRequest<{
    generated: number;
    expenses: Expense[];
  }>(`${API_BASE}/expenses/recurring/generate`, {
    method: 'POST',
  });
}

// ============================================
// EXPENSE ANALYTICS
// ============================================

export async function fetchExpenseAnalytics(
  startDate?: string,
  endDate?: string
): Promise<ExpenseAnalytics> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const queryString = params.toString();
  const url = queryString ? `${API_BASE}/expenses/analytics?${queryString}` : `${API_BASE}/expenses/analytics`;
  
  return apiRequest<ExpenseAnalytics>(url);
}

// ============================================
// EXPENSE BUDGETS
// ============================================

export async function fetchExpenseBudgets(): Promise<ExpenseBudget[]> {
  return apiRequest<ExpenseBudget[]>(`${API_BASE}/expenses/budgets`);
}

export async function createExpenseBudget(data: ExpenseBudgetFormData): Promise<ExpenseBudget> {
  return apiRequest<ExpenseBudget>(`${API_BASE}/expenses/budgets`, {
    method: 'POST',
    json: data,
  });
}

export async function updateExpenseBudget(
  id: string,
  data: Partial<ExpenseBudgetFormData>
): Promise<ExpenseBudget> {
  return apiRequest<ExpenseBudget>(`${API_BASE}/expenses/budgets/${id}`, {
    method: 'PUT',
    json: data,
  });
}

export async function deleteExpenseBudget(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/expenses/budgets/${id}`, {
    method: 'DELETE',
  });
}

// ============================================
// EXPENSE APPROVAL WORKFLOW
// ============================================

export async function submitExpenseForApproval(expenseId: string): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses/${expenseId}/submit-approval`, {
    method: 'POST',
  });
}

export async function approveExpense(expenseId: string, notes?: string): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses/${expenseId}/approve`, {
    method: 'POST',
    json: { notes },
  });
}

export async function rejectExpense(expenseId: string, rejectionReason: string): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses/${expenseId}/reject`, {
    method: 'POST',
    json: { rejectionReason },
  });
}

export async function recallExpense(expenseId: string, reason?: string): Promise<Expense> {
  return apiRequest<Expense>(`${API_BASE}/expenses/${expenseId}/recall`, {
    method: 'POST',
    json: { reason },
  });
}

export async function getExpensesPendingApproval(
  limit: number = 50,
  offset: number = 0
): Promise<{
  data: Expense[];
  total: number;
}> {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());
  
  return apiRequest<{
    data: Expense[];
    total: number;
  }>(`${API_BASE}/expenses/approval/pending?${params.toString()}`);
}

export async function getExpenseApprovalSummary(): Promise<Array<{
  approvalStatus: string;
  count: number;
  totalAmount: number;
}>> {
  return apiRequest<Array<{
    approvalStatus: string;
    count: number;
    totalAmount: number;
  }>>(`${API_BASE}/expenses/approval/summary`);
}

// ============================================
// EXPENSE RECEIPTS
// ============================================

export async function generateReceipt(expenseId: string, receiptDate?: string): Promise<any> {
  return apiRequest<any>(`${API_BASE}/expenses/${expenseId}/generate-receipt`, {
    method: 'POST',
    json: { receiptDate },
  });
}

export async function getExpenseReceipt(expenseId: string): Promise<any> {
  return apiRequest<any>(`${API_BASE}/expenses/${expenseId}/receipt`);
}

// ============================================
// EXPENSE NOTES
// ============================================

export async function createExpenseNote(
  expenseId: string,
  noteType: string,
  content: string
): Promise<any> {
  return apiRequest<any>(`${API_BASE}/expenses/${expenseId}/notes`, {
    method: 'POST',
    json: { noteType, content },
  });
}

export async function getExpenseNotes(expenseId: string): Promise<any[]> {
  return apiRequest<any[]>(`${API_BASE}/expenses/${expenseId}/notes`);
}

// ============================================
// EXPENSE AUDIT LOG
// ============================================

export async function getExpenseAuditLog(expenseId: string): Promise<any[]> {
  return apiRequest<any[]>(`${API_BASE}/expenses/${expenseId}/audit-log`);
}
