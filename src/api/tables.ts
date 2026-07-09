import { supabase } from '../lib/supabase';

function getRestaurantId(): string | undefined {
  if (typeof window !== 'undefined') {
    const direct = localStorage.getItem('restaurantId');
    if (direct && direct.trim()) return direct;

    const authUserRaw = localStorage.getItem('authUser');
    if (authUserRaw) {
      try {
        const authUser = JSON.parse(authUserRaw);
        const fallback = authUser?.restaurantId || authUser?.restaurant_id;
        if (typeof fallback === 'string' && fallback.trim()) {
          localStorage.setItem('restaurantId', fallback);
          return fallback;
        }
      } catch {
        return undefined;
      }
    }

    return undefined;
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
  if (!restaurantId) throw new Error('No company selected');

  const { data, error } = await supabase
    .from('tables')
    .insert({
      id: crypto.randomUUID(),
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
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const { error } = await supabase
    .from('tables')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId);

  if (error) throw error;
}

export async function callWaiter(tableNumber: number): Promise<{ success: boolean; message?: string }> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return { success: false, message: 'No restaurant context' };

  const channelName = `waiter-calls-${restaurantId}`;
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  await channel.send({
    type: 'broadcast',
    event: 'waiter:call',
    payload: { tableNumber, timestamp: new Date().toISOString(), restaurantId },
  });

  supabase.removeChannel(channel);
  return { success: true, message: 'Waiter has been notified' };
}
