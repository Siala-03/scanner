import { apiRequest } from './http';
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
  const q = new URLSearchParams({ restaurantId });
  if (params?.rating)   q.set('rating', String(params.rating));
  if (params?.waiterId) q.set('waiterId', params.waiterId);
  if (params?.limit)    q.set('limit', String(params.limit));
  return apiRequest(`/reviews?${q}`);
}

export async function getReviewStats(restaurantId: string): Promise<ReviewStats> {
  const q = new URLSearchParams({ restaurantId });
  return apiRequest(`/reviews/stats?${q}`);
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
  return apiRequest('/reviews', { method: 'POST', json: data });
}

export async function getMenuItemReviews(
  restaurantId: string,
  menuItemId: string,
  limit = 10
): Promise<MenuItemReview[]> {
  const q = new URLSearchParams({ restaurantId, menuItemId, limit: String(limit) });
  return apiRequest(`/reviews/menu-items?${q}`);
}

export async function getMenuItemRatingStats(
  restaurantId: string,
  menuItemIds?: string[]
): Promise<MenuItemRatingSummary[]> {
  const q = new URLSearchParams({ restaurantId });
  if (menuItemIds?.length) q.set('menuItemIds', menuItemIds.join(','));
  return apiRequest(`/reviews/menu-items/stats?${q}`);
}

export async function submitMenuItemReview(data: {
  restaurantId: string;
  menuItemId: string;
  orderId?: string;
  rating: number;
  comment?: string;
  customerName?: string;
}): Promise<MenuItemReview> {
  return apiRequest('/reviews/menu-items', { method: 'POST', json: data });
}
