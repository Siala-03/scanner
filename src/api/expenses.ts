import { supabase, supabaseAdmin } from '../lib/supabase';
import type {
  Expense,
  ExpenseCategory,
  RecurringExpense,
  ExpenseBudget,
  ExpenseFilters,
  ExpenseFormData,
  RecurringExpenseFormData,
  ExpenseCategoryFormData,
  ExpenseBudgetFormData,
  ExpenseAnalytics,
  ApprovalStatus,
} from '../types/expenses';

function getRestaurantId(): string | undefined {
  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (authUserRaw) {
    try {
      const authUser = JSON.parse(authUserRaw);
      const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
      if (typeof fallbackId === 'string' && fallbackId.trim()) {
        localStorage.setItem('restaurantId', fallbackId);
        return fallbackId;
      }
    } catch {
      // Ignore malformed authUser payload and fall through
    }
  }

  return undefined;
}

function getStaffId(): string {
  return localStorage.getItem('staffId') || 'system';
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeExpenseCategory(raw: any): ExpenseCategory {
  return {
    id: raw.id,
    restaurantId: raw.restaurant_id,
    name: raw.name,
    description: raw.description,
    color: raw.color || '#6366f1',
    icon: raw.icon || 'tag',
    isActive: raw.is_active ?? true,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function normalizeExpense(raw: any): Expense {
  return {
    id: raw.id,
    restaurantId: raw.restaurant_id,
    categoryId: raw.category_id,
    vendorName: raw.vendor_name,
    description: raw.description,
    amount: raw.amount,
    currency: 'RWF',
    expenseDate: raw.expense_date || raw.created_at,
    paymentMethod: raw.payment_method,
    paymentStatus: raw.payment_status || 'pending',
    referenceNumber: raw.reference_number,
    notes: raw.notes,
    isRecurring: raw.is_recurring ?? false,
    recurringFrequency: raw.recurring_frequency,
    taxAmount: raw.tax_amount || 0,
    taxRate: raw.tax_rate || 0,
    isTaxDeductible: raw.is_tax_deductible ?? false,
    approvalStatus: (raw.status as ApprovalStatus) || 'draft',
    rejectionReason: raw.rejection_reason,
    approvedBy: raw.approved_by,
    approvedAt: raw.approved_at,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// ============================================
// EXPENSE CATEGORIES
// ============================================

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) { console.error('fetchExpenseCategories error:', error); return []; }
  return (data || []).map(normalizeExpenseCategory);
}

export async function createExpenseCategory(data: ExpenseCategoryFormData): Promise<ExpenseCategory> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');

  const id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { data: result, error } = await supabaseAdmin
    .from('expense_categories')
    .insert({
      id,
      name: data.name,
      description: data.description || '',
      color: data.color || '#6366f1',
      icon: data.icon || 'tag',
      is_active: true,
      restaurant_id: restaurantId,
    })
    .select()
    .single();

  if (error) { console.error('createExpenseCategory error:', error); throw error; }
  return normalizeExpenseCategory(result);
}

export async function updateExpenseCategory(
  id: string,
  data: Partial<ExpenseCategoryFormData>
): Promise<ExpenseCategory> {
  const { data: result, error } = await supabaseAdmin
    .from('expense_categories')
    .update({
      name: data.name,
      description: data.description,
      color: data.color,
      icon: data.icon,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updateExpenseCategory error:', error); throw error; }
  return normalizeExpenseCategory(result);
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('expense_categories')
    .delete()
    .eq('id', id);

  if (error) { console.error('deleteExpenseCategory error:', error); throw error; }
}

// ============================================
// EXPENSES
// ============================================

export async function fetchExpenses(filters?: ExpenseFilters): Promise<Expense[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters?.approvalStatus) {
    query = query.eq('status', filters.approvalStatus);
  }
  if (filters?.startDate) {
    query = query.gte('expense_date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('expense_date', filters.endDate);
  }
  if (filters?.minAmount) {
    query = query.gte('amount', filters.minAmount);
  }
  if (filters?.maxAmount) {
    query = query.lte('amount', filters.maxAmount);
  }

  const { data, error } = await query;
  if (error) { console.error('fetchExpenses error:', error); return []; }
  return (data || []).map(normalizeExpense);
}

export async function fetchExpense(id: string): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) { console.error('fetchExpense error:', error); throw error; }
  return normalizeExpense(data);
}

export async function createExpense(data: ExpenseFormData): Promise<Expense> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');

  const staffId = getStaffId();
  const id = `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { data: result, error } = await supabaseAdmin
    .from('expenses')
    .insert({
      id,
      category_id: data.categoryId,
      vendor_name: data.vendorName || '',
      description: data.description,
      amount: data.amount,
      expense_date: data.expenseDate,
      payment_method: data.paymentMethod,
      payment_status: data.paymentStatus,
      reference_number: data.referenceNumber,
      notes: data.notes,
      is_recurring: data.isRecurring,
      recurring_frequency: data.recurringFrequency,
      tax_amount: data.taxAmount,
      tax_rate: data.taxRate,
      is_tax_deductible: data.isTaxDeductible,
      status: data.approvalStatus || 'draft',
      created_by: staffId,
      restaurant_id: restaurantId,
    })
    .select()
    .single();

  if (error) { console.error('createExpense error:', error); throw error; }
  return normalizeExpense(result);
}

export async function updateExpense(
  id: string,
  data: Partial<ExpenseFormData>
): Promise<Expense> {
  const updateData: any = {};
  if (data.categoryId) updateData.category_id = data.categoryId;
  if (data.vendorName) updateData.vendor_name = data.vendorName;
  if (data.description) updateData.description = data.description;
  if (data.amount) updateData.amount = data.amount;
  if (data.expenseDate) updateData.expense_date = data.expenseDate;
  if (data.paymentMethod) updateData.payment_method = data.paymentMethod;
  if (data.paymentStatus) updateData.payment_status = data.paymentStatus;
  if (data.referenceNumber) updateData.reference_number = data.referenceNumber;
  if (data.notes) updateData.notes = data.notes;

  const { data: result, error } = await supabaseAdmin
    .from('expenses')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updateExpense error:', error); throw error; }
  return normalizeExpense(result);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('expenses')
    .delete()
    .eq('id', id);

  if (error) { console.error('deleteExpense error:', error); throw error; }
}

// ============================================
// EXPENSE APPROVAL
// ============================================

export async function submitExpenseForApproval(expenseId: string): Promise<Expense> {
  const staffId = getStaffId();
  const { data, error } = await supabaseAdmin
    .from('expenses')
    .update({ status: 'pending' })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) { console.error('submitExpenseForApproval error:', error); throw error; }
  return normalizeExpense(data);
}

export async function approveExpense(expenseId: string, notes?: string): Promise<Expense> {
  const staffId = getStaffId();
  const { data, error } = await supabaseAdmin
    .from('expenses')
    .update({
      status: 'approved',
      approved_by: staffId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) { console.error('approveExpense error:', error); throw error; }
  return normalizeExpense(data);
}

export async function rejectExpense(expenseId: string, rejectionReason: string): Promise<Expense> {
  const staffId = getStaffId();
  const { data, error } = await supabaseAdmin
    .from('expenses')
    .update({
      status: 'rejected',
      rejection_reason: rejectionReason,
      approved_by: staffId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) { console.error('rejectExpense error:', error); throw error; }
  return normalizeExpense(data);
}

export async function recallExpense(expenseId: string, reason?: string): Promise<Expense> {
  const { data, error } = await supabaseAdmin
    .from('expenses')
    .update({
      status: 'draft',
      notes: reason || '',
    })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) { console.error('recallExpense error:', error); throw error; }
  return normalizeExpense(data);
}

// ============================================
// RECURRING EXPENSES (simplified - not in schema, using expenses table)
// ============================================

export async function fetchRecurringExpenses(): Promise<RecurringExpense[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_recurring', true)
    .order('created_at', { ascending: false });

  if (error) { console.error('fetchRecurringExpenses error:', error); return []; }
  return (data || []).map(normalizeExpense) as unknown as RecurringExpense[];
}

export async function createRecurringExpense(data: RecurringExpenseFormData): Promise<RecurringExpense> {
  const formData: ExpenseFormData = {
    categoryId: data.categoryId,
    vendorName: data.vendorName,
    description: data.description,
    amount: data.amount,
    currency: data.currency,
    expenseDate: data.startDate,
    paymentMethod: data.paymentMethod,
    paymentStatus: 'pending',
    notes: data.notes,
    isRecurring: true,
    recurringFrequency: data.frequency,
    isTaxDeductible: false,
  };
  return createExpense(formData) as unknown as RecurringExpense;
}

export async function updateRecurringExpense(
  recId: string,
  recData: Partial<RecurringExpenseFormData>
): Promise<RecurringExpense> {
  const updateData: any = {};
  if (recData.categoryId) updateData.category_id = recData.categoryId;
  if (recData.vendorName) updateData.vendor_name = recData.vendorName;
  if (recData.description) updateData.description = recData.description;
  if (recData.amount) updateData.amount = recData.amount;
  if (recData.paymentMethod) updateData.payment_method = recData.paymentMethod;
  if (recData.notes) updateData.notes = recData.notes;

  const { data: result, error } = await supabaseAdmin
    .from('expenses')
    .update(updateData)
    .eq('id', recId)
    .select()
    .single();

  if (error) { console.error('updateRecurringExpense error:', error); throw error; }
  return normalizeExpense(result) as unknown as RecurringExpense;
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  return deleteExpense(id);
}

export async function generateRecurringExpenses(): Promise<{ generated: number }> {
  return { generated: 0 };
}

// ============================================
// EXPENSE BUDGETS (not in schema, placeholder)
// ============================================

export async function fetchBudgets(): Promise<ExpenseBudget[]> {
  return [];
}

export async function createBudget(_data: ExpenseBudgetFormData): Promise<ExpenseBudget> {
  throw new Error('Budgets not implemented');
}

export async function updateBudget(_id: string, _data: Partial<ExpenseBudgetFormData>): Promise<ExpenseBudget> {
  throw new Error('Budgets not implemented');
}

export async function deleteBudget(_id: string): Promise<void> {
  throw new Error('Budgets not implemented');
}

// ============================================
// EXPENSE ANALYTICS
// ============================================

export async function getExpenseAnalytics(startDate?: string, endDate?: string): Promise<ExpenseAnalytics> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return {
    totalExpenses: 0,
    totalPaid: 0,
    totalPending: 0,
    totalOverdue: 0,
    averageExpense: 0,
    expensesByCategory: [],
    expensesByMonth: [],
    expensesByPaymentMethod: [],
    topVendors: [],
    recurringExpensesTotal: 0,
    taxDeductibleTotal: 0,
  };

  let query = supabase
    .from('expenses')
    .select('amount, category_id, payment_status, expense_date, vendor_name, is_recurring, is_tax_deductible')
    .eq('restaurant_id', restaurantId);

  if (startDate) query = query.gte('expense_date', startDate);
  if (endDate) query = query.lte('expense_date', endDate);

  const { data, error } = await query;
  if (error) { console.error('getExpenseAnalytics error:', error); }

  const expenses = data || [];
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return {
    totalExpenses: total,
    totalPaid: expenses.filter(e => e.payment_status === 'paid').reduce((sum, e) => sum + (e.amount || 0), 0),
    totalPending: expenses.filter(e => e.payment_status === 'pending').reduce((sum, e) => sum + (e.amount || 0), 0),
    totalOverdue: 0,
    averageExpense: expenses.length > 0 ? total / expenses.length : 0,
    expensesByCategory: [],
    expensesByMonth: [],
    expensesByPaymentMethod: [],
    topVendors: [],
    recurringExpensesTotal: expenses.filter(e => e.is_recurring).reduce((sum, e) => sum + (e.amount || 0), 0),
    taxDeductibleTotal: expenses.filter(e => e.is_tax_deductible).reduce((sum, e) => sum + (e.amount || 0), 0),
  };
}

// ============================================
// APPROVAL OPERATIONS
// ============================================

export async function getPendingApprovals(): Promise<Expense[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) { console.error('getPendingApprovals error:', error); return []; }
  return (data || []).map(normalizeExpense);
}

// Backward-compatible API used by ExpenseApproval component
export async function getExpensesPendingApproval(): Promise<{ data: Expense[] }> {
  const data = await getPendingApprovals();
  return { data };
}

export async function getApprovalSummary(): Promise<any> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return { pending: 0, approved: 0, rejected: 0, total: 0 };

  const { data, error } = await supabase
    .from('expenses')
    .select('status, amount')
    .eq('restaurant_id', restaurantId);

  if (error) { console.error('getApprovalSummary error:', error); }

  const expenses = data || [];
  return {
    pending: expenses.filter(e => e.status === 'pending').length,
    approved: expenses.filter(e => e.status === 'approved').length,
    rejected: expenses.filter(e => e.status === 'rejected').length,
    total: expenses.length,
  };
}

// Backward-compatible API used by ExpenseApproval component
export async function getExpenseApprovalSummary(): Promise<any> {
  return getApprovalSummary();
}

// ============================================
// PLACEHOLDERS (not implemented)
// ============================================

export async function generateReceipt(_expenseId: string): Promise<any> {
  return { success: true, url: '' };
}

export async function getExpenseReceipt(_expenseId: string): Promise<any> {
  return null;
}

export async function addExpenseNote(_expenseId: string, _content: string): Promise<any> {
  return { success: true };
}

// Backward-compatible API used by ExpenseApproval component
export async function createExpenseNote(expenseId: string, _noteType: string, content: string): Promise<any> {
  return addExpenseNote(expenseId, content);
}

export async function getExpenseNotes(_expenseId: string): Promise<any[]> {
  return [];
}

export async function getExpenseAuditLog(_expenseId: string): Promise<any[]> {
  return [];
}