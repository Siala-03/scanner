import { supabase, callEdgeFn } from '../lib/supabase';
import type { IpRestrictionSettings } from '../utils/ipRestriction';

export type OutletType = 'restaurant' | 'bar' | 'minimart' | 'hotel' | 'cafe';

export interface Restaurant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  outlet_type?: OutletType;
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
  currency?: string; // e.g. 'RWF' | 'KShs' | 'UGX'
  momoCode?: string;
}

export async function fetchRestaurants(): Promise<Restaurant[]> {
  try {
    const rows = await callEdgeFn('restaurants');
    return (rows || []) as Restaurant[];
  } catch (err) {
    console.error('Error fetching restaurants:', err);
    return [];
  }
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

export async function createRestaurant(restaurant: Partial<Restaurant> & {
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
  managerUsername?: string;
  managerPassword?: string;
}): Promise<Restaurant> {
  const result = await callEdgeFn('restaurants', {
    method: 'POST',
    body: {
      name:            restaurant.name        || '',
      email:           restaurant.email       || '',
      phone:           restaurant.phone       || '',
      address:         restaurant.address     || '',
      outlet_type:     restaurant.outlet_type || 'restaurant',
      managerName:     restaurant.managerName,
      managerEmail:    restaurant.managerEmail,
      managerPhone:    restaurant.managerPhone,
      managerUsername: restaurant.managerUsername,
      managerPassword: restaurant.managerPassword,
    },
  });
  return result.restaurant;
}

export async function updateRestaurant(id: string, restaurant: Partial<Restaurant>): Promise<Restaurant> {
  return callEdgeFn('restaurants', {
    method: 'PUT',
    params: { id },
    body: {
      name:        restaurant.name,
      email:       restaurant.email,
      phone:       restaurant.phone,
      address:     restaurant.address,
      outlet_type: restaurant.outlet_type,
    },
  });
}

export async function deleteRestaurant(id: string): Promise<void> {
  await callEdgeFn('restaurants', { method: 'DELETE', params: { id } });
}

/**
 * Load receipt-customisation settings from the restaurant's settings JSONB column.
 * Returns empty object if the restaurant has no settings yet.
 */
export async function fetchReceiptSettings(restaurantId: string): Promise<RestaurantReceiptSettings> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  // Some deployed schemas may not include receipt-related columns.
  // We fetch the full row and read optional keys defensively to keep the UI usable.
  if (error) {
    return {
      logo: undefined,
      address: undefined,
      city: undefined,
      country: undefined,
      phone: undefined,
      email: undefined,
      currency: undefined,
    };
  }

  const receiptFromSettings = (data?.settings as Record<string, unknown> | undefined)?.receipt as RestaurantReceiptSettings | undefined;
  return {
    logo: receiptFromSettings?.logo || (data as any)?.logo_url || undefined,
    address: receiptFromSettings?.address || (data as any)?.address || undefined,
    city: receiptFromSettings?.city || (data as any)?.city || undefined,
    country: receiptFromSettings?.country || (data as any)?.country || undefined,
    phone: receiptFromSettings?.phone || (data as any)?.phone || undefined,
    email: receiptFromSettings?.email || (data as any)?.email || undefined,
    currency: receiptFromSettings?.currency || undefined,
    momoCode: receiptFromSettings?.momoCode || undefined,
  };
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
  // Fetch whole row (schema-safe) so we can merge settings when available.
  const { data: current } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  const existingSettings = ((current as any)?.settings as Record<string, unknown> | undefined) || {};
  const merged = { ...existingSettings, receipt: receiptSettings };

  const corePayload: Record<string, unknown> = {};
  if (restaurantName) corePayload.name = restaurantName;
  if (typeof receiptSettings.address === 'string') corePayload.address = receiptSettings.address;
  if (typeof receiptSettings.phone === 'string') corePayload.phone = receiptSettings.phone;
  if (typeof receiptSettings.email === 'string') corePayload.email = receiptSettings.email;
  if (typeof receiptSettings.city === 'string') corePayload.city = receiptSettings.city;
  if (typeof receiptSettings.country === 'string') corePayload.country = receiptSettings.country;

  // Save settings JSONB independently so momoCode/currency are never lost
  // when a combined payload fails due to column issues.
  let settingsSaved = false;
  let lastError: any = null;

  // Try settings JSONB first (contains momoCode, currency, etc.)
  const settingsAttempts = [
    { settings: merged, ...(typeof receiptSettings.logo === 'string' ? { logo_url: receiptSettings.logo } : {}) },
    { settings: merged },
  ];
  for (const payload of settingsAttempts) {
    const { error } = await supabase
      .from('restaurants')
      .update(payload)
      .eq('id', restaurantId);
    if (!error) { settingsSaved = true; break; }
    lastError = error;
  }

  // If combined JSONB failed (e.g. large logo), try without logo in JSONB
  if (!settingsSaved) {
    const receiptWithoutLogo = { ...receiptSettings, logo: undefined };
    const mergedWithoutLogo = { ...existingSettings, receipt: receiptWithoutLogo };
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: mergedWithoutLogo })
      .eq('id', restaurantId);
    if (!error) settingsSaved = true;
    else lastError = error;
  }

  // Save core columns (name, address, phone, etc.) separately
  if (Object.keys(corePayload).length > 0) {
    const logoPayload = typeof receiptSettings.logo === 'string' ? { logo_url: receiptSettings.logo } : {};
    const coreAttempts = [
      { ...corePayload, ...logoPayload },
      { ...corePayload },
    ];
    for (const payload of coreAttempts) {
      const { error } = await supabase
        .from('restaurants')
        .update(payload)
        .eq('id', restaurantId);
      if (!error) break;
      lastError = error;
    }
  }

  if (settingsSaved) return;

  // Last-resort: update fields one-by-one
  const singleFieldAttempts: Record<string, unknown>[] = [
    ...(restaurantName ? [{ name: restaurantName }] : []),
    ...(typeof receiptSettings.address === 'string' ? [{ address: receiptSettings.address }] : []),
    ...(typeof receiptSettings.phone === 'string' ? [{ phone: receiptSettings.phone }] : []),
    ...(typeof receiptSettings.email === 'string' ? [{ email: receiptSettings.email }] : []),
    ...(typeof receiptSettings.logo === 'string' ? [{ logo_url: receiptSettings.logo }] : []),
    ...(typeof receiptSettings.city === 'string' ? [{ city: receiptSettings.city }] : []),
    ...(typeof receiptSettings.country === 'string' ? [{ country: receiptSettings.country }] : []),
    { settings: merged },
  ];

  for (const payload of singleFieldAttempts) {
    const { error } = await supabase
      .from('restaurants')
      .update(payload)
      .eq('id', restaurantId);

    if (!error) return;
    lastError = error;
  }

  const hasReceiptValues = Object.values(receiptSettings).some((value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== undefined && value !== null;
  });

  if (Object.keys(corePayload).length === 0 && !hasReceiptValues) return;

  throw lastError || new Error('Failed to persist restaurant receipt settings');
}

export async function fetchIpRestriction(restaurantId: string): Promise<IpRestrictionSettings> {
  const { data } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .maybeSingle();

  const raw = (data?.settings as Record<string, unknown> | undefined)?.ip_restriction as Record<string, unknown> | undefined;
  return {
    enabled: Boolean(raw?.enabled ?? false),
    allowedIps: Array.isArray(raw?.allowed_ips) ? (raw.allowed_ips as string[]) : [],
  };
}

export async function saveIpRestriction(
  restaurantId: string,
  settings: IpRestrictionSettings,
): Promise<void> {
  const { data: current } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .maybeSingle();

  const existing = ((current as any)?.settings as Record<string, unknown>) || {};
  const merged = {
    ...existing,
    ip_restriction: {
      enabled: settings.enabled,
      allowed_ips: settings.allowedIps,
    },
  };

  const { error } = await supabase
    .from('restaurants')
    .update({ settings: merged })
    .eq('id', restaurantId);

  if (error) throw error;
}

export async function fetchRestaurantPublic(restaurantId: string): Promise<Restaurant> {
  console.log('Fetching restaurant public for ID:', restaurantId);
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, email, phone, address, outlet_type')
    .eq('id', restaurantId)
    .single();

  if (error) {
    console.error('Error fetching restaurant public:', error);
    throw error;
  }
  console.log('Restaurant found:', data);
  return data as Restaurant;
}

