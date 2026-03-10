import type { ServiceReview } from '../types';

const KEY = 'serviceReviews';

export function loadReviews(): ServiceReview[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ServiceReview[];
  } catch {
    return [];
  }
}

export function saveReviews(reviews: ServiceReview[]) {
  localStorage.setItem(KEY, JSON.stringify(reviews));
}

export function addReview(review: ServiceReview) {
  const all = loadReviews();
  all.unshift(review);
  saveReviews(all);
}

export function hasReviewForOrder(orderId: string): boolean {
  return loadReviews().some((r) => r.orderId === orderId);
}

export function getAverageRating(): number | null {
  const all = loadReviews();
  if (all.length === 0) return null;
  const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
  return Math.round(avg * 10) / 10;
}

