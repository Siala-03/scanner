import { callEdgeFn } from '../lib/supabase';
import { Review, MenuItemReview, MenuItemRatingSummary } from '../types';

export interface ReviewStats {
  total: number;
  avgRating: number | null;
  thisMonth: number;
  distribution: Array<{ rating: number; count: number }>;
}

export async function getReviews(
  restaurantId: string,
  params?: { rating?: number; waiterId?: string; limit?: number }
): Promise<Review[]> {
  const p: Record<string, string> = { restaurantId };
  if (params?.rating)   p.rating   = String(params.rating);
  if (params?.waiterId) p.waiterId = params.waiterId;
  if (params?.limit)    p.limit    = String(params.limit);
  return callEdgeFn('reviews', { params: p });
}

export async function getReviewStats(restaurantId: string): Promise<ReviewStats> {
  return callEdgeFn('reviews/stats', { params: { restaurantId } });
}

export async function submitReview(data: {
  restaurantId: string;
  orderId?: string;
  tableNumber?: number;
  rating: number;
  comment?: string;
  customerName?: string;
  waiterId?: string;
}): Promise<Review> {
  return callEdgeFn('reviews', { method: 'POST', body: data, includeStaffHeader: false });
}

export async function getMenuItemReviews(
  restaurantId: string,
  menuItemId?: string,
  limit = 10
): Promise<MenuItemReview[]> {
  const p: Record<string, string> = { restaurantId, limit: String(limit) };
  if (menuItemId) p.menuItemId = menuItemId;
  return callEdgeFn('reviews/menu-items', { params: p });
}

export async function getMenuItemRatingStats(
  restaurantId: string,
  menuItemIds?: string[]
): Promise<MenuItemRatingSummary[]> {
  const p: Record<string, string> = { restaurantId };
  if (menuItemIds?.length) p.menuItemIds = menuItemIds.join(',');
  return callEdgeFn('reviews/menu-items/stats', { params: p });
}

export async function submitMenuItemReview(data: {
  restaurantId: string;
  menuItemId: string;
  orderId?: string;
  rating: number;
  comment?: string;
  customerName?: string;
}): Promise<MenuItemReview> {
  return callEdgeFn('reviews/menu-items', { method: 'POST', body: data, includeStaffHeader: false });
}

export async function deleteMenuItemReview(id: string): Promise<void> {
  await callEdgeFn('reviews/menu-items', { method: 'DELETE', params: { id } });
}
