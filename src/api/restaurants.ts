import { apiRequest } from './http';
import type { Restaurant } from '../types';

const API_BASE = '/api/restaurants';

export async function fetchRestaurant(restaurantId: string): Promise<Restaurant> {
  return apiRequest<Restaurant>(`${API_BASE}/${restaurantId}`);
}

export async function fetchRestaurantPublic(restaurantId: string): Promise<Restaurant> {
  return apiRequest<Restaurant>(`${API_BASE}/public/${restaurantId}`);
}
