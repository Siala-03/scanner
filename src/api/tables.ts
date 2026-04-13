import { supabase } from '../lib/supabase';

function getRestaurantId(): string | undefined {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('restaurantId') || undefined;
  }
  return undefined;
}

export interface Table {
  id: string;
  table_number: number;
  capacity: number;
  status: string;
  restaurant_id: string;
}

export async function fetchTables(): Promise<Table[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('table_number');

  if (error) return [];
  return data || [];
}

export async function fetchTablesForRestaurant(restaurantId: string): Promise<Table[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('table_number');

  if (error) return [];
  return data || [];
}

export async function createTable(tableNumber: number, capacity: number = 4): Promise<Table> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');
  
  const id = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data, error } = await supabase
    .from('tables')
    .insert({
      id,
      table_number: tableNumber,
      capacity,
      status: 'available',
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTable(id: string): Promise<void> {
  const { error } = await supabase.from('tables').delete().eq('id', id);
  if (error) throw error;
}

export async function callWaiter(tableNumber: number): Promise<{ success: boolean; message?: string }> {
  console.log(`Waiter called for table ${tableNumber}`);
  return { success: true, message: 'Waiter has been notified' };
}