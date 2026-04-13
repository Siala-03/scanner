import { supabase, supabaseAdmin } from '../lib/supabase';

export interface Restaurant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  settings: Record<string, any>;
  created_at: string;
  // Virtual fields derived from settings
  city?: string;
  country?: string;
  managerCount?: number;
}

function withVirtualFields(r: any): Restaurant {
  return {
    ...r,
    city: r.settings?.city || '',
    country: r.settings?.country || '',
  };
}

export async function fetchRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching restaurants:', error);
    return [];
  }
  return (data || []).map(withVirtualFields);
}

export async function fetchRestaurant(restaurantId: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (error) throw error;
  return withVirtualFields(data);
}

export async function createRestaurant(restaurant: Partial<Restaurant>): Promise<Restaurant> {
  const id = `restaurant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const settings = {
    ...(restaurant.settings || {}),
    city: restaurant.city || '',
    country: restaurant.country || '',
  };

  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .insert({
      id,
      name: restaurant.name,
      email: restaurant.email || '',
      phone: restaurant.phone || '',
      address: restaurant.address || '',
      settings,
    })
    .select()
    .single();

  if (error) throw error;
  return withVirtualFields(data);
}

export async function updateRestaurant(id: string, restaurant: Partial<Restaurant>): Promise<Restaurant> {
  // Fetch existing settings first so we don't overwrite unrelated keys
  const { data: existing } = await supabaseAdmin
    .from('restaurants')
    .select('settings')
    .eq('id', id)
    .single();

  const settings = {
    ...(existing?.settings || {}),
    city: restaurant.city ?? existing?.settings?.city ?? '',
    country: restaurant.country ?? existing?.settings?.country ?? '',
  };

  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .update({
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      address: restaurant.address,
      settings,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return withVirtualFields(data);
}

export async function deleteRestaurant(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('restaurants')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchRestaurantPublic(restaurantId: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, email, phone, address, settings')
    .eq('id', restaurantId)
    .single();

  if (error) throw error;
  return withVirtualFields(data);
}
