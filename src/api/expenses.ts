import { supabase } from '../lib/supabase';
import { apiRequest } from './http';
import type {
  Expense,
  ExpenseCategory,
  RecurringExpense,
  ExpenseFilters,
  ExpenseFormData,
  RecurringExpenseFormData,
  ExpenseCategoryFormData,
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

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Utilities', description: 'Water, electricity, internet and other utility bills', color: '#0EA5E9', icon: 'zap' },
  { name: 'Supplies', description: 'General operations and office supplies', color: '#22C55E', icon: 'package' },
  { name: 'Maintenance', description: 'Repairs and maintenance costs', color: '#F59E0B', icon: 'wrench' },
  { name: 'Transport', description: 'Delivery and transportation expenses', color: '#8B5CF6', icon: 'truck' },
  { name: 'Marketing', description: 'Advertising and promotion spend', color: '#EC4899', icon: 'megaphone' },
  { name: 'Payroll', description: 'Salaries, allowances and staff benefits', color: '#EF4444', icon: 'users' },
  { name: 'Other', description: 'Miscellaneous business expenses', color: '#64748B', icon: 'tag' },
];

function seedCategoryId(restaurantId: string, name: string): string {
  return `cat-${restaurantId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

async function ensureDefaultExpenseCategories(restaurantId: string): Promise<void> {
  const missingColRegex = /Could not find the '([^']+)' column/i;

  // Build rows; strip columns the DB schema doesn't have (retry loop).
  let rows: Record<string, unknown>[] = DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
    id: seedCategoryId(restaurantId, cat.name),
    name: cat.name,
    description: cat.description,
    color: cat.color,
    icon: cat.icon,
    is_active: true,
    restaurant_id: restaurantId,
  }));

  for (let guard = 0; guard < 10; guard++) {
    const { error } = await supabase
      .from('expense_categories')
      .upsert(rows, { onConflict: 'id' });

    if (!error) return;

    const col = String(error.message || '').match(missingColRegex)?.[1];
    if (!col) {
      console.warn('ensureDefaultExpenseCategories failed:', error.message);
      return;
    }
    rows = rows.map(({ [col]: _dropped, ...rest }) => rest);
  }
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
  const normalizedStatus = (() => {
    const source = String(raw.status ?? raw.approval_status ?? '').toLowerCase();
    if (source === 'pending_approval') return 'pending';
    if (source === 'approved' || source === 'rejected' || source === 'reimbursed' || source === 'pending' || source === 'draft' || source === 'recalled') {
      return source;
    }
    return 'pending';
  })();

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
    approvalStatus: normalizedStatus as ApprovalStatus,
    rejectionReason: raw.rejection_reason,
    approvedBy: raw.approved_by,
    approvedAt: raw.approved_at,
    createdBy: raw.created_by || raw.submitted_by || 'system',
    createdByName: raw.created_by_name || raw.createdByName || undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

async function withCreatorNames(rawRows: any[], restaurantId: string): Promise<any[]> {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return rawRows;

  const ids = Array.from(
    new Set(
      rawRows
        .map((row) => String(row.created_by || row.submitted_by || '').trim())
        .filter((id) => id.startsWith('staff-'))
    )
  );

  if (ids.length === 0) return rawRows;

  const staffResult = await supabase
    .from('staff')
    .select('id,name')
    .eq('restaurant_id', restaurantId)
    .in('id', ids);

  if (staffResult.error || !staffResult.data) {
    return rawRows;
  }

  const nameById = new Map<string, string>(staffResult.data.map((row: any) => [row.id, row.name]));
  return rawRows.map((row) => ({
    ...row,
    created_by_name: nameById.get(String(row.created_by || row.submitted_by || '')) || row.created_by_name || null,
  }));
}

// ============================================
// EXPENSE CATEGORIES
// ============================================

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const restaurantId = getRestaurantId();

  try {
    const apiCategories = await apiRequest<any[]>('/expenses/categories');
    if (Array.isArray(apiCategories) && apiCategories.length > 0) {
      return apiCategories.map(normalizeExpenseCategory);
    }
  } catch {
    // Fall through to direct Supabase access.
  }

  if (!restaurantId) {
    return DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
      id: seedCategoryId('global', cat.name),
      restaurantId: 'global',
      name: cat.name,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .or(`restaurant_id.eq.${restaurantId},restaurant_id.is.null`)
    .order('name');

  if (error) {
    console.error('fetchExpenseCategories error:', error);
    return [];
  }

  if (!data || data.length === 0) {
    await ensureDefaultExpenseCategories(restaurantId);
    const seeded = await supabase
      .from('expense_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name');

    if (!seeded.error && seeded.data && seeded.data.length > 0) {
      return seeded.data.map(normalizeExpenseCategory);
    }
  }

  const normalized = (data || []).map(normalizeExpenseCategory);
  const byName = new Map<string, ExpenseCategory>();
  normalized.forEach((cat) => {
    const key = cat.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || existing.restaurantId !== restaurantId) {
      byName.set(key, cat);
    }
  });
  const deduped = Array.from(byName.values());
  if (deduped.length > 0) return deduped;

  // Seed once more before returning so the IDs are actually in the DB.
  await ensureDefaultExpenseCategories(restaurantId);
  return DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
    id: seedCategoryId(restaurantId, cat.name),
    restaurantId,
    name: cat.name,
    description: cat.description,
    color: cat.color,
    icon: cat.icon,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export async function createExpenseCategory(data: ExpenseCategoryFormData): Promise<ExpenseCategory> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { data: result, error } = await supabase
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
  const { data: result, error } = await supabase
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
  const { error } = await supabase
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
    const requested = String(filters.approvalStatus).toLowerCase();
    const mapped = requested === 'pending_approval' || requested === 'draft' || requested === 'recalled'
      ? 'pending'
      : requested;
    query = query.eq('status', mapped);
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
  const enrichedRows = await withCreatorNames(data || [], restaurantId);
  return enrichedRows.map(normalizeExpense);
}

export async function fetchExpense(id: string): Promise<Expense> {
  const restaurantId = getRestaurantId();
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) { console.error('fetchExpense error:', error); throw error; }
  const enriched = restaurantId ? await withCreatorNames([data], restaurantId) : [data];
  return normalizeExpense(enriched[0]);
}

export async function createExpense(data: ExpenseFormData): Promise<Expense> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const staffId = getStaffId();
  const id = `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const requestedStatus = String(data.approvalStatus || '').toLowerCase();
  const normalizedStatus = requestedStatus === 'approved' || requestedStatus === 'rejected' || requestedStatus === 'reimbursed'
    ? requestedStatus
    : 'pending';

  const basePayload: Record<string, unknown> = {
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
    restaurant_id: restaurantId,
  };

  const attempts: Array<Record<string, unknown>> = [
    { ...basePayload, status: normalizedStatus, submitted_by: staffId },
    { ...basePayload, status: normalizedStatus, created_by: staffId },
    { ...basePayload, status: normalizedStatus },
    { ...basePayload, submitted_by: staffId },
    { ...basePayload, created_by: staffId },
    { ...basePayload },
  ];

  let lastError: any = null;
  const missingColumnRegex = /Could not find the '([^']+)' column/i;
  let categorySeeded = false;

  const stripMissingColumn = (
    payload: Record<string, unknown>,
    error: any
  ): Record<string, unknown> | null => {
    const message = String(error?.message || '');
    const match = message.match(missingColumnRegex);
    const missingColumn = match?.[1];
    if (!missingColumn || !(missingColumn in payload)) {
      return null;
    }

    const { [missingColumn]: _removed, ...rest } = payload;
    return rest;
  };

  const isCategoryFkError = (error: any): boolean => {
    return error?.code === '23503' && String(error?.details || error?.message || '').includes('category_id');
  };

  // Resolve a valid category_id that actually exists in the DB.
  // Tries full seeding first, then a minimal single-row insert, then gives up.
  const resolveValidCategoryId = async (): Promise<string | null> => {
    await ensureDefaultExpenseCategories(restaurantId);

    const { data: existing } = await supabase
      .from('expense_categories')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .limit(1)
      .single();
    if (existing?.id) return existing.id;

    // Full seeding failed — try inserting one minimal "Other" category,
    // stripping columns the schema doesn't have.
    const fallbackId = seedCategoryId(restaurantId, 'Other');
    const missingColRegex = /Could not find the '([^']+)' column/i;
    let minRow: Record<string, unknown> = {
      id: fallbackId,
      name: 'Other',
      restaurant_id: restaurantId,
    };
    for (let g = 0; g < 8; g++) {
      const { error: catErr } = await supabase
        .from('expense_categories')
        .upsert(minRow, { onConflict: 'id' });
      if (!catErr) return fallbackId;
      const col = String(catErr.message || '').match(missingColRegex)?.[1];
      if (!col) break;
      const { [col]: _d, ...rest } = minRow;
      minRow = rest;
    }

    // Last resort — any category in the table, regardless of restaurant
    const { data: any_ } = await supabase
      .from('expense_categories')
      .select('id')
      .limit(1);
    return (Array.isArray(any_) ? any_[0]?.id : null) ?? null;
  };

  for (const payload of attempts) {
    let currentPayload = payload;
    let guard = 0;

    while (guard < 20) {
      guard += 1;

      const { data: result, error } = await supabase
        .from('expenses')
        .insert(currentPayload)
        .select()
        .single();

      if (!error && result) {
        return normalizeExpense(result);
      }

      lastError = error;

      // Category FK violation — resolve a real ID and swap it in.
      if (isCategoryFkError(error) && !categorySeeded) {
        categorySeeded = true;
        const validId = await resolveValidCategoryId();
        if (validId) {
          currentPayload = { ...currentPayload, category_id: validId };
        } else {
          // No categories at all — drop category_id and let the DB decide (nullable).
          const { category_id: _dropped, ...withoutCat } = currentPayload;
          currentPayload = withoutCat;
        }
        continue;
      }

      // Only keep retrying if the error is about a missing column we can strip.
      // Any other error (constraint violation, auth, etc.) should move to the next attempt.
      const strippedPayload = stripMissingColumn(currentPayload, error);
      if (!strippedPayload) {
        break;
      }

      currentPayload = strippedPayload;
    }
  }

  console.error('createExpense error:', lastError);
  throw lastError;
}

export async function updateExpense(
  id: string,
  data: Partial<ExpenseFormData>
): Promise<Expense> {
  const updateData: any = {};
  if (data.categoryId !== undefined) updateData.category_id = data.categoryId;
  if (data.vendorName !== undefined) updateData.vendor_name = data.vendorName;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.expenseDate !== undefined) updateData.expense_date = data.expenseDate;
  if (data.paymentMethod !== undefined) updateData.payment_method = data.paymentMethod;
  if (data.paymentStatus !== undefined) updateData.payment_status = data.paymentStatus;
  if (data.referenceNumber !== undefined) updateData.reference_number = data.referenceNumber;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const { data: result, error } = await supabase
    .from('expenses')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updateExpense error:', error); throw error; }
  return normalizeExpense(result);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase
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
  const { data, error } = await supabase
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
  let payload: Record<string, unknown> = {
    status: 'approved',
    approved_by: staffId,
    approved_at: new Date().toISOString(),
  };
  if (notes) payload.notes = notes;

  const missingColPattern = /Could not find the '([^']+)' column of 'expenses'/i;

  let result = await supabase.from('expenses').update(payload).eq('id', expenseId).select().single();

  for (let attempt = 0; attempt < 10 && result.error; attempt++) {
    const col = String(result.error?.message || '').match(missingColPattern)?.[1];
    if (col && col in payload) {
      const { [col]: _dropped, ...rest } = payload;
      payload = rest;
    } else {
      break;
    }
    result = await supabase.from('expenses').update(payload).eq('id', expenseId).select().single();
  }

  if (result.error) { console.error('approveExpense error:', result.error); throw result.error; }
  return normalizeExpense(result.data);
}

export async function rejectExpense(expenseId: string, rejectionReason: string): Promise<Expense> {
  const staffId = getStaffId();
  let payload: Record<string, unknown> = {
    status: 'rejected',
    rejection_reason: rejectionReason,
    approved_by: staffId,
    approved_at: new Date().toISOString(),
  };

  const missingColPattern = /Could not find the '([^']+)' column of 'expenses'/i;

  let result = await supabase.from('expenses').update(payload).eq('id', expenseId).select().single();

  for (let attempt = 0; attempt < 10 && result.error; attempt++) {
    const col = String(result.error?.message || '').match(missingColPattern)?.[1];
    if (col === 'rejection_reason') {
      // Column absent — store reason in notes instead
      const { rejection_reason: _dropped, ...rest } = payload;
      payload = rejectionReason ? { ...rest, notes: `Rejected: ${rejectionReason}` } : rest;
    } else if (col && col in payload) {
      const { [col]: _dropped, ...rest } = payload;
      payload = rest;
    } else {
      break;
    }
    result = await supabase.from('expenses').update(payload).eq('id', expenseId).select().single();
  }

  if (result.error) { console.error('rejectExpense error:', result.error); throw result.error; }
  return normalizeExpense(result.data);
}

export async function recallExpense(expenseId: string, reason?: string): Promise<Expense> {
  const { data, error } = await supabase
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

  const { data: result, error } = await supabase
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
  const summary = await getApprovalSummary();
  const normalized = summary || {};

  return [
    {
      approval_status: 'pending',
      count: normalized.pending || 0,
      total_amount: 0,
    },
    {
      approval_status: 'approved',
      count: normalized.approved || 0,
      total_amount: 0,
    },
    {
      approval_status: 'rejected',
      count: normalized.rejected || 0,
      total_amount: 0,
    },
    {
      approval_status: 'total',
      count: normalized.total || 0,
      total_amount: 0,
    },
  ];
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
