import { apiRequest } from './http';
import { Promotion } from '../types';

export interface ValidatePromoResult {
  promotion: Promotion;
  discountAmount: number;
}

export async function validatePromoCode(
  code: string,
  restaurantId: string,
  orderSubtotal: number
): Promise<ValidatePromoResult> {
  return apiRequest('/promotions/validate', {
    method: 'POST',
    json: { code, restaurantId, orderSubtotal },
  });
}

export async function getPromotions(restaurantId: string): Promise<Promotion[]> {
  return apiRequest(`/promotions?restaurantId=${encodeURIComponent(restaurantId)}`);
}

export async function createPromotion(data: Partial<Promotion>): Promise<Promotion> {
  return apiRequest('/promotions', { method: 'POST', json: data });
}

export async function updatePromotion(id: string, data: Partial<Promotion>): Promise<Promotion> {
  return apiRequest(`/promotions/${id}`, { method: 'PUT', json: data });
}

export async function deletePromotion(id: string): Promise<void> {
  return apiRequest(`/promotions/${id}`, { method: 'DELETE' });
}
