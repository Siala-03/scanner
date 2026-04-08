import { apiRequest } from './http';

// API base URL
const API_BASE = '/api/tables';

export interface Table {
  id: string;
  tableNumber: number;
  name: string;
  capacity: number;
  location: string;
  restaurantId: string;
  isActive?: boolean;
}

// Fetch all tables for current restaurant
export async function fetchTables(): Promise<Table[]> {
  try {
    return await apiRequest<Table[]>(`${API_BASE}`);
  } catch (err) {
    console.warn('Failed to fetch tables from backend');
    return [];
  }
}

// Fetch tables for a specific restaurant (superadmin only)
export async function fetchTablesForRestaurant(restaurantId: string): Promise<Table[]> {
  try {
    return await apiRequest<Table[]>(`${API_BASE}?restaurantId=${restaurantId}`, {
      headers: { 'x-restaurant-id': restaurantId }
    });
  } catch (err) {
    console.warn(`Failed to fetch tables for restaurant ${restaurantId}`);
    return [];
  }
}

// Create new table
export async function createTable(tableNumber: number, name?: string, capacity?: number): Promise<Table> {
  console.log('API: Creating table with number:', tableNumber);
  return apiRequest<Table>(`${API_BASE}`, {
    method: 'POST',
    json: { table_number: tableNumber, name, capacity }
  });
}

// Delete table
export async function deleteTable(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/${id}`, {
    method: 'DELETE'
  });
}

// Call waiter for a table
export async function callWaiter(tableNumber: number): Promise<{ success: boolean; message?: string }> {
  return apiRequest<{ success: boolean; message?: string }>(`${API_BASE}/call-waiter`, {
    method: 'POST',
    json: { tableNumber }
  });
}
