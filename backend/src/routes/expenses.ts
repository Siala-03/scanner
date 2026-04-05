import { Router, Request, Response } from 'express';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  getExpenseAnalytics,
  getExpenseBudgets,
  createExpenseBudget,
  updateExpenseBudget,
  deleteExpenseBudget,
  generateRecurringExpenses,
  submitExpenseForApproval,
  approveExpense,
  rejectExpense,
  recallExpense,
  generateReceipt,
  getExpenseReceipt,
  createExpenseNote,
  getExpenseNotes,
  getExpenseAuditLog,
  getExpensesPendingApproval,
  getExpensesSummaryByApprovalStatus
} from '../services/expenseService.js';

const router = Router();

// ============================================
// EXPENSE CATEGORIES
// ============================================

// GET all expense categories
router.get('/categories', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    console.log('📋 Fetching expense categories for restaurant:', restaurantId);
    
    const categories = await getExpenseCategories(restaurantId);
    console.log('✅ Expense categories fetched:', categories.length, 'categories');
    
    res.json(categories);
  } catch (error) {
    console.error('❌ Error fetching expense categories:', error);
    res.status(500).json({ error: 'Failed to fetch expense categories' });
  }
});

// POST create expense category
router.post('/categories', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, color, icon } = req.body;
    
    if (!name) {
      throw new HttpError(400, 'Category name is required');
    }

    const category = await createExpenseCategory(req.restaurantId!, {
      name,
      description,
      color: color || '#6366f1',
      icon: icon || 'receipt'
    });
    
    res.status(201).json(category);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating expense category:', error);
      res.status(500).json({ error: 'Failed to create expense category' });
    }
  }
});

// PUT update expense category
router.put('/categories/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon, isActive } = req.body;

    const category = await updateExpenseCategory(id, req.restaurantId!, {
      name,
      description,
      color,
      icon,
      isActive
    });
    
    res.json(category);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating expense category:', error);
      res.status(500).json({ error: 'Failed to update expense category' });
    }
  }
});

// DELETE expense category
router.delete('/categories/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await deleteExpenseCategory(id, req.restaurantId!);
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting expense category:', error);
      res.status(500).json({ error: 'Failed to delete expense category' });
    }
  }
});

// ============================================
// EXPENSES
// ============================================

// GET all expenses with filters
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      categoryId,
      paymentStatus,
      paymentMethod,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      isRecurring,
      isTaxDeductible,
      vendorName,
      searchQuery,
      page,
      limit,
      sortBy,
      sortOrder
    } = req.query;

    const filters = {
      categoryId: categoryId as string,
      paymentStatus: paymentStatus as string,
      paymentMethod: paymentMethod as string,
      startDate: startDate as string,
      endDate: endDate as string,
      minAmount: minAmount ? parseFloat(minAmount as string) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount as string) : undefined,
      isRecurring: isRecurring === 'true',
      isTaxDeductible: isTaxDeductible === 'true',
      vendorName: vendorName as string,
      searchQuery: searchQuery as string
    };

    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      sortBy: sortBy as string || 'expenseDate',
      sortOrder: sortOrder as string || 'desc'
    };

    const result = await getAllExpenses(req.restaurantId!, filters, pagination);
    res.json(result);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// GET single expense by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const expense = await getExpenseById(id, req.restaurantId!);
    
    if (!expense) {
      throw new HttpError(404, 'Expense not found');
    }
    
    res.json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching expense:', error);
      res.status(500).json({ error: 'Failed to fetch expense' });
    }
  }
});

// POST create expense
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      categoryId,
      vendorName,
      description,
      amount,
      currency,
      expenseDate,
      paymentMethod,
      paymentStatus,
      referenceNumber,
      notes,
      isRecurring,
      recurringFrequency,
      recurringEndDate,
      taxAmount,
      taxRate,
      isTaxDeductible
    } = req.body;
    
    if (!categoryId || !description || amount === undefined || !expenseDate) {
      throw new HttpError(400, 'Category, description, amount, and expense date are required');
    }

    const expense = await createExpense(req.restaurantId!, req.staffId!, {
      categoryId,
      vendorName,
      description,
      amount,
      currency: currency || 'RWF',
      expenseDate,
      paymentMethod,
      paymentStatus: paymentStatus || 'paid',
      referenceNumber,
      notes,
      isRecurring: isRecurring || false,
      recurringFrequency,
      recurringEndDate,
      taxAmount: taxAmount || 0,
      taxRate: taxRate || 0,
      isTaxDeductible: isTaxDeductible || false
    });
    
    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating expense:', error);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  }
});

// PUT update expense
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      categoryId,
      vendorName,
      description,
      amount,
      currency,
      expenseDate,
      paymentMethod,
      paymentStatus,
      referenceNumber,
      notes,
      isRecurring,
      recurringFrequency,
      recurringEndDate,
      taxAmount,
      taxRate,
      isTaxDeductible
    } = req.body;

    const expense = await updateExpense(id, req.restaurantId!, {
      categoryId,
      vendorName,
      description,
      amount,
      currency,
      expenseDate,
      paymentMethod,
      paymentStatus,
      referenceNumber,
      notes,
      isRecurring,
      recurringFrequency,
      recurringEndDate,
      taxAmount,
      taxRate,
      isTaxDeductible
    });
    
    res.json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating expense:', error);
      res.status(500).json({ error: 'Failed to update expense' });
    }
  }
});

// DELETE expense
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await deleteExpense(id, req.restaurantId!);
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting expense:', error);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  }
});

// ============================================
// RECURRING EXPENSES
// ============================================

// GET all recurring expenses
router.get('/recurring', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const recurringExpenses = await getRecurringExpenses(req.restaurantId!);
    res.json(recurringExpenses);
  } catch (error) {
    console.error('Error fetching recurring expenses:', error);
    res.status(500).json({ error: 'Failed to fetch recurring expenses' });
  }
});

// POST create recurring expense
router.post('/recurring', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      categoryId,
      vendorName,
      description,
      amount,
      currency,
      frequency,
      startDate,
      endDate,
      paymentMethod,
      autoGenerate,
      notes
    } = req.body;
    
    if (!categoryId || !description || amount === undefined || !frequency || !startDate) {
      throw new HttpError(400, 'Category, description, amount, frequency, and start date are required');
    }

    const recurringExpense = await createRecurringExpense(req.restaurantId!, req.staffId!, {
      categoryId,
      vendorName,
      description,
      amount,
      currency: currency || 'RWF',
      frequency,
      startDate,
      endDate,
      paymentMethod,
      autoGenerate: autoGenerate || false,
      notes
    });
    
    res.status(201).json(recurringExpense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating recurring expense:', error);
      res.status(500).json({ error: 'Failed to create recurring expense' });
    }
  }
});

// PUT update recurring expense
router.put('/recurring/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      categoryId,
      vendorName,
      description,
      amount,
      currency,
      frequency,
      startDate,
      endDate,
      paymentMethod,
      autoGenerate,
      isActive,
      notes
    } = req.body;

    const recurringExpense = await updateRecurringExpense(id, req.restaurantId!, {
      categoryId,
      vendorName,
      description,
      amount,
      currency,
      frequency,
      startDate,
      endDate,
      paymentMethod,
      autoGenerate,
      isActive,
      notes
    });
    
    res.json(recurringExpense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating recurring expense:', error);
      res.status(500).json({ error: 'Failed to update recurring expense' });
    }
  }
});

// DELETE recurring expense
router.delete('/recurring/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await deleteRecurringExpense(id, req.restaurantId!);
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting recurring expense:', error);
      res.status(500).json({ error: 'Failed to delete recurring expense' });
    }
  }
});

// POST generate recurring expenses
router.post('/recurring/generate', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await generateRecurringExpenses(req.restaurantId!);
    res.json(result);
  } catch (error) {
    console.error('Error generating recurring expenses:', error);
    res.status(500).json({ error: 'Failed to generate recurring expenses' });
  }
});

// ============================================
// EXPENSE ANALYTICS
// ============================================

// GET expense analytics
router.get('/analytics', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const analytics = await getExpenseAnalytics(
      req.restaurantId!,
      startDate as string,
      endDate as string
    );
    
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching expense analytics:', error);
    res.status(500).json({ error: 'Failed to fetch expense analytics' });
  }
});

// ============================================
// EXPENSE BUDGETS
// ============================================

// GET all expense budgets
router.get('/budgets', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const budgets = await getExpenseBudgets(req.restaurantId!);
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching expense budgets:', error);
    res.status(500).json({ error: 'Failed to fetch expense budgets' });
  }
});

// POST create expense budget
router.post('/budgets', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      categoryId,
      budgetAmount,
      periodType,
      startDate,
      endDate,
      alertThreshold
    } = req.body;
    
    if (!categoryId || budgetAmount === undefined || !periodType || !startDate || !endDate) {
      throw new HttpError(400, 'Category, budget amount, period type, start date, and end date are required');
    }

    const budget = await createExpenseBudget(req.restaurantId!, req.staffId!, {
      categoryId,
      budgetAmount,
      periodType,
      startDate,
      endDate,
      alertThreshold: alertThreshold || 80
    });
    
    res.status(201).json(budget);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating expense budget:', error);
      res.status(500).json({ error: 'Failed to create expense budget' });
    }
  }
});

// PUT update expense budget
router.put('/budgets/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      categoryId,
      budgetAmount,
      periodType,
      startDate,
      endDate,
      alertThreshold,
      isActive
    } = req.body;

    const budget = await updateExpenseBudget(id, req.restaurantId!, {
      categoryId,
      budgetAmount,
      periodType,
      startDate,
      endDate,
      alertThreshold,
      isActive
    });
    
    res.json(budget);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating expense budget:', error);
      res.status(500).json({ error: 'Failed to update expense budget' });
    }
  }
});

// DELETE expense budget
router.delete('/budgets/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await deleteExpenseBudget(id, req.restaurantId!);
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting expense budget:', error);
      res.status(500).json({ error: 'Failed to delete expense budget' });
    }
  }
});

// ============================================
// EXPENSE APPROVAL WORKFLOW
// ============================================

// POST submit expense for approval
router.post('/:id/submit-approval', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.staffRole || 'supervisor';

    const expense = await submitExpenseForApproval(id, req.restaurantId!, req.staffId!, userRole);
    res.json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error submitting expense for approval:', error);
      res.status(500).json({ error: 'Failed to submit expense for approval' });
    }
  }
});

// POST approve expense
router.post('/:id/approve', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userRole = req.staffRole || 'manager';

    const expense = await approveExpense(id, req.restaurantId!, req.staffId!, userRole, notes);
    res.json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error approving expense:', error);
      res.status(500).json({ error: 'Failed to approve expense' });
    }
  }
});

// POST reject expense
router.post('/:id/reject', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const userRole = req.staffRole || 'manager';

    if (!rejectionReason) {
      throw new HttpError(400, 'Rejection reason is required');
    }

    const expense = await rejectExpense(id, req.restaurantId!, req.staffId!, userRole, rejectionReason);
    res.json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error rejecting expense:', error);
      res.status(500).json({ error: 'Failed to reject expense' });
    }
  }
});

// POST recall expense
router.post('/:id/recall', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userRole = req.staffRole || 'manager';

    const expense = await recallExpense(id, req.restaurantId!, req.staffId!, userRole, reason);
    res.json(expense);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error recalling expense:', error);
      res.status(500).json({ error: 'Failed to recall expense' });
    }
  }
});

// GET expenses pending approval
router.get('/approval/pending', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await getExpensesPendingApproval(
      req.restaurantId!,
      parseInt(limit as string),
      parseInt(offset as string)
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching pending expenses:', error);
    res.status(500).json({ error: 'Failed to fetch pending expenses' });
  }
});

// GET approval status summary
router.get('/approval/summary', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await getExpensesSummaryByApprovalStatus(req.restaurantId!);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching approval summary:', error);
    res.status(500).json({ error: 'Failed to fetch approval summary' });
  }
});

// ============================================
// EXPENSE RECEIPTS
// ============================================

// POST generate receipt
router.post('/:id/generate-receipt', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { receiptDate } = req.body;

    const receipt = await generateReceipt(id, req.restaurantId!, req.staffId!, receiptDate);
    res.status(201).json(receipt);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error generating receipt:', error);
      res.status(500).json({ error: 'Failed to generate receipt' });
    }
  }
});

// GET expense receipt
router.get('/:id/receipt', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const receipt = await getExpenseReceipt(id, req.restaurantId!);
    
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    
    res.json(receipt);
  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

// ============================================
// EXPENSE NOTES
// ============================================

// POST create expense note
router.post('/:id/notes', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { noteType, content } = req.body;
    const userRole = req.staffRole || 'supervisor';

    if (!noteType || !content) {
      throw new HttpError(400, 'Note type and content are required');
    }

    const note = await createExpenseNote(
      id,
      req.restaurantId!,
      req.staffId!,
      userRole,
      noteType,
      content
    );
    
    res.status(201).json(note);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating expense note:', error);
      res.status(500).json({ error: 'Failed to create expense note' });
    }
  }
});

// GET expense notes
router.get('/:id/notes', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const notes = await getExpenseNotes(id, req.restaurantId!);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching expense notes:', error);
    res.status(500).json({ error: 'Failed to fetch expense notes' });
  }
});

// ============================================
// EXPENSE AUDIT LOG
// ============================================

// GET expense audit log
router.get('/:id/audit-log', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const auditLog = await getExpenseAuditLog(id, req.restaurantId!);
    res.json(auditLog);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
