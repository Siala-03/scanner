import { pool } from '../db.js';
import { HttpError } from '../http.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

function normalizeExpense(expense: any) {
  return {
    ...expense,
    amount: parseFloat(expense.amount) || 0,
    tax_amount: parseFloat(expense.tax_amount) || 0,
    tax_rate: parseFloat(expense.tax_rate) || 0,
  };
}

// ============================================
// EXPENSE CATEGORIES
// ============================================

export async function getExpenseCategories(restaurantId: string) {
  const result = await pool.query(
    `SELECT * FROM expense_categories 
     WHERE restaurant_id = $1 AND is_active = true 
     ORDER BY name`,
    [restaurantId]
  );
  
  // If no restaurant-specific categories exist, return default categories
  if (result.rows.length === 0) {
    const defaultResult = await pool.query(
      `SELECT * FROM expense_categories 
       WHERE restaurant_id = 'default' AND is_active = true 
       ORDER BY name`
    );
    return defaultResult.rows;
  }
  
  return result.rows;
}

export async function createExpenseCategory(
  restaurantId: string,
  data: {
    name: string;
    description?: string;
    color: string;
    icon: string;
  }
) {
  const id = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const result = await pool.query(
    `INSERT INTO expense_categories (id, restaurant_id, name, description, color, icon)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, restaurantId, data.name, data.description, data.color, data.icon]
  );
  
  return result.rows[0];
}

export async function updateExpenseCategory(
  id: string,
  restaurantId: string,
  data: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    isActive?: boolean;
  }
) {
  const result = await pool.query(
    `UPDATE expense_categories 
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         color = COALESCE($3, color),
         icon = COALESCE($4, icon),
         is_active = COALESCE($5, is_active),
         updated_at = now()
     WHERE id = $6 AND restaurant_id = $7
     RETURNING *`,
    [data.name, data.description, data.color, data.icon, data.isActive, id, restaurantId]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense category not found');
  }
  
  return result.rows[0];
}

export async function deleteExpenseCategory(id: string, restaurantId: string) {
  const result = await pool.query(
    `UPDATE expense_categories 
     SET is_active = false, updated_at = now()
     WHERE id = $1 AND restaurant_id = $2
     RETURNING id`,
    [id, restaurantId]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense category not found');
  }
  
  return { success: true };
}

// ============================================
// EXPENSES
// ============================================

export async function getAllExpenses(
  restaurantId: string,
  filters: {
    categoryId?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
    isRecurring?: boolean;
    isTaxDeductible?: boolean;
    vendorName?: string;
    searchQuery?: string;
  },
  pagination: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: string;
  }
) {
  const conditions = ['e.restaurant_id = $1'];
  const params: any[] = [restaurantId];
  let paramIndex = 2;

  if (filters.categoryId) {
    conditions.push(`e.category_id = $${paramIndex++}`);
    params.push(filters.categoryId);
  }

  if (filters.paymentStatus) {
    conditions.push(`e.payment_status = $${paramIndex++}`);
    params.push(filters.paymentStatus);
  }

  if (filters.paymentMethod) {
    conditions.push(`e.payment_method = $${paramIndex++}`);
    params.push(filters.paymentMethod);
  }

  if (filters.startDate) {
    conditions.push(`e.expense_date >= $${paramIndex++}`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`e.expense_date <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  if (filters.minAmount !== undefined) {
    conditions.push(`e.amount >= $${paramIndex++}`);
    params.push(filters.minAmount);
  }

  if (filters.maxAmount !== undefined) {
    conditions.push(`e.amount <= $${paramIndex++}`);
    params.push(filters.maxAmount);
  }

  if (filters.isRecurring !== undefined) {
    conditions.push(`e.is_recurring = $${paramIndex++}`);
    params.push(filters.isRecurring);
  }

  if (filters.isTaxDeductible !== undefined) {
    conditions.push(`e.is_tax_deductible = $${paramIndex++}`);
    params.push(filters.isTaxDeductible);
  }

  if (filters.vendorName) {
    conditions.push(`e.vendor_name ILIKE $${paramIndex++}`);
    params.push(`%${filters.vendorName}%`);
  }

  if (filters.searchQuery) {
    conditions.push(`(e.description ILIKE $${paramIndex} OR e.vendor_name ILIKE $${paramIndex} OR e.reference_number ILIKE $${paramIndex})`);
    params.push(`%${filters.searchQuery}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');
  const offset = (pagination.page - 1) * pagination.limit;
  const allowedSortColumns = ['expense_date', 'amount', 'created_at', 'vendor_name'];
  const sortBy = allowedSortColumns.includes(pagination.sortBy) ? pagination.sortBy : 'expense_date';
  const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM expenses e WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  // Get paginated results
  const result = await pool.query(
    `SELECT 
       e.*,
       ec.name as category_name,
       ec.color as category_color,
       ec.icon as category_icon
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE ${whereClause}
     ORDER BY e.${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, pagination.limit, offset]
  );

  return {
    data: result.rows.map(normalizeExpense),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    }
  };
}

export async function getExpenseById(id: string, restaurantId: string) {
  const result = await pool.query(
    `SELECT 
       e.*,
       ec.name as category_name,
       ec.color as category_color,
       ec.icon as category_icon
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.id = $1 AND e.restaurant_id = $2`,
    [id, restaurantId]
  );
  
  return result.rows[0] ? normalizeExpense(result.rows[0]) : null;
}

export async function createExpense(
  restaurantId: string,
  userId: string,
  data: {
    categoryId: string;
    vendorName?: string;
    description: string;
    amount: number;
    currency: string;
    expenseDate: string;
    paymentMethod?: string;
    paymentStatus: string;
    referenceNumber?: string;
    notes?: string;
    isRecurring: boolean;
    recurringFrequency?: string;
    recurringEndDate?: string;
    taxAmount: number;
    taxRate: number;
    isTaxDeductible: boolean;
  }
) {
  const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const result = await pool.query(
    `INSERT INTO expenses (
       id, restaurant_id, category_id, vendor_name, description, amount, currency,
       expense_date, payment_method, payment_status, reference_number, notes,
       is_recurring, recurring_frequency, recurring_end_date, tax_amount, tax_rate,
       is_tax_deductible, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
     )
     RETURNING *`,
    [
      id, restaurantId, data.categoryId, data.vendorName, data.description,
      data.amount, data.currency, data.expenseDate, data.paymentMethod,
      data.paymentStatus, data.referenceNumber, data.notes, data.isRecurring,
      data.recurringFrequency, data.recurringEndDate, data.taxAmount,
      data.taxRate, data.isTaxDeductible, userId
    ]
  );
  
  return normalizeExpense(result.rows[0]);
}

export async function updateExpense(
  id: string,
  restaurantId: string,
  data: {
    categoryId?: string;
    vendorName?: string;
    description?: string;
    amount?: number;
    currency?: string;
    expenseDate?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    referenceNumber?: string;
    notes?: string;
    isRecurring?: boolean;
    recurringFrequency?: string;
    recurringEndDate?: string;
    taxAmount?: number;
    taxRate?: number;
    isTaxDeductible?: boolean;
  }
) {
  const result = await pool.query(
    `UPDATE expenses 
     SET category_id = COALESCE($1, category_id),
         vendor_name = COALESCE($2, vendor_name),
         description = COALESCE($3, description),
         amount = COALESCE($4, amount),
         currency = COALESCE($5, currency),
         expense_date = COALESCE($6, expense_date),
         payment_method = COALESCE($7, payment_method),
         payment_status = COALESCE($8, payment_status),
         reference_number = COALESCE($9, reference_number),
         notes = COALESCE($10, notes),
         is_recurring = COALESCE($11, is_recurring),
         recurring_frequency = COALESCE($12, recurring_frequency),
         recurring_end_date = COALESCE($13, recurring_end_date),
         tax_amount = COALESCE($14, tax_amount),
         tax_rate = COALESCE($15, tax_rate),
         is_tax_deductible = COALESCE($16, is_tax_deductible),
         updated_at = now()
     WHERE id = $17 AND restaurant_id = $18
     RETURNING *`,
    [
      data.categoryId, data.vendorName, data.description, data.amount,
      data.currency, data.expenseDate, data.paymentMethod, data.paymentStatus,
      data.referenceNumber, data.notes, data.isRecurring, data.recurringFrequency,
      data.recurringEndDate, data.taxAmount, data.taxRate, data.isTaxDeductible,
      id, restaurantId
    ]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense not found');
  }
  
  return normalizeExpense(result.rows[0]);
}

export async function deleteExpense(id: string, restaurantId: string) {
  const result = await pool.query(
    `DELETE FROM expenses 
     WHERE id = $1 AND restaurant_id = $2
     RETURNING id`,
    [id, restaurantId]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense not found');
  }
  
  return { success: true };
}

// ============================================
// RECURRING EXPENSES
// ============================================

export async function getRecurringExpenses(restaurantId: string) {
  const result = await pool.query(
    `SELECT 
       re.*,
       ec.name as category_name,
       ec.color as category_color,
       ec.icon as category_icon
     FROM recurring_expenses re
     LEFT JOIN expense_categories ec ON ec.id = re.category_id
     WHERE re.restaurant_id = $1 AND re.is_active = true
     ORDER BY re.next_due_date`,
    [restaurantId]
  );
  
  return result.rows;
}

export async function createRecurringExpense(
  restaurantId: string,
  userId: string,
  data: {
    categoryId: string;
    vendorName?: string;
    description: string;
    amount: number;
    currency: string;
    frequency: string;
    startDate: string;
    endDate?: string;
    paymentMethod?: string;
    autoGenerate: boolean;
    notes?: string;
  }
) {
  const id = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Calculate next due date based on frequency
  const nextDueDate = calculateNextDueDate(data.startDate, data.frequency);
  
  const result = await pool.query(
    `INSERT INTO recurring_expenses (
       id, restaurant_id, category_id, vendor_name, description, amount, currency,
       frequency, start_date, end_date, next_due_date, payment_method, auto_generate,
       notes, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
     )
     RETURNING *`,
    [
      id, restaurantId, data.categoryId, data.vendorName, data.description,
      data.amount, data.currency, data.frequency, data.startDate, data.endDate,
      nextDueDate, data.paymentMethod, data.autoGenerate, data.notes, userId
    ]
  );
  
  return result.rows[0];
}

export async function updateRecurringExpense(
  id: string,
  restaurantId: string,
  data: {
    categoryId?: string;
    vendorName?: string;
    description?: string;
    amount?: number;
    currency?: string;
    frequency?: string;
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
    autoGenerate?: boolean;
    isActive?: boolean;
    notes?: string;
  }
) {
  const result = await pool.query(
    `UPDATE recurring_expenses 
     SET category_id = COALESCE($1, category_id),
         vendor_name = COALESCE($2, vendor_name),
         description = COALESCE($3, description),
         amount = COALESCE($4, amount),
         currency = COALESCE($5, currency),
         frequency = COALESCE($6, frequency),
         start_date = COALESCE($7, start_date),
         end_date = COALESCE($8, end_date),
         payment_method = COALESCE($9, payment_method),
         auto_generate = COALESCE($10, auto_generate),
         is_active = COALESCE($11, is_active),
         notes = COALESCE($12, notes),
         updated_at = now()
     WHERE id = $13 AND restaurant_id = $14
     RETURNING *`,
    [
      data.categoryId, data.vendorName, data.description, data.amount,
      data.currency, data.frequency, data.startDate, data.endDate,
      data.paymentMethod, data.autoGenerate, data.isActive, data.notes,
      id, restaurantId
    ]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Recurring expense not found');
  }
  
  return result.rows[0];
}

export async function deleteRecurringExpense(id: string, restaurantId: string) {
  const result = await pool.query(
    `UPDATE recurring_expenses 
     SET is_active = false, updated_at = now()
     WHERE id = $1 AND restaurant_id = $2
     RETURNING id`,
    [id, restaurantId]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Recurring expense not found');
  }
  
  return { success: true };
}

export async function generateRecurringExpenses(restaurantId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // Get all recurring expenses that are due
  const result = await pool.query(
    `SELECT * FROM recurring_expenses 
     WHERE restaurant_id = $1 
       AND is_active = true 
       AND next_due_date <= $2
       AND (end_date IS NULL OR end_date >= $2)`,
    [restaurantId, today]
  );
  
  const generated = [];
  
  for (const recurring of result.rows) {
    // Create expense record
    const expense = await createExpense(restaurantId, recurring.created_by, {
      categoryId: recurring.category_id,
      vendorName: recurring.vendor_name,
      description: recurring.description,
      amount: recurring.amount,
      currency: recurring.currency,
      expenseDate: recurring.next_due_date,
      paymentMethod: recurring.payment_method,
      paymentStatus: 'pending',
      isRecurring: true,
      recurringFrequency: recurring.frequency,
      notes: recurring.notes,
      taxAmount: 0,
      taxRate: 0,
      isTaxDeductible: false
    });
    
    // Update next due date
    const nextDueDate = calculateNextDueDate(recurring.next_due_date, recurring.frequency);
    
    await pool.query(
      `UPDATE recurring_expenses 
       SET next_due_date = $1, updated_at = now()
       WHERE id = $2`,
      [nextDueDate, recurring.id]
    );
    
    generated.push(expense);
  }
  
  return { generated: generated.length, expenses: generated };
}

// ============================================
// EXPENSE ANALYTICS
// ============================================

export async function getExpenseAnalytics(
  restaurantId: string,
  startDate?: string,
  endDate?: string
) {
  const conditions = ['restaurant_id = $1'];
  const params: any[] = [restaurantId];
  let paramIndex = 2;

  if (startDate) {
    conditions.push(`expense_date >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`expense_date <= $${paramIndex++}`);
    params.push(endDate);
  }

  const whereClause = conditions.join(' AND ');

  // Get totals
  const totalsResult = await pool.query(
    `SELECT 
       COUNT(*) as total_count,
       COALESCE(SUM(amount), 0) as total_amount,
       COALESCE(AVG(amount), 0) as average_amount,
       COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END), 0) as total_paid,
       COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
       COALESCE(SUM(CASE WHEN payment_status = 'overdue' THEN amount ELSE 0 END), 0) as total_overdue,
       COALESCE(SUM(CASE WHEN is_recurring THEN amount ELSE 0 END), 0) as recurring_total,
       COALESCE(SUM(CASE WHEN is_tax_deductible THEN amount ELSE 0 END), 0) as tax_deductible_total
     FROM expenses
     WHERE ${whereClause}`,
    params
  );

  // Get by category
  const categoryResult = await pool.query(
    `SELECT 
       e.category_id,
       ec.name as category_name,
       SUM(e.amount) as amount,
       COUNT(*) as count
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE ${whereClause}
     GROUP BY e.category_id, ec.name
     ORDER BY amount DESC`,
    params
  );

  // Get by month
  const monthResult = await pool.query(
    `SELECT 
       TO_CHAR(expense_date, 'YYYY-MM') as month,
       SUM(amount) as amount
     FROM expenses
     WHERE ${whereClause}
     GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
     ORDER BY month DESC
     LIMIT 12`,
    params
  );

  // Get by payment method
  const paymentMethodResult = await pool.query(
    `SELECT 
       payment_method as method,
       SUM(amount) as amount,
       COUNT(*) as count
     FROM expenses
     WHERE ${whereClause} AND payment_method IS NOT NULL
     GROUP BY payment_method
     ORDER BY amount DESC`,
    params
  );

  // Get top vendors
  const vendorResult = await pool.query(
    `SELECT 
       vendor_name,
       SUM(amount) as amount,
       COUNT(*) as count
     FROM expenses
     WHERE ${whereClause} AND vendor_name IS NOT NULL
     GROUP BY vendor_name
     ORDER BY amount DESC
     LIMIT 10`,
    params
  );

  const totals = totalsResult.rows[0];
  const totalAmount = parseFloat(totals.total_amount);

  return {
    totalExpenses: totalAmount,
    totalPaid: parseFloat(totals.total_paid),
    totalPending: parseFloat(totals.total_pending),
    totalOverdue: parseFloat(totals.total_overdue),
    averageExpense: parseFloat(totals.average_amount),
    totalCount: parseInt(totals.total_count),
    recurringExpensesTotal: parseFloat(totals.recurring_total),
    taxDeductibleTotal: parseFloat(totals.tax_deductible_total),
    expensesByCategory: categoryResult.rows.map(row => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      amount: parseFloat(row.amount),
      percentage: totalAmount > 0 ? (parseFloat(row.amount) / totalAmount) * 100 : 0
    })),
    expensesByMonth: monthResult.rows.map(row => ({
      month: row.month,
      amount: parseFloat(row.amount)
    })),
    expensesByPaymentMethod: paymentMethodResult.rows.map(row => ({
      method: row.method,
      amount: parseFloat(row.amount),
      count: parseInt(row.count)
    })),
    topVendors: vendorResult.rows.map(row => ({
      vendorName: row.vendor_name,
      amount: parseFloat(row.amount),
      count: parseInt(row.count)
    }))
  };
}

// ============================================
// EXPENSE BUDGETS
// ============================================

export async function getExpenseBudgets(restaurantId: string) {
  const result = await pool.query(
    `SELECT 
       eb.*,
       ec.name as category_name,
       ec.color as category_color,
       ec.icon as category_icon,
       COALESCE(
         (SELECT SUM(amount) FROM expenses 
          WHERE category_id = eb.category_id 
            AND expense_date >= eb.start_date 
            AND expense_date <= eb.end_date),
         0
       ) as spent_amount
     FROM expense_budgets eb
     LEFT JOIN expense_categories ec ON ec.id = eb.category_id
     WHERE eb.restaurant_id = $1 AND eb.is_active = true
     ORDER BY eb.start_date DESC`,
    [restaurantId]
  );
  
  return result.rows.map(row => ({
    ...row,
    spentAmount: parseFloat(row.spent_amount),
    remainingAmount: parseFloat(row.budget_amount) - parseFloat(row.spent_amount),
    percentageUsed: parseFloat(row.budget_amount) > 0 
      ? (parseFloat(row.spent_amount) / parseFloat(row.budget_amount)) * 100 
      : 0
  }));
}

export async function createExpenseBudget(
  restaurantId: string,
  userId: string,
  data: {
    categoryId: string;
    budgetAmount: number;
    periodType: string;
    startDate: string;
    endDate: string;
    alertThreshold: number;
  }
) {
  const id = `bud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const result = await pool.query(
    `INSERT INTO expense_budgets (
       id, restaurant_id, category_id, budget_amount, period_type,
       start_date, end_date, alert_threshold, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9
     )
     RETURNING *`,
    [
      id, restaurantId, data.categoryId, data.budgetAmount, data.periodType,
      data.startDate, data.endDate, data.alertThreshold, userId
    ]
  );
  
  return result.rows[0];
}

export async function updateExpenseBudget(
  id: string,
  restaurantId: string,
  data: {
    categoryId?: string;
    budgetAmount?: number;
    periodType?: string;
    startDate?: string;
    endDate?: string;
    alertThreshold?: number;
    isActive?: boolean;
  }
) {
  const result = await pool.query(
    `UPDATE expense_budgets 
     SET category_id = COALESCE($1, category_id),
         budget_amount = COALESCE($2, budget_amount),
         period_type = COALESCE($3, period_type),
         start_date = COALESCE($4, start_date),
         end_date = COALESCE($5, end_date),
         alert_threshold = COALESCE($6, alert_threshold),
         is_active = COALESCE($7, is_active),
         updated_at = now()
     WHERE id = $8 AND restaurant_id = $9
     RETURNING *`,
    [
      data.categoryId, data.budgetAmount, data.periodType, data.startDate,
      data.endDate, data.alertThreshold, data.isActive, id, restaurantId
    ]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense budget not found');
  }
  
  return result.rows[0];
}

export async function deleteExpenseBudget(id: string, restaurantId: string) {
  const result = await pool.query(
    `UPDATE expense_budgets 
     SET is_active = false, updated_at = now()
     WHERE id = $1 AND restaurant_id = $2
     RETURNING id`,
    [id, restaurantId]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense budget not found');
  }
  
  return { success: true };
}

// ============================================
// EXPENSE APPROVAL WORKFLOW
// ============================================

export async function submitExpenseForApproval(
  expenseId: string,
  restaurantId: string,
  userId: string,
  userRole: string
) {
  // Update expense status to pending approval
  const result = await pool.query(
    `UPDATE expenses 
     SET approval_status = 'pending_approval',
         updated_at = now()
     WHERE id = $1 AND restaurant_id = $2
     RETURNING *`,
    [expenseId, restaurantId]
  );
  
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Expense not found');
  }

  // Create audit log
  await createAuditLog(expenseId, restaurantId, userId, userRole, 'submitted_for_approval', 'draft', 'pending_approval', 'Expense submitted for approval');

  return normalizeExpense(result.rows[0]);
}

export async function approveExpense(
  expenseId: string,
  restaurantId: string,
  userId: string,
  userRole: string,
  notes?: string
) {
  // Get current expense to track previous status
  const prevResult = await pool.query(
    `SELECT approval_status FROM expenses WHERE id = $1 AND restaurant_id = $2`,
    [expenseId, restaurantId]
  );

  if (prevResult.rows.length === 0) {
    throw new HttpError(404, 'Expense not found');
  }

  const previousStatus = prevResult.rows[0].approval_status;

  // Update expense status to approved
  const result = await pool.query(
    `UPDATE expenses 
     SET approval_status = 'approved',
         approved_by = $1,
         approved_at = now(),
         updated_at = now()
     WHERE id = $2 AND restaurant_id = $3
     RETURNING *`,
    [userId, expenseId, restaurantId]
  );

  // Create audit log
  await createAuditLog(expenseId, restaurantId, userId, userRole, 'approved', previousStatus, 'approved', notes || 'Expense approved');

  // Create approval note if provided
  if (notes) {
    await createExpenseNote(expenseId, restaurantId, userId, userRole, 'approval_note', notes);
  }

  return normalizeExpense(result.rows[0]);
}

export async function rejectExpense(
  expenseId: string,
  restaurantId: string,
  userId: string,
  userRole: string,
  rejectionReason: string
) {
  // Get current expense to track previous status
  const prevResult = await pool.query(
    `SELECT approval_status FROM expenses WHERE id = $1 AND restaurant_id = $2`,
    [expenseId, restaurantId]
  );

  if (prevResult.rows.length === 0) {
    throw new HttpError(404, 'Expense not found');
  }

  const previousStatus = prevResult.rows[0].approval_status;

  // Update expense status to rejected
  const result = await pool.query(
    `UPDATE expenses 
     SET approval_status = 'rejected',
         rejection_reason = $1,
         updated_at = now()
     WHERE id = $2 AND restaurant_id = $3
     RETURNING *`,
    [rejectionReason, expenseId, restaurantId]
  );

  // Create audit log
  await createAuditLog(expenseId, restaurantId, userId, userRole, 'rejected', previousStatus, 'rejected', rejectionReason);

  // Create rejection note
  await createExpenseNote(expenseId, restaurantId, userId, userRole, 'rejection_reason', rejectionReason);

  return normalizeExpense(result.rows[0]);
}

export async function recallExpense(
  expenseId: string,
  restaurantId: string,
  userId: string,
  userRole: string,
  reason?: string
) {
  // Get current expense to track previous status
  const prevResult = await pool.query(
    `SELECT approval_status FROM expenses WHERE id = $1 AND restaurant_id = $2`,
    [expenseId, restaurantId]
  );

  if (prevResult.rows.length === 0) {
    throw new HttpError(404, 'Expense not found');
  }

  const previousStatus = prevResult.rows[0].approval_status;

  // Update expense status to draft
  const result = await pool.query(
    `UPDATE expenses 
     SET approval_status = 'recalled',
         updated_at = now()
     WHERE id = $1 AND restaurant_id = $2
     RETURNING *`,
    [expenseId, restaurantId]
  );

  // Create audit log
  await createAuditLog(expenseId, restaurantId, userId, userRole, 'recalled', previousStatus, 'recalled', reason || 'Expense recalled');

  return normalizeExpense(result.rows[0]);
}

// ============================================
// EXPENSE RECEIPTS
// ============================================

export async function generateReceipt(
  expenseId: string,
  restaurantId: string,
  userId: string,
  receiptDate?: string
) {
  const receiptId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  const result = await pool.query(
    `INSERT INTO expense_receipts (id, expense_id, restaurant_id, receipt_number, receipt_date, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [receiptId, expenseId, restaurantId, receiptNumber, receiptDate || new Date().toISOString().split('T')[0], userId]
  );

  // Create audit log
  await createAuditLog(expenseId, restaurantId, userId, 'manager', 'updated', undefined, undefined, 'Receipt generated');

  return result.rows[0];
}

export async function getExpenseReceipt(expenseId: string, restaurantId: string) {
  const result = await pool.query(
    `SELECT * FROM expense_receipts WHERE expense_id = $1 AND restaurant_id = $2`,
    [expenseId, restaurantId]
  );

  return result.rows[0] || null;
}

// ============================================
// EXPENSE NOTES
// ============================================

export async function createExpenseNote(
  expenseId: string,
  restaurantId: string,
  userId: string,
  userRole: string,
  noteType: string,
  content: string
) {
  const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const result = await pool.query(
    `INSERT INTO expense_notes (id, expense_id, restaurant_id, note_type, content, created_by, created_by_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [noteId, expenseId, restaurantId, noteType, content, userId, userRole]
  );

  return result.rows[0];
}

export async function getExpenseNotes(expenseId: string, restaurantId: string) {
  const result = await pool.query(
    `SELECT * FROM expense_notes 
     WHERE expense_id = $1 AND restaurant_id = $2
     ORDER BY created_at DESC`,
    [expenseId, restaurantId]
  );

  return result.rows;
}

// ============================================
// EXPENSE AUDIT LOG
// ============================================

export async function createAuditLog(
  expenseId: string,
  restaurantId: string,
  userId: string,
  userRole: string,
  action: string,
  previousStatus?: string,
  newStatus?: string,
  notes?: string,
  changeDetails?: any
) {
  const logId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await pool.query(
    `INSERT INTO expense_audit_log (id, expense_id, restaurant_id, action, performed_by, performed_by_role, previous_status, new_status, change_details, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [logId, expenseId, restaurantId, action, userId, userRole, previousStatus || null, newStatus || null, changeDetails ? JSON.stringify(changeDetails) : null, notes || null]
  );
}

export async function getExpenseAuditLog(expenseId: string, restaurantId: string) {
  const result = await pool.query(
    `SELECT * FROM expense_audit_log 
     WHERE expense_id = $1 AND restaurant_id = $2
     ORDER BY created_at DESC`,
    [expenseId, restaurantId]
  );

  return result.rows;
}

// ============================================
// EXPENSEPENDING FOR APPROVAL
// ============================================

export async function getExpensesPendingApproval(restaurantId: string, limit: number = 50, offset: number = 0) {
  const result = await pool.query(
    `SELECT 
       e.*,
       ec.name as category_name,
       ec.color as category_color,
       ec.icon as category_icon
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.restaurant_id = $1 AND e.approval_status = 'pending_approval'
     ORDER BY e.created_at DESC
     LIMIT $2 OFFSET $3`,
    [restaurantId, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM expenses WHERE restaurant_id = $1 AND approval_status = 'pending_approval'`,
    [restaurantId]
  );

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

export async function getExpensesSummaryByApprovalStatus(restaurantId: string) {
  const result = await pool.query(
    `SELECT 
       approval_status,
       COUNT(*) as count,
       SUM(amount) as total_amount
     FROM expenses
     WHERE restaurant_id = $1
     GROUP BY approval_status`,
    [restaurantId]
  );

  return result.rows;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateNextDueDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate);
  
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  
  return date.toISOString().split('T')[0];
}
