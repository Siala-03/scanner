import { supabase, type MenuItem } from '../lib/supabase';

function getRestaurantId(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('restaurantId') || null;
  }
  return null;
}

export async function fetchMenu(): Promise<MenuItem[]> {
  const restaurantId = getRestaurantId();
  
  // Superadmin doesn't have a restaurant - show empty or all
  if (!restaurantId) {
    return [];
  }
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching menu:', error);
    return [];
  }
  return data as MenuItem[];
}

export async function fetchMenuByCategory(category: string): Promise<MenuItem[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('category', category)
    .eq('is_available', true)
    .order('name');

  if (error) return [];
  return data as MenuItem[];
}

export async function createMenuItem(item: Partial<MenuItem>): Promise<MenuItem> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');
  
  const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      id,
      name: item.name,
      description: item.description || '',
      price: item.price || 0,
      category: item.category || 'Uncategorized',
      emoji: item.emoji || '🍽️',
      prep_time: item.prep_time || 15,
      is_available: item.is_available !== false,
      is_popular: item.is_popular || false,
      image_url: item.image_url || null,
      requires_kitchen: item.requires_kitchen || false,
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<MenuItem> {
  const { data, error } = await supabase
    .from('menu_items')
    .update({
      name: updates.name,
      description: updates.description,
      price: updates.price,
      category: updates.category,
      emoji: updates.emoji,
      prep_time: updates.prep_time,
      is_available: updates.is_available,
      is_popular: updates.is_popular,
      image_url: updates.image_url,
      requires_kitchen: updates.requires_kitchen,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleMenuItemAvailability(id: string, isAvailable: boolean): Promise<MenuItem> {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function uploadMenu(items: Partial<MenuItem>[]): Promise<{ message: string; count: number }> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');
  
  const itemsToInsert = items.map((item, index) => ({
    id: item.id || `item-${Date.now()}-${index}`,
    name: item.name,
    description: item.description || '',
    price: item.price || 0,
    category: item.category || 'Uncategorized',
    emoji: item.emoji || '🍽️',
    prep_time: item.prep_time || 15,
    is_available: item.is_available !== false,
    is_popular: item.is_popular || false,
    image_url: item.image_url || null,
    requires_kitchen: item.requires_kitchen || false,
    restaurant_id: restaurantId
  }));

  const { error } = await supabase.from('menu_items').upsert(itemsToInsert, { onConflict: 'id' });
  if (error) throw error;
  return { message: 'Menu uploaded successfully', count: items.length };
}

export async function clearMenu(): Promise<{ message: string }> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');
  
  const { error } = await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
  if (error) throw error;
  return { message: 'Menu cleared successfully' };
}

export async function fetchCategories(): Promise<string[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('category')
    .eq('restaurant_id', restaurantId);

  if (error) return [];
  return [...new Set(data.map(item => item.category))].sort();
}