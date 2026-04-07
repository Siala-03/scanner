import { apiRequest } from './http';
import type { MenuItem } from '../types';

// API base URL for menu. Use env var if available, otherwise relative paths.
const MENU_API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/menu`
  : '/api/menu';

// Fetch menu from backend
export async function fetchMenu(): Promise<MenuItem[]> {
  const url = `${MENU_API_BASE}`;
  console.log('Fetching menu from:', url);
  const result = await apiRequest<MenuItem[]>(MENU_API_BASE);
  console.log('Menu fetched successfully, items:', result?.length ?? 0);
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
