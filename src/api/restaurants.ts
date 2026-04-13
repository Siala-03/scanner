import { supabase, supabaseAdmin } from '../lib/supabase';

export interface Restaurant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_at?: string;
  city?: string;
  country?: string;
  managerCount?: number;
}

export async function fetchRestaurants(): Promise<Restaurant[]> {
  console.log('Fetching all restaurants');
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching restaurants:', error);
    return [];
  }
  console.log('Restaurants fetched:', data);
  return (data || []) as Restaurant[];
}

export async function fetchRestaurant(restaurantId: string): Promise<Restaurant> {
  console.log('Fetching restaurant:', restaurantId);
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (error) {
    console.error('Error fetching restaurant:', error);
    throw error;
  }
  console.log('Restaurant fetched:', data);
  return data as Restaurant;
}

export async function createRestaurant(restaurant: Partial<Restaurant>): Promise<Restaurant> {
  console.log('Creating restaurant:', restaurant);
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

  if (error) {
    console.error('Error creating restaurant:', error);
    throw error;
  }
  console.log('Restaurant created:', data);
  return data as Restaurant;
}

export async function updateRestaurant(id: string, restaurant: Partial<Restaurant>): Promise<Restaurant> {
  console.log('Updating restaurant:', id, restaurant);
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

  if (error) {
    console.error('Error updating restaurant:', error);
    throw error;
  }
  return data as Restaurant;
}

export async function deleteRestaurant(id: string): Promise<void> {
  console.log('Deleting restaurant:', id);
  const { error } = await supabaseAdmin
    .from('restaurants')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting restaurant:', error);
    throw error;
  }
}

export async function fetchRestaurantPublic(restaurantId: string): Promise<Restaurant> {
  console.log('Fetching restaurant public for ID:', restaurantId);
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, email, phone, address')
    .eq('id', restaurantId)
    .single();

  if (error) {
    console.error('Error fetching restaurant public:', error);
    throw error;
  }
  console.log('Restaurant found:', data);
  return data as Restaurant;
}
