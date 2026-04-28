import { apiRequest } from './http';
import { Review } from '../types';

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
