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
  logo_url?: string;
  managerCount?: number;
  settings?: Record<string, unknown>;
}

/** Receipt-header settings stored in restaurants.settings.receipt */
export interface RestaurantReceiptSettings {
  logo?: string;    // base64 data URL
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
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

/**
 * Load receipt-customisation settings from the restaurant's settings JSONB column.
 * Returns empty object if the restaurant has no settings yet.
 */
export async function fetchReceiptSettings(restaurantId: string): Promise<RestaurantReceiptSettings> {
  const { data } = await supabaseAdmin
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .single();

  if (!data?.settings) return {};
  return ((data.settings as Record<string, unknown>).receipt as RestaurantReceiptSettings) || {};
}

/**
 * Persist receipt-customisation settings into restaurants.settings.receipt.
 * Also updates the main name / phone / email / address columns when provided.
 */
export async function saveReceiptSettings(
  restaurantId: string,
  receiptSettings: RestaurantReceiptSettings,
  restaurantName?: string,
): Promise<void> {
  // Fetch current settings so we don't overwrite unrelated keys
  const { data: current } = await supabaseAdmin
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .single();

  const existingSettings = (current?.settings as Record<string, unknown>) || {};
  const merged = { ...existingSettings, receipt: receiptSettings };

  // Build the update payload — always update the settings blob
  const payload: Record<string, unknown> = { settings: merged };
  if (restaurantName) payload.name = restaurantName;

  // Try a full update (including main columns that may or may not exist)
  let { error } = await supabaseAdmin
    .from('restaurants')
    .update(payload)
    .eq('id', restaurantId);

  if (error) {
    // Fallback: settings-only update
    const { error: fallbackError } = await supabaseAdmin
      .from('restaurants')
      .update({ settings: merged })
      .eq('id', restaurantId);
    if (fallbackError) throw fallbackError;
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
