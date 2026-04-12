import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { pool } from '../db.js';
import { Response } from 'express';

const router = Router();

// Helper function to get current timestamp
const now = () => new Date().toISOString();

// Simple ID generator (avoiding uuid dependency)
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ── Credit Accounts ────────────────────────────────────────────────────────

// GET /api/credit/accounts - List all credit accounts
router.get('/accounts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone } = req.query;
    
    let query = `
      SELECT 
        id,
        customer_id,
        customer_name,
        customer_phone,
        credit_limit,
        current_balance,
        (credit_limit - current_balance) as available_credit,
        status,
        created_at,
        updated_at,
        last_payment_date,
        notes
      FROM credit_accounts
    `;
    
    const values: any[] = [];
    
    if (phone) {
      query += ' WHERE customer_phone = $1';
      values.push(phone);
    }
    
    query += ' ORDER BY customer_name';
    
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit accounts:', error);
    res.status(500).json({ error: 'Failed to fetch credit accounts' });
  }
});

// GET /api/credit/accounts/:id - Get specific credit account
router.get('/accounts/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        id,
        customer_id,
        customer_name,
        customer_phone,
        credit_limit,
        current_balance,
        (credit_limit - current_balance) as available_credit,
        status,
        created_at,
        updated_at,
        last_payment_date,
        notes
      FROM credit_accounts
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching credit account:', error);
    res.status(500).json({ error: 'Failed to fetch credit account' });
  }
});

// POST /api/credit/accounts - Create new credit account
router.post('/accounts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerName, customerPhone, creditLimit, notes } = req.body;
    const userId = req.staffId;
    const userName = req.headers['x-staff-name'] as string || 'Unknown';
    
    const trimmedName = typeof customerName === 'string' ? customerName.trim() : '';
    const trimmedPhone = typeof customerPhone === 'string' ? customerPhone.trim() : '';
    const creditLimitValue = Number(creditLimit);

    if (!trimmedName || !trimmedPhone || Number.isNaN(creditLimitValue) || creditLimitValue < 0) {
      return res.status(400).json({ error: 'Customer name, phone, and valid credit limit are required' });
    }

    // Check if account already exists for this phone
    const existing = await pool.query(
      'SELECT id FROM credit_accounts WHERE customer_phone = $1',
      [trimmedPhone]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Credit account already exists for this phone number' });
    }
    
    const accountId = generateId();
    const customerId = generateId();
    
    const result = await pool.query(`
      INSERT INTO credit_accounts (
        id, customer_id, customer_name, customer_phone, 
        credit_limit, current_balance, status, created_at, updated_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      accountId,
      customerId,
      trimmedName,
      trimmedPhone,
      creditLimitValue,
      0, // Initial balance
      'active',
      now(),
      now(),
      notes || null
    ]);
    
    // Create initial transaction record
    await pool.query(`
      INSERT INTO credit_transactions (
        id, account_id, customer_id, type, amount, balance_after,
        description, performed_by, performed_by_name, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      generateId(),
      accountId,
      result.rows[0].customer_id,
      'adjustment',
      0,
      0,
      'Account created',
      userId,
      userName,
      now()
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating credit account:', error);
    res.status(500).json({ error: 'Failed to create credit account' });
  }
});

// PATCH /api/credit/accounts/:id - Update credit account
router.patch('/accounts/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { creditLimit, status, notes } = req.body;
    
    // Check if account exists
    const existing = await pool.query('SELECT * FROM credit_accounts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (creditLimit !== undefined) {
      updates.push(`credit_limit = $${paramCount++}`);
      values.push(creditLimit);
    }
    
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = $${paramCount++}`);
    values.push(now());
    values.push(id); // WHERE clause
    
    const result = await pool.query(`
      UPDATE credit_accounts 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating credit account:', error);
    res.status(500).json({ error: 'Failed to update credit account' });
  }
});

// DELETE /api/credit/accounts/:id - Delete credit account
router.delete('/accounts/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if account exists
    const existing = await pool.query('SELECT * FROM credit_accounts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    // Check if account has zero balance
    if (existing.rows[0].current_balance !== 0) {
      return res.status(400).json({ error: 'Cannot delete account with outstanding balance' });
    }
    
    await pool.query('DELETE FROM credit_accounts WHERE id = $1', [id]);
    res.json({ message: 'Credit account deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit account:', error);
    res.status(500).json({ error: 'Failed to delete credit account' });
  }
});

// ── Credit Transactions ────────────────────────────────────────────────────

// GET /api/credit/accounts/:id/transactions - Get transaction history
router.get('/accounts/:id/transactions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Verify account exists
    const accountCheck = await pool.query('SELECT id FROM credit_accounts WHERE id = $1', [id]);
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    const result = await pool.query(`
      SELECT 
        id,
        account_id,
        customer_id,
        type,
        amount,
        balance_after,
        order_id,
        description,
        performed_by,
        performed_by_name,
        timestamp,
        metadata
      FROM credit_transactions
      WHERE account_id = $1
      ORDER BY timestamp DESC
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit transactions:', error);
    res.status(500).json({ error: 'Failed to fetch credit transactions' });
  }
});

// POST /api/credit/transactions/charge - Add charge to account
router.post('/transactions/charge', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, customerId, amount, orderId, description, performedBy, performedByName } = req.body;
    
    // Validate required fields
    if (!accountId || !amount || !description || !performedBy || !performedByName) {
      return res.status(400).json({ error: 'Account ID, amount, description, and performer info are required' });
    }
    
    // Get current account balance
    const accountResult = await pool.query(
      'SELECT current_balance, credit_limit, status, customer_id FROM credit_accounts WHERE id = $1',
      [accountId]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    const account = accountResult.rows[0];
    
    // Check if account is active
    if (account.status !== 'active') {
      return res.status(400).json({ error: `Cannot charge to ${account.status} account` });
    }
    
    // Calculate new balance
    const newBalance = account.current_balance + amount;
    
    // Check credit limit
    if (newBalance > account.credit_limit) {
      return res.status(400).json({ error: 'Credit limit exceeded' });
    }
    
    const transactionId = generateId();
    
    // Insert transaction
    await pool.query(`
      INSERT INTO credit_transactions (
        id, account_id, customer_id, type, amount, balance_after,
        order_id, description, performed_by, performed_by_name, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      transactionId,
      accountId,
      customerId || account.customer_id,
      'charge',
      amount,
      newBalance,
      orderId || null,
      description,
      performedBy,
      performedByName,
      now(),
      orderId ? JSON.stringify({ orderId, orderTotal: amount }) : null
    ]);
    
    // Update account balance
    await pool.query(
      'UPDATE credit_accounts SET current_balance = $1, updated_at = $2 WHERE id = $3',
      [newBalance, now(), accountId]
    );
    
    // Get updated account
    const updatedAccount = await pool.query(`
      SELECT 
        id,
        customer_id,
        customer_name,
        customer_phone,
        credit_limit,
        current_balance,
        (credit_limit - current_balance) as available_credit,
        status,
        created_at,
        updated_at,
        last_payment_date,
        notes
      FROM credit_accounts
      WHERE id = $1
    `, [accountId]);
    
    res.json({
      transaction: {
        id: transactionId,
        accountId,
        customerId: customerId || account.customer_id,
        type: 'charge',
        amount,
        balanceAfter: newBalance,
        orderId,
        description,
        performedBy,
        performedByName,
        timestamp: now()
      },
      account: updatedAccount.rows[0]
    });
  } catch (error) {
    console.error('Error adding credit charge:', error);
    res.status(500).json({ error: 'Failed to add credit charge' });
  }
});

// POST /api/credit/transactions/payment - Record payment
router.post('/transactions/payment', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, customerId, amount, paymentMethod, reference, paidBy, paidByName, notes } = req.body;
    
    // Validate required fields
    if (!accountId || !amount || !paymentMethod || !paidBy || !paidByName) {
      return res.status(400).json({ error: 'Account ID, amount, payment method, and payer info are required' });
    }
    
    // Get current account balance
    const accountResult = await pool.query(
      'SELECT current_balance, credit_limit, status, customer_id FROM credit_accounts WHERE id = $1',
      [accountId]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    const account = accountResult.rows[0];
    
    // Check if account is active
    if (account.status !== 'active' && account.status !== 'suspended') {
      return res.status(400).json({ error: `Cannot process payment for ${account.status} account` });
    }
    
    // Calculate new balance (payment reduces balance)
    const newBalance = Math.max(0, account.current_balance - amount);
    
    const transactionId = generateId();
    const paymentId = generateId();
    
    // Insert transaction
    await pool.query(`
      INSERT INTO credit_transactions (
        id, account_id, customer_id, type, amount, balance_after,
        description, performed_by, performed_by_name, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      transactionId,
      accountId,
      customerId || account.customer_id,
      'payment',
      amount,
      newBalance,
      `Payment received (${paymentMethod})`,
      paidBy,
      paidByName,
      now(),
      JSON.stringify({
        paymentMethod,
        reference,
        reason: 'payment'
      })
    ]);
    
    // Update account balance and last payment date
    await pool.query(
      'UPDATE credit_accounts SET current_balance = $1, last_payment_date = $2, updated_at = $3 WHERE id = $4',
      [newBalance, now(), now(), accountId]
    );
    
    // Get updated account
    const updatedAccount = await pool.query(`
      SELECT 
        id,
        customer_id,
        customer_name,
        customer_phone,
        credit_limit,
        current_balance,
        (credit_limit - current_balance) as available_credit,
        status,
        created_at,
        updated_at,
        last_payment_date,
        notes
      FROM credit_accounts
      WHERE id = $1
    `, [accountId]);
    
    res.json({
      transaction: {
        id: transactionId,
        accountId,
        customerId: customerId || account.customer_id,
        type: 'payment',
        amount,
        balanceAfter: newBalance,
        description: `Payment received (${paymentMethod})`,
        performedBy: paidBy,
        performedByName: paidByName,
        timestamp: now()
      },
      payment: {
        id: paymentId,
        accountId,
        customerId: customerId || account.customer_id,
        amount,
        paymentMethod,
        reference,
        paidBy,
        paidByName,
        paidAt: now(),
        notes
      },
      account: updatedAccount.rows[0]
    });
  } catch (error) {
    console.error('Error recording credit payment:', error);
    res.status(500).json({ error: 'Failed to record credit payment' });
  }
});

// POST /api/credit/transactions/adjustment - Manual adjustment
router.post('/transactions/adjustment', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, customerId, amount, reason, performedBy, performedByName } = req.body;
    
    // Validate required fields
    if (!accountId || !amount || !reason || !performedBy || !performedByName) {
      return res.status(400).json({ error: 'Account ID, amount, reason, and performer info are required' });
    }
    
    // Get current account balance
    const accountResult = await pool.query(
      'SELECT current_balance, credit_limit, status, customer_id FROM credit_accounts WHERE id = $1',
      [accountId]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Credit account not found' });
    }
    
    const account = accountResult.rows[0];
    
    // Calculate new balance (adjustment can be positive or negative)
    const newBalance = Math.max(0, account.current_balance + amount);
    
    const transactionId = generateId();
    
    // Insert transaction
    await pool.query(`
      INSERT INTO credit_transactions (
        id, account_id, customer_id, type, amount, balance_after,
        description, performed_by, performed_by_name, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      transactionId,
      accountId,
      customerId || account.customer_id,
      'adjustment',
      amount,
      newBalance,
      `Manual adjustment: ${reason}`,
      performedBy,
      performedByName,
      now(),
      JSON.stringify({ reason })
    ]);
    
    // Update account balance
    await pool.query(
      'UPDATE credit_accounts SET current_balance = $1, updated_at = $2 WHERE id = $3',
      [newBalance, now(), accountId]
    );
    
    // Get updated account
    const updatedAccount = await pool.query(`
      SELECT 
        id,
        customer_id,
        customer_name,
        customer_phone,
        credit_limit,
        current_balance,
        (credit_limit - current_balance) as available_credit,
        status,
        created_at,
        updated_at,
        last_payment_date,
        notes
      FROM credit_accounts
      WHERE id = $1
    `, [accountId]);
    
    res.json({
      transaction: {
        id: transactionId,
        accountId,
        customerId: customerId || account.customer_id,
        type: 'adjustment',
        amount,
        balanceAfter: newBalance,
        description: `Manual adjustment: ${reason}`,
        performedBy,
        performedByName,
        timestamp: now()
      },
      account: updatedAccount.rows[0]
    });
  } catch (error) {
    console.error('Error adding credit adjustment:', error);
    res.status(500).json({ error: 'Failed to add credit adjustment' });
  }
});

// ── Credit Applications ────────────────────────────────────────────────────

// GET /api/credit/applications - List credit applications
router.get('/applications', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT 
        id,
        customer_id,
        customer_name,
        customer_phone,
        requested_limit,
        status,
        requested_by,
        requested_by_name,
        requested_at,
        reviewed_by,
        reviewed_by_name,
        reviewed_at,
        notes,
        rejection_reason
      FROM credit_applications
    `;
    
    const values: any[] = [];
    let paramCount = 1;
    
    if (status) {
      query += ` WHERE status = $${paramCount++}`;
      values.push(status);
    }
    
    query += ' ORDER BY requested_at DESC';
    
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit applications:', error);
    res.status(500).json({ error: 'Failed to fetch credit applications' });
  }
});

// POST /api/credit/applications - Submit credit application
router.post('/applications', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerName, customerPhone, requestedLimit, notes } = req.body;
    const userId = req.staffId;
    const userName = req.headers['x-staff-name'] as string || 'Unknown';
    
    // Validate required fields
    if (!customerName || !customerPhone || !requestedLimit) {
      return res.status(400).json({ error: 'Customer name, phone, and requested limit are required' });
    }
    
    // Check if customer already has an account
    const existingAccount = await pool.query(
      'SELECT id FROM credit_accounts WHERE customer_phone = $1',
      [customerPhone]
    );
    
    if (existingAccount.rows.length > 0) {
      return res.status(400).json({ error: 'Customer already has a credit account' });
    }
    
    // Check if there's already a pending application
    const existingApplication = await pool.query(
      'SELECT id FROM credit_applications WHERE customer_phone = $1 AND status = $2',
      [customerPhone, 'pending']
    );
    
    if (existingApplication.rows.length > 0) {
      return res.status(400).json({ error: 'Customer already has a pending credit application' });
    }
    
    const applicationId = generateId();
    const customerId = generateId();
    
    const result = await pool.query(`
      INSERT INTO credit_applications (
        id, customer_id, customer_name, customer_phone, requested_limit,
        status, requested_by, requested_by_name, requested_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      applicationId,
      customerId,
      customerName,
      customerPhone,
      requestedLimit,
      'pending',
      userId,
      userName,
      now(),
      notes || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting credit application:', error);
    res.status(500).json({ error: 'Failed to submit credit application' });
  }
});

// POST /api/credit/applications/:id/review - Review credit application
router.post('/applications/:id/review', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, creditLimit, notes, rejectionReason } = req.body;
    const userId = req.staffId;
    const userName = req.headers['x-staff-name'] as string || 'Unknown';
    
    // Validate required fields
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    if (status === 'approved' && !creditLimit) {
      return res.status(400).json({ error: 'Credit limit is required for approved applications' });
    }
    
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required for rejected applications' });
    }
    
    // Get application
    const applicationResult = await pool.query(
      'SELECT * FROM credit_applications WHERE id = $1',
      [id]
    );
    
    if (applicationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Credit application not found' });
    }
    
    const application = applicationResult.rows[0];
    
    // Update application
    const result = await pool.query(`
      UPDATE credit_applications 
      SET status = $1, reviewed_by = $2, reviewed_by_name = $3, reviewed_at = $4, 
          notes = $5, rejection_reason = $6
      WHERE id = $7
      RETURNING *
    `, [
      status,
      userId,
      userName,
      now(),
      notes || null,
      rejectionReason || null,
      id
    ]);
    
    // If approved, create credit account
    if (status === 'approved' && creditLimit) {
      const accountId = generateId();
      await pool.query(`
        INSERT INTO credit_accounts (
          id, customer_id, customer_name, customer_phone, 
          credit_limit, current_balance, status, created_at, updated_at, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        accountId,
        application.customer_id,
        application.customer_name,
        application.customer_phone,
        creditLimit,
        0,
        'active',
        now(),
        now(),
        notes || null
      ]);
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error reviewing credit application:', error);
    res.status(500).json({ error: 'Failed to review credit application' });
  }
});

// ── Credit Summary & Alerts ────────────────────────────────────────────────

// GET /api/credit/summary - Get credit summary
router.get('/summary', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get account counts
    const accountCounts = await pool.query(`
      SELECT 
        COUNT(*) as total_accounts,
        COUNT(*) FILTER (WHERE status = 'active') as active_accounts
      FROM credit_accounts
    `);
    
    // Get financial summary
    const financialSummary = await pool.query(`
      SELECT 
        COALESCE(SUM(current_balance), 0) as total_outstanding,
        COALESCE(SUM(credit_limit - current_balance), 0) as total_available_credit,
        COUNT(*) FILTER (WHERE current_balance > 0) as accounts_with_balance,
        AVG(current_balance / credit_limit) as avg_utilization
      FROM credit_accounts
      WHERE status = 'active'
    `);
    
    // Get overdue accounts (assuming 30 days overdue)
    const overdueSummary = await pool.query(`
      SELECT 
        COUNT(*) as accounts_overdue,
        COALESCE(SUM(current_balance), 0) as overdue_amount
      FROM credit_accounts
      WHERE status = 'active' 
        AND current_balance > 0 
        AND (last_payment_date IS NULL OR last_payment_date < NOW() - INTERVAL '30 days')
    `);
    
    // Get accounts over limit
    const overLimitSummary = await pool.query(`
      SELECT COUNT(*) as accounts_over_limit
      FROM credit_accounts
      WHERE current_balance > credit_limit
    `);
    
    res.json({
      totalAccounts: parseInt(accountCounts.rows[0].total_accounts),
      activeAccounts: parseInt(accountCounts.rows[0].active_accounts),
      totalOutstanding: parseFloat(financialSummary.rows[0].total_outstanding),
      totalAvailableCredit: parseFloat(financialSummary.rows[0].total_available_credit),
      averageCreditUtilization: parseFloat(financialSummary.rows[0].avg_utilization || 0),
      accountsOverLimit: parseInt(overLimitSummary.rows[0].accounts_over_limit),
      overdueAmount: parseFloat(overdueSummary.rows[0].overdue_amount),
      accountsOverdue: parseInt(overdueSummary.rows[0].accounts_overdue)
    });
  } catch (error) {
    console.error('Error fetching credit summary:', error);
    res.status(500).json({ error: 'Failed to fetch credit summary' });
  }
});

// GET /api/credit/alerts - Get credit alerts
router.get('/alerts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        account_id,
        customer_name,
        customer_phone,
        type,
        message,
        amount,
        created_at,
        is_resolved
      FROM credit_alerts
      WHERE is_resolved = false
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit alerts:', error);
    res.status(500).json({ error: 'Failed to fetch credit alerts' });
  }
});

// POST /api/credit/alerts/:id/resolve - Mark alert as resolved
router.post('/alerts/:id/resolve', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE credit_alerts SET is_resolved = true WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error resolving credit alert:', error);
    res.status(500).json({ error: 'Failed to resolve credit alert' });
  }
});

export default router;