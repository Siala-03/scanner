import { apiRequest } from './http';
import type { MenuItem } from '../types';

// API base URL
const API_BASE = 'https://scanner-3cku.onrender.com/api/menu';

// Fetch menu from backend
export async function fetchMenu(): Promise<MenuItem[]> {
  try {
    const data = await apiRequest<MenuItem[]>(`${API_BASE}`);
    return data;
  } catch (err) {
    console.warn('Failed to fetch menu from backend, using local');
    return [];
  }
}

// Upload menu to backend
export async function uploadMenu(items: MenuItem[]): Promise<{ message: string; count: number }> {
  return apiRequest<{ message: string; count: number }>(`${API_BASE}`, {
    method: 'POST',
    json: { items }
  });
}

// Clear menu on backend
export async function clearMenu(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${API_BASE}`, {
    method: 'DELETE'
  });
}
