import { supabase, supabaseAdmin } from '../lib/supabase';

export interface Restaurant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
  // Optional extras — populated from form but not all tables have them
  city?: string;
  country?: string;
  managerCount?: number;
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
  return (data || []) as Restaurant[];
}

export async function fetchRestaurant(restaurantId: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (error) throw error;
  return data as Restaurant;
}

export async function createRestaurant(restaurant: Partial<Restaurant>): Promise<Restaurant> {
  const id = `restaurant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .insert({
      id,
      name:    restaurant.name    || '',
      email:   restaurant.email   || '',
      phone:   restaurant.phone   || '',
      address: restaurant.address || '',
    })
    .select()
    .single();

  if (error) throw error;
  return data as Restaurant;
}

export async function updateRestaurant(id: string, restaurant: Partial<Restaurant>): Promise<Restaurant> {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .update({
      name:    restaurant.name,
      email:   restaurant.email,
      phone:   restaurant.phone,
      address: restaurant.address,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Restaurant;
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
    .select('id, name, email, phone, address')
    .eq('id', restaurantId)
    .single();

  if (error) throw error;
  return data as Restaurant;
}
