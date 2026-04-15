import { apiRequest, ApiError } from './http';
import type { Customer, LoyaltyTransaction, Reward, RewardRedemption, LoyaltySummary } from '../types';

const LOYALTY_BASE = '/api/loyalty';

function resolveRestaurantId(): string | undefined {
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

// Customer management
export async function createOrFindCustomer(customerData: {
  phone?: string;
  email?: string;
  name?: string;
  restaurantId?: string;
}): Promise<Customer> {
  const restaurantId = customerData.restaurantId || resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  return apiRequest<Customer>(`${LOYALTY_BASE}/customers`, {
    method: 'POST',
    json: { ...customerData, restaurantId },
  });
}

export async function getCustomers(): Promise<Customer[]> {
  try {
    const response = await apiRequest<Customer[] | { data?: Customer[]; customers?: Customer[] }>(`${LOYALTY_BASE}/customers`);
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.customers)) return response.customers;
    return [];
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
  const restaurantId = resolveRestaurantId();
  const query = restaurantId ? `?restaurantId=${encodeURIComponent(restaurantId)}` : '';
  return apiRequest<LoyaltySummary>(`${LOYALTY_BASE}/customers/${customerId}${query}`);
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
  const resolvedRestaurantId = restaurantId || resolveRestaurantId();
  if (!resolvedRestaurantId) throw new Error('No company selected');

  return apiRequest<Reward[]>(`${LOYALTY_BASE}/rewards?restaurantId=${encodeURIComponent(resolvedRestaurantId)}`);
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