import { apiRequest } from './http';

// API base URL
const API_BASE = 'https://scanner-3cku.onrender.com/api/tables';

export interface Table {
  id: string;
  table_number: number;
  name: string;
  capacity: number;
  location: string;
  is_active: boolean;
}

// Fetch all tables
export async function fetchTables(): Promise<Table[]> {
  try {
    return await apiRequest<Table[]>(`${API_BASE}`);
  } catch (err) {
    console.warn('Failed to fetch tables from backend');
    return [];
  }
}

// Create new table
export async function createTable(tableNumber: number, name?: string, capacity?: number): Promise<Table> {
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
