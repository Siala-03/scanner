import { apiRequest } from './http';
import type { MenuItem } from '../types';

// API base URL for menu. Use env var if available, otherwise relative paths.
const MENU_API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/menu`
  : '/api/menu';

function getRestaurantIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const restaurantTableMatch = path.match(/^\/r\/([^/]+)\/t\/(\d+)/);
  if (restaurantTableMatch) {
    return decodeURIComponent(restaurantTableMatch[1]);
  }

  const query = new URLSearchParams(window.location.search);
  const restaurantId = query.get('restaurantId');
  return restaurantId;
}

function getRestaurantId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem('restaurantId') || getRestaurantIdFromUrl() || undefined;
}

// Fetch menu from backend
export async function fetchMenu(): Promise<MenuItem[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) {
    // No restaurant context — return empty so caller falls back to local defaults
    return [];
  }
  const url = `${MENU_API_BASE}?restaurantId=${encodeURIComponent(restaurantId)}`;
  const result = await apiRequest<MenuItem[]>(url);
  return result || [];
}

// Upload menu to backend
export async function uploadMenu(items: MenuItem[]): Promise<{ message: string; count: number }> {
  return apiRequest<{ message: string; count: number }>(MENU_API_BASE, {
    method: 'POST',
    json: { items }
  });
}

// Clear menu on backend
export async function clearMenu(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(MENU_API_BASE, {
    method: 'DELETE'
  });
}
