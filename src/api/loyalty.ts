import { apiRequest, ApiError } from './http';
import { supabase } from '../lib/supabase';
import type { Customer, LoyaltyTransaction, Reward, RewardRedemption, LoyaltySummary } from '../types';

const LOYALTY_BASE = '/loyalty';
const db = supabase;

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value ?? Date.now()));
}



function mapCustomer(row: any): Customer {
  return {
    id: row.id,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
    totalPoints: Number(row.total_points ?? row.totalPoints ?? 0),
    totalSpent: Number(row.total_spent ?? row.totalSpent ?? 0),
    joinDate: toDate(row.join_date ?? row.joinDate),
    lastVisit: row.last_visit || row.lastVisit ? toDate(row.last_visit ?? row.lastVisit) : undefined,
    visitCount: Number(row.visit_count ?? row.visitCount ?? 0),
  };
}

function mapReward(row: any): Reward {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    pointsRequired: Number(row.points_required ?? row.pointsRequired ?? 0),
    rewardType: row.reward_type ?? row.rewardType,
    discountPercentage: row.discount_percentage ?? row.discountPercentage ?? undefined,
    freeItemId: row.free_item_id ?? row.freeItemId ?? undefined,
    isActive: row.is_active ?? row.isActive ?? true,
  };
}

function mapTransaction(row: any): LoyaltyTransaction {
  return {
    id: row.id,
    customerId: row.customer_id ?? row.customerId,
    orderId: row.order_id ?? row.orderId ?? undefined,
    transactionType: row.transaction_type ?? row.transactionType,
    points: Number(row.points ?? 0),
    description: row.description ?? '',
    createdAt: toDate(row.created_at ?? row.createdAt),
  };
}

async function findCustomerBy(field: 'phone' | 'email', value: string, restaurantId: string): Promise<any | null> {
  const scoped = await db
    .from('customers')
    .select('*')
    .eq(field, value)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!scoped.error) return scoped.data;
  if (scoped.error.code !== '42703') throw scoped.error;

  // Backward compatibility for old schemas missing restaurant_id on customers
  const unscoped = await db
    .from('customers')
    .select('*')
    .eq(field, value)
    .maybeSingle();

  if (unscoped.error) throw unscoped.error;
  return unscoped.data;
}

function getRestaurantIdFromStorage(): string | undefined {
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

function resolveRestaurantId(): string | undefined {
  return getRestaurantIdFromStorage() ?? undefined;
}

// Customer management
export async function createOrFindCustomer(customerData: {
  phone?: string;
  email?: string;
  name?: string;
  restaurantId?: string;
}): Promise<Customer> {
  const restaurantId = customerData.restaurantId || await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const phone = customerData.phone?.trim();
  const email = customerData.email?.trim();
  const name = customerData.name?.trim();

  // Prefer backend route for customer-portal flows where Supabase RLS may block direct writes.
  try {
    const customer = await apiRequest<any>('/loyalty/customers', {
      method: 'POST',
      includeAuthHeaders: false,
      json: { phone, email, name, restaurantId },
    });
    return mapCustomer(customer);
  } catch {
    // Fallback to direct Supabase access.
  }

  let found: any | null = null;
  if (phone) {
    found = await findCustomerBy('phone', phone, restaurantId);
  }
  if (!found && email) {
    found = await findCustomerBy('email', email, restaurantId);
  }

  if (found) {
    const nextName = name || found.name || null;
    const nextEmail = email || found.email || null;

    // Keep customer profile fresh when an existing record is identified by phone/email.
    if (nextName !== found.name || nextEmail !== found.email) {
      const updated = await db
        .from('customers')
        .update({
          name: nextName,
          email: nextEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', found.id)
        .select('*')
        .single();

      if (!updated.error) {
        return mapCustomer(updated.data);
      }
    }

    return mapCustomer(found);
  }

  const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const insertPayload = {
    id,
    phone: phone || null,
    email: email || null,
    name: name || null,
    restaurant_id: restaurantId,
  };

  const inserted = await db
    .from('customers')
    .insert(insertPayload)
    .select('*')
    .single();

  if (inserted.error?.code === '42703') {
    const legacyInsert = await db
      .from('customers')
      .insert({ id, phone: phone || null, email: email || null, name: name || null })
      .select('*')
      .single();

    if (legacyInsert.error) throw legacyInsert.error;
    return mapCustomer(legacyInsert.data);
  }

  if (inserted.error) throw inserted.error;
  return mapCustomer(inserted.data);
}

export async function getCustomers(): Promise<Customer[]> {
  try {
    const restaurantId = await resolveRestaurantId();
    if (!restaurantId) return [];

    const result = await db
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('last_visit', { ascending: false });

    if (result.error?.code === '42703') {
      // Fail closed for tenant isolation when schema lacks restaurant scoping.
      return [];
    }

    if (result.error) throw result.error;
    return (result.data || []).map(mapCustomer);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 404 || /restaurantId is required/i.test(error.message))
    ) {
      return [];
    }

    throw error;
  }
}

export async function getCustomerDetails(customerId: string): Promise<LoyaltySummary> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  let customerRes = await db.from('customers').select('*').eq('id', customerId).eq('restaurant_id', restaurantId).maybeSingle();

  if (customerRes.error?.code === '42703') {
    throw new Error('Loyalty tenant isolation requires customers.restaurant_id');
  }

  if (customerRes.error) throw customerRes.error;
  if (!customerRes.data) throw new Error('Customer not found');

  let txRes = await db
    .from('loyalty_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (txRes.error?.code === '42703') {
    throw new Error('Loyalty tenant isolation requires loyalty_transactions.restaurant_id');
  }

  const points = Number(customerRes.data.total_points ?? customerRes.data.totalPoints ?? 0);

  let rewardsRes = await db
    .from('rewards')
    .select('*')
    .eq('is_active', true)
    .eq('restaurant_id', restaurantId)
    .lte('points_required', points)
    .order('points_required', { ascending: true });

  if (rewardsRes.error?.code === '42703') {
    throw new Error('Loyalty tenant isolation requires rewards.restaurant_id');
  }

  return {
    customer: mapCustomer(customerRes.data),
    recentTransactions: txRes.error ? [] : (txRes.data || []).map(mapTransaction),
    availableRewards: rewardsRes.error ? [] : (rewardsRes.data || []).map(mapReward),
  };
}

// Points management
export async function awardPoints(data: {
  customerId: string;
  orderId?: string;
  points: number;
  description: string;
}): Promise<{ success: boolean; transactionId: string }> {
  return apiRequest<{ success: boolean; transactionId: string }>(`${LOYALTY_BASE}/points/earn`, {
    method: 'POST',
    json: data,
  });
}

// Rewards management
export async function getRewards(restaurantId?: string): Promise<Reward[]> {
  const resolvedRestaurantId = restaurantId || await resolveRestaurantId();
  if (!resolvedRestaurantId) throw new Error('No company selected');

  const result = await db
    .from('rewards')
    .select('*')
    .eq('is_active', true)
    .eq('restaurant_id', resolvedRestaurantId)
    .order('points_required', { ascending: true });

  if (result.error?.code === '42703') {
    return [];
  }

  if (result.error) throw result.error;
  return (result.data || []).map(mapReward);
}

export async function createReward(rewardData: {
  name: string;
  description: string;
  pointsRequired: number;
  rewardType: 'discount' | 'free_item' | 'service';
  discountPercentage?: number;
  freeItemId?: string;
}): Promise<Reward> {
  return apiRequest<Reward>(`${LOYALTY_BASE}/rewards`, {
    method: 'POST',
    json: rewardData,
  });
}

export async function redeemReward(data: {
  customerId: string;
  rewardId: string;
  orderId?: string;
}): Promise<{
  success: boolean;
  redemptionId: string;
  reward: Reward;
  remainingPoints: number;
}> {
  return apiRequest<{
    success: boolean;
    redemptionId: string;
    reward: Reward;
    remainingPoints: number;
  }>(`${LOYALTY_BASE}/rewards/redeem`, {
    method: 'POST',
    json: data,
  });
}
