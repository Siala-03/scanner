import { supabase, callEdgeFn, type MenuItem } from '../lib/supabase';

let menuSkuColumnSupported: boolean | null = null;

const missingColPattern = /Could not find the '([^']+)' column of 'menu_items'/i;
const pgMissingColPattern = /column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?menu_items"?\s+does\s+not\s+exist/i;

function isMissingColumnError(error: any, column: string): boolean {
  const msg = String(error?.message || '').toLowerCase();
  const col = column.toLowerCase();
  return (
    msg.includes(`could not find the '${col}' column`) ||
    (msg.includes('column') && msg.includes(col) && msg.includes('does not exist')) ||
    (msg.includes('schema cache') && msg.includes(col))
  );
}

async function supportsMenuSkuColumn(): Promise<boolean> {
  if (menuSkuColumnSupported !== null) return menuSkuColumnSupported;

  const { error } = await supabase
    .from('menu_items')
    .select('sku')
    .limit(1);

  if (!error) {
    menuSkuColumnSupported = true;
    return true;
  }

  if (isMissingColumnError(error, 'sku')) {
    menuSkuColumnSupported = false;
    return false;
  }

  throw error;
}

export function generateSku(name: string, sequence: number): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
    .padEnd(2, 'X');
  return prefix + String(sequence).padStart(2, '0');
}

function toDbMenuItem(item: Partial<MenuItem> & Record<string, any>, restaurantId: string, fallbackId?: string) {
  const payload: Record<string, any> = {
    id: item.id || fallbackId,
    name: item.name,
    description: item.description || '',
    price: item.price || 0,
    category: item.category || 'Uncategorized',
    emoji: item.emoji || '🍽️',
    prep_time: item.prep_time ?? item.prepTime ?? 15,
    is_available: item.is_available ?? item.isAvailable ?? true,
    is_popular: item.is_popular ?? item.isPopular ?? false,
    image_url: item.image_url ?? item.imageUrl ?? null,
    requires_kitchen: item.requires_kitchen ?? item.requiresKitchen ?? false,
    restaurant_id: restaurantId,
  };
  if (item.sku !== undefined) payload.sku = item.sku || null;
  return payload;
}

function getRestaurantId(): string | null {
  if (typeof window === 'undefined') return null;

  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (authUserRaw) {
    try {
      const authUser = JSON.parse(authUserRaw);
      const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
      if (typeof fallbackId === 'string' && fallbackId.trim()) {
        localStorage.setItem('restaurantId', fallbackId);
        return fallbackId;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function resolveRestaurantId(): string | null {
  return getRestaurantId();
}

export async function fetchMenu(): Promise<MenuItem[]> {
  const restaurantId = await resolveRestaurantId();
  
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
  return (data ?? []) as MenuItem[];
}

export async function fetchMenuByCategory(category: string): Promise<MenuItem[]> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('category', category)
    .eq('is_available', true)
    .order('name');

  if (error) return [];
  return (data ?? []) as MenuItem[];
}

export async function createMenuItem(item: Partial<MenuItem> & { sku?: string }): Promise<MenuItem> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const canUseSku = await supportsMenuSkuColumn();

  // Auto-generate SKU if not provided
  let sku = canUseSku ? (item.sku?.trim() || null) : null;
  if (canUseSku && !sku && item.name) {
    const { count } = await supabase
      .from('menu_items')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId);
    sku = generateSku(item.name, (count ?? 0) + 1);
    // Ensure uniqueness — if collision, regenerate with UUID suffix
    const { data: existing, error: skuCheckError } = await supabase
      .from('menu_items')
      .select('sku')
      .eq('restaurant_id', restaurantId)
      .eq('sku', sku)
      .maybeSingle();

    if (!skuCheckError) {
      if (existing) {
        sku = `${sku}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      }
    } else if (isMissingColumnError(skuCheckError, 'sku')) {
      sku = null;
    } else {
      throw skuCheckError;
    }
  }

  const buildPayload = (withSku: boolean) => {
    // Strip sku from the original item so toDbMenuItem never re-adds it when withSku=false.
    const { sku: _dropSku, ...baseItem } = item as any;
    return toDbMenuItem(
      withSku ? { ...baseItem, sku } : baseItem,
      restaurantId,
      id,
    );
  };

  let payload = buildPayload(canUseSku);

  // Retry loop: strip any columns that don't exist in this deployment's schema.
  // Handles emoji, is_popular, prep_time, requires_kitchen, image_url, etc.
  let res = await supabase.from('menu_items').insert(payload).select().single();

  for (let attempt = 0; attempt < 10 && res.error; attempt++) {
    const msg = String(res.error?.message || '');
    const col = msg.match(missingColPattern)?.[1] ?? msg.match(pgMissingColPattern)?.[1];

    if (col === 'sku') {
      menuSkuColumnSupported = false;
      payload = buildPayload(false);
    } else if (col && col in payload) {
      delete payload[col];
    } else {
      break; // unknown error — stop retrying
    }

    res = await supabase.from('menu_items').insert(payload).select().single();
  }

  if (res.error) throw res.error;
  return res.data as MenuItem;
}

export async function updateMenuItem(id: string, updates: Partial<MenuItem> & { sku?: string }): Promise<MenuItem> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');
  const canUseSku = await supportsMenuSkuColumn();

  // Capture old price before update for audit trail
  const hasNewPrice = updates.price !== undefined;
  let oldPrice: number | null = null;
  if (hasNewPrice) {
    const { data: current } = await supabase
      .from('menu_items')
      .select('price')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    oldPrice = current?.price ?? null;
  }

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name           !== undefined) payload.name            = updates.name;
  if (updates.description    !== undefined) payload.description     = updates.description;
  if (updates.price          !== undefined) payload.price           = updates.price;
  if (updates.category       !== undefined) payload.category        = updates.category;
  if ((updates as any).emoji !== undefined) payload.emoji           = (updates as any).emoji;
  if (updates.is_available   !== undefined) payload.is_available    = updates.is_available;
  if ((updates as any).isAvailable !== undefined) payload.is_available = (updates as any).isAvailable;
  if (updates.is_popular     !== undefined) payload.is_popular      = updates.is_popular;
  if ((updates as any).isPopular !== undefined) payload.is_popular  = (updates as any).isPopular;
  if (updates.image_url      !== undefined) payload.image_url       = updates.image_url;
  if ((updates as any).imageUrl !== undefined) payload.image_url    = (updates as any).imageUrl;
  if (updates.requires_kitchen !== undefined) payload.requires_kitchen = updates.requires_kitchen;
  if ((updates as any).requiresKitchen !== undefined) payload.requires_kitchen = (updates as any).requiresKitchen;
  if ((updates as any).prep_time !== undefined) payload.prep_time   = (updates as any).prep_time;
  if ((updates as any).prepTime  !== undefined) payload.prep_time   = (updates as any).prepTime;
  if (updates.sku !== undefined && canUseSku) payload.sku = updates.sku?.trim() || null;

  let res = await supabase
    .from('menu_items')
    .update(payload)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  for (let attempt = 0; attempt < 10 && res.error; attempt++) {
    const msg = String(res.error?.message || '');
    const col = msg.match(missingColPattern)?.[1] ?? msg.match(pgMissingColPattern)?.[1];

    if (col === 'sku') menuSkuColumnSupported = false;
    if (col && col in payload) {
      delete payload[col];
    } else {
      break;
    }

    res = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();
  }

  if (res.error) throw res.error;

  // Log price change for audit trail
  if (hasNewPrice && oldPrice !== null && oldPrice !== updates.price) {
    const staffId = typeof window !== 'undefined' ? localStorage.getItem('staffId') : null;
    await supabase.from('stock_movements').insert({
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      menu_item_id: id,
      menu_item_name: res.data?.name || id,
      type: 'adjustment',
      qty: 0,
      stock_before: 0,
      balance_after: 0,
      performed_by: staffId || 'system',
      notes: `PRICE_CHANGE|old=${oldPrice}|new=${updates.price}`,
      restaurant_id: restaurantId,
    }).then(null, (err: any) => console.warn('[updateMenuItem] Price audit log failed:', err));
  }

  return res.data as MenuItem;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId);

  if (!error) return;

  // Compatibility fallback for older deployments that route deletes via edge functions.
  try {
    await callEdgeFn(`inventory/menu-items/${id}`, { method: 'DELETE' });
    return;
  } catch {
    throw error;
  }
}

export async function toggleMenuItemAvailability(id: string, isAvailable: boolean): Promise<MenuItem> {
  const restaurantId = getRestaurantId();
  let query = supabase
    .from('menu_items')
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as MenuItem;
}

export async function uploadMenu(items: Partial<MenuItem>[]): Promise<{ message: string; count: number }> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');
  const canUseSku = await supportsMenuSkuColumn();

  const itemsToInsert = items.map((item, index) => {
    const normalized = canUseSku ? item : ({ ...item, sku: undefined } as Partial<MenuItem>);
    return toDbMenuItem(normalized as Partial<MenuItem> & Record<string, any>, restaurantId, item.id || `item-${Date.now()}-${index}`);
  });

  // Process in batches of 50 to avoid partial failures on large imports
  const BATCH_SIZE = 50;
  let successCount = 0;
  for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
    const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('menu_items').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Import failed at item ${i + 1}: ${error.message}. ${successCount} items saved successfully.`);
    successCount += batch.length;
  }

  return { message: 'Menu uploaded successfully', count: successCount };
}

export async function clearMenu(): Promise<{ message: string }> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  // Get menu item IDs before deletion so we can clean up inventory
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id')
    .eq('restaurant_id', restaurantId);

  const { error } = await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
  if (error) throw error;

  // Clean up orphaned inventory records
  if (menuItems && menuItems.length > 0) {
    const ids = menuItems.map((m: any) => m.id);
    await supabase
      .from('inventory_records')
      .delete()
      .eq('restaurant_id', restaurantId)
      .in('menu_item_id', ids)
      .then(null, (err: any) => console.warn('[clearMenu] Inventory cleanup failed:', err));
  }

  return { message: 'Menu cleared successfully' };
}

export async function fetchCategories(): Promise<string[]> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('category')
    .eq('restaurant_id', restaurantId);

  if (error) return [];
  return [...new Set((data ?? []).map(item => item.category))].sort();
}