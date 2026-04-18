import { supabase, supabaseAdmin } from '../lib/supabase';
import type { CustomerCreditAccount, CreditTransaction, CreditApplication, CreditPayment, CreditSummary, CreditAlert } from '../types/credit';

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
      return undefined;
    }
  }

  return undefined;
}

function getStaffId(): string {
  return localStorage.getItem('staffId') || 'system';
}

function getStaffName(): string {
  return localStorage.getItem('staffName') || 'Manager';
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeCreditAccount(raw: any): CustomerCreditAccount {
  return {
    id: raw.id,
    customerId: raw.customer_id,
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    creditLimit: raw.credit_limit,
    currentBalance: raw.current_balance,
    availableCredit: raw.credit_limit - raw.current_balance,
    status: raw.status,
    restaurantId: raw.restaurant_id,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function normalizeTransaction(raw: any): CreditTransaction {
  return {
    id: raw.id,
    accountId: raw.account_id,
    orderId: raw.order_id,
    amount: raw.amount,
    type: raw.type,
    notes: raw.notes,
    performedBy: raw.performed_by,
    performedByName: raw.performed_by_name,
    createdAt: raw.created_at,
  };
}

function normalizeApplication(raw: any): CreditApplication {
  return {
    id: raw.id,
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    customerEmail: raw.customer_email,
    requestedLimit: raw.requested_limit,
    status: raw.status,
    approvedLimit: raw.approved_limit,
    notes: raw.notes,
    rejectionReason: raw.rejection_reason,
    createdAt: raw.created_at,
    restaurantId: raw.restaurant_id,
  };
}

// ── Credit Accounts ────────────────────────────────────────────────────────

export async function getCreditAccounts(): Promise<CustomerCreditAccount[]> {
  const restaurantId = getRestaurantId();
  console.log('getCreditAccounts - restaurantId:', restaurantId);
  if (!restaurantId) {
    console.warn('getCreditAccounts: No restaurantId in localStorage');
    return [];
  }

  const { data, error } = await supabase
    .from('credit_accounts')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('customer_name');

  if (error) { 
    console.error('getCreditAccounts error:', error); 
    return []; 
  }
  console.log('getCreditAccounts - fetched:', data?.length, 'accounts');
  return (data || []).map(normalizeCreditAccount);
}

export async function getCreditAccount(accountId: string): Promise<CustomerCreditAccount> {
  const { data, error } = await supabase
    .from('credit_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error) { console.error('getCreditAccount error:', error); throw error; }
  return normalizeCreditAccount(data);
}

export async function getCreditAccountByPhone(phone: string): Promise<CustomerCreditAccount | null> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return null;

  const { data, error } = await supabase
    .from('credit_accounts')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('customer_phone', phone)
    .limit(1);

  if (error || !data?.length) return null;
  return normalizeCreditAccount(data[0]);
}

export async function createCreditAccount(data: {
  customerName: string;
  customerPhone: string;
  creditLimit: number;
  notes?: string;
}): Promise<CustomerCreditAccount> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const id = crypto.randomUUID();

  const fullPayload = {
    id,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    credit_limit: data.creditLimit,
    current_balance: 0,
    status: 'active',
    notes: data.notes || '',
    restaurant_id: restaurantId,
  };

  let { data: result, error } = await supabaseAdmin
    .from('credit_accounts')
    .insert(fullPayload)
    .select()
    .single();

  // Legacy schema compatibility: retry without notes if the column does not exist.
  if (error?.code === 'PGRST204' && String(error?.message || '').includes("'notes'")) {
    ({ data: result, error } = await supabaseAdmin
      .from('credit_accounts')
      .insert({
        id,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        credit_limit: data.creditLimit,
        current_balance: 0,
        status: 'active',
        restaurant_id: restaurantId,
      })
      .select()
      .single());
  }

  if (error) { console.error('createCreditAccount error:', error); throw error; }
  return normalizeCreditAccount(result);
}

export async function updateCreditAccount(
  accountId: string,
  data: Partial<{
    creditLimit: number;
    status: 'active' | 'suspended' | 'blocked';
    notes: string;
  }>
): Promise<CustomerCreditAccount> {
  const fullPayload = {
    credit_limit: data.creditLimit,
    status: data.status,
    notes: data.notes,
    updated_at: new Date().toISOString(),
  };

  let { data: result, error } = await supabaseAdmin
    .from('credit_accounts')
    .update(fullPayload)
    .eq('id', accountId)
    .select()
    .single();

  // Legacy schema compatibility: retry without notes if the column does not exist.
  if (error?.code === 'PGRST204' && String(error?.message || '').includes("'notes'")) {
    ({ data: result, error } = await supabaseAdmin
      .from('credit_accounts')
      .update({
        credit_limit: data.creditLimit,
        status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .select()
      .single());
  }

  if (error) { console.error('updateCreditAccount error:', error); throw error; }
  return normalizeCreditAccount(result);
}

export async function deleteCreditAccount(accountId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('credit_accounts')
    .delete()
    .eq('id', accountId);

  if (error) { console.error('deleteCreditAccount error:', error); throw error; }
}

// ── Credit Transactions ────────────────────────────────────────────────────

export async function getCreditTransactions(accountId: string): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) { console.error('getCreditTransactions error:', error); return []; }
  return (data || []).map(normalizeTransaction);
}

export async function addCreditCharge(data: {
  accountId: string;
  customerId: string;
  amount: number;
  orderId?: string;
  description: string;
  performedBy: string;
  performedByName: string;
}): Promise<{ transaction: CreditTransaction; account: CustomerCreditAccount }> {
  const staffId = getStaffId();

  const { data: txResult, error: txError } = await supabaseAdmin
    .from('credit_transactions')
    .insert({
      account_id: data.accountId,
      order_id: data.orderId,
      amount: data.amount,
      type: 'charge',
      notes: data.description,
      performed_by: staffId,
      performed_by_name: data.performedByName,
    })
    .select()
    .single();

  if (txError) { console.error('addCreditCharge error:', txError); throw txError; }

  // Update account balance directly
  const { data: account, error: accError } = await supabaseAdmin
    .from('credit_accounts')
    .select('current_balance')
    .eq('id', data.accountId)
    .single();

  if (!accError && account) {
    await supabaseAdmin
      .from('credit_accounts')
      .update({ current_balance: (account.current_balance || 0) + data.amount })
      .eq('id', data.accountId);
  }

  const updatedAccount = await getCreditAccount(data.accountId);
  return { transaction: normalizeTransaction(txResult), account: updatedAccount };
}

export async function addCreditPayment(data: {
  accountId: string;
  customerId: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'mobile' | 'bank_transfer' | 'other';
  reference?: string;
  paidBy: string;
  paidByName: string;
  notes?: string;
}): Promise<{ transaction: CreditTransaction; payment: CreditPayment; account: CustomerCreditAccount }> {
  const staffId = getStaffId();

  const { data: txResult, error: txError } = await supabaseAdmin
    .from('credit_transactions')
    .insert({
      account_id: data.accountId,
      amount: data.amount,
      type: 'payment',
      notes: data.notes || '',
      performed_by: staffId,
      performed_by_name: data.paidByName,
    })
    .select()
    .single();

  if (txError) { console.error('addCreditPayment error:', txError); throw txError; }

  // Update account balance (subtract payment from balance)
  const { data: account, error: accError } = await supabaseAdmin
    .from('credit_accounts')
    .select('current_balance')
    .eq('id', data.accountId)
    .single();

  if (!accError && account) {
    const newBalance = Math.max(0, (account.current_balance || 0) - data.amount);
    await supabaseAdmin
      .from('credit_accounts')
      .update({ current_balance: newBalance })
      .eq('id', data.accountId);
  }

  const updatedAccount = await getCreditAccount(data.accountId);
  const payment: CreditPayment = {
    id: txResult.id,
    transactionId: txResult.id,
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    reference: data.reference || '',
    createdAt: new Date().toISOString(),
  };
  return { transaction: normalizeTransaction(txResult), payment, account: updatedAccount };
}

export async function addCreditAdjustment(data: {
  accountId: string;
  customerId: string;
  amount: number;
  reason: string;
  performedBy: string;
  performedByName: string;
}): Promise<{ transaction: CreditTransaction; account: CustomerCreditAccount }> {
  const staffId = getStaffId();

  const { data: txResult, error } = await supabaseAdmin
    .from('credit_transactions')
    .insert({
      account_id: data.accountId,
      amount: data.amount,
      type: 'adjustment',
      notes: `${data.reason}`,
      performed_by: staffId,
      performed_by_name: data.performedByName,
    })
    .select()
    .single();

  if (error) { console.error('addCreditAdjustment error:', error); throw error; }

  const updatedAccount = await getCreditAccount(data.accountId);
  return { transaction: normalizeTransaction(txResult), account: updatedAccount };
}

// ── Credit Applications ────────────────────────────────────────────────────

export async function getCreditApplications(status?: string): Promise<CreditApplication[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  let query = supabase
    .from('credit_applications')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) { console.error('getCreditApplications error:', error); return []; }
  return (data || []).map(normalizeApplication);
}

export async function submitCreditApplication(data: {
  customerName: string;
  customerPhone: string;
  requestedLimit: number;
  notes?: string;
  requestedBy: string;
  requestedByName: string;
}): Promise<CreditApplication> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const { data: result, error } = await supabaseAdmin
    .from('credit_applications')
    .insert({
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      requested_limit: data.requestedLimit,
      notes: data.notes || '',
      status: 'pending',
      restaurant_id: restaurantId,
    })
    .select()
    .single();

  if (error) { console.error('submitCreditApplication error:', error); throw error; }
  return normalizeApplication(result);
}

export async function reviewCreditApplication(
  applicationId: string,
  data: {
    status: 'approved' | 'rejected';
    creditLimit?: number;
    notes?: string;
    rejectionReason?: string;
    reviewedBy: string;
    reviewedByName: string;
  }
): Promise<CreditApplication> {
  const staffId = getStaffId();
  const staffName = getStaffName();

  const updateData: any = {
    status: data.status,
    notes: data.notes || '',
    reviewed_by: staffId,
    reviewed_by_name: staffName,
  };

  if (data.status === 'approved' && data.creditLimit) {
    updateData.approved_limit = data.creditLimit;
  }
  if (data.status === 'rejected' && data.rejectionReason) {
    updateData.rejection_reason = data.rejectionReason;
  }

  const { data: result, error } = await supabaseAdmin
    .from('credit_applications')
    .update(updateData)
    .eq('id', applicationId)
    .select()
    .single();

  if (error) { console.error('reviewCreditApplication error:', error); throw error; }
  return normalizeApplication(result);
}

// ── Credit Summary & Alerts ────────────────────────────────────────────────

export async function getCreditSummary(): Promise<CreditSummary> {
  const restaurantId = getRestaurantId();
  console.log('getCreditSummary - restaurantId:', restaurantId);
  if (!restaurantId) {
    console.warn('getCreditSummary: No restaurantId in localStorage');
    return { totalAccounts: 0, totalBalance: 0, totalCreditLimit: 0, activeAccounts: 0 };
  }

  const { data, error } = await supabase
    .from('credit_accounts')
    .select('credit_limit, current_balance, status')
    .eq('restaurant_id', restaurantId);

  if (error) { 
    console.error('getCreditSummary error:', error); 
    return { totalAccounts: 0, totalBalance: 0, totalCreditLimit: 0, activeAccounts: 0 }; 
  }

  const accounts = data || [];
  console.log('getCreditSummary - fetched:', accounts.length, 'accounts');
  return {
    totalAccounts: accounts.length,
    totalBalance: accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0),
    totalCreditLimit: accounts.reduce((sum, a) => sum + (a.credit_limit || 0), 0),
    activeAccounts: accounts.filter(a => a.status === 'active').length,
  };
}

export async function getCreditAlerts(): Promise<CreditAlert[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('credit_accounts')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active');

  if (error) { console.error('getCreditAlerts error:', error); return []; }

  const alerts: CreditAlert[] = [];
  for (const account of (data || [])) {
    if (account.current_balance >= account.credit_limit) {
      alerts.push({
        id: `alert-${account.id}`,
        accountId: account.id,
        customerName: account.customer_name,
        phone: account.customer_phone,
        type: 'limit_reached',
        message: `${account.customer_name} has reached their credit limit`,
        createdAt: account.updated_at,
      });
    } else if (account.current_balance >= account.credit_limit * 0.9) {
      alerts.push({
        id: `alert-${account.id}`,
        accountId: account.id,
        customerName: account.customer_name,
        phone: account.customer_phone,
        type: 'near_limit',
        message: `${account.customer_name} is near their credit limit`,
        createdAt: account.updated_at,
      });
    }
  }

  return alerts;
}

export async function resolveCreditAlert(alertId: string): Promise<void> {
  // Alerts are computed, nothing to resolve in DB
  console.log('Resolved alert:', alertId);
}