import { apiRequest } from './http';
import type { Customer, LoyaltyTransaction, Reward, RewardRedemption, LoyaltySummary } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Customer management
export async function createOrFindCustomer(customerData: {
  phone?: string;
  email?: string;
  name?: string;
}): Promise<Customer> {
  return apiRequest<Customer>(`${API_BASE}/loyalty/customers`, {
    method: 'POST',
    json: customerData,
  });
}

export async function getCustomers(): Promise<Customer[]> {
  return apiRequest<Customer[]>(`${API_BASE}/loyalty/customers`);
}

export async function getCustomerDetails(customerId: string): Promise<LoyaltySummary> {
  return apiRequest<LoyaltySummary>(`${API_BASE}/loyalty/customers/${customerId}`);
}

// Points management
export async function awardPoints(data: {
  customerId: string;
  orderId?: string;
  points: number;
  description: string;
}): Promise<{ success: boolean; transactionId: string }> {
  return apiRequest<{ success: boolean; transactionId: string }>(`${API_BASE}/loyalty/points/earn`, {
    method: 'POST',
    json: data,
  });
}

// Rewards management
export async function getRewards(): Promise<Reward[]> {
  return apiRequest<Reward[]>(`${API_BASE}/loyalty/rewards`);
}

export async function createReward(rewardData: {
  name: string;
  description: string;
  pointsRequired: number;
  rewardType: 'discount' | 'free_item' | 'service';
  discountPercentage?: number;
  freeItemId?: string;
}): Promise<Reward> {
  return apiRequest<Reward>(`${API_BASE}/loyalty/rewards`, {
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
  }>(`${API_BASE}/loyalty/rewards/redeem`, {
    method: 'POST',
    json: data,
  });
}