import { supabase } from '../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidTypeError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('invalid input syntax for type uuid');
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function resolveUuidRestaurantId(fallback: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const payload = token ? decodeJwtPayload(token) : null;
  const claim = payload?.restaurant_id;
  if (typeof claim === 'string' && UUID_RE.test(claim)) return claim;
  if (UUID_RE.test(fallback)) return fallback;
  return null;
}

export interface MinimartSettings {
  restaurantId:  string;
  taxRate:       number;
  taxLabel:      string;
  receiptFooter: string;
  updatedAt:     string;
}

function normalize(raw: any): MinimartSettings {
  return {
    restaurantId:  raw.restaurant_id  ?? raw.restaurantId  ?? '',
    taxRate:       Number(raw.tax_rate ?? raw.taxRate ?? 0),
    taxLabel:      raw.tax_label      ?? raw.taxLabel      ?? 'Tax',
    receiptFooter: raw.receipt_footer ?? raw.receiptFooter ?? '',
    updatedAt:     raw.updated_at     ?? raw.updatedAt     ?? new Date().toISOString(),
  };
}

export async function getMinimartSettings(restaurantId: string): Promise<MinimartSettings> {
  let { data, error } = await supabase
    .from('minimart_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error && isUuidTypeError(error)) {
    const uuidRestaurantId = await resolveUuidRestaurantId(restaurantId);
    if (uuidRestaurantId) {
      const retry = await supabase
        .from('minimart_settings')
        .select('*')
        .eq('restaurant_id', uuidRestaurantId)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) throw error;
  if (!data) {
    return { restaurantId, taxRate: 0, taxLabel: 'Tax', receiptFooter: '', updatedAt: new Date().toISOString() };
  }
  return normalize(data);
}

export async function upsertMinimartSettings(
  restaurantId: string,
  settings: Partial<Pick<MinimartSettings, 'taxRate' | 'taxLabel' | 'receiptFooter'>>,
): Promise<MinimartSettings> {
  let effectiveRestaurantId = restaurantId;
  let { data, error } = await supabase
    .from('minimart_settings')
    .upsert(
      {
        restaurant_id:  effectiveRestaurantId,
        tax_rate:       settings.taxRate       ?? 0,
        tax_label:      settings.taxLabel      ?? 'Tax',
        receipt_footer: settings.receiptFooter ?? '',
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'restaurant_id' },
    )
    .select()
    .single();

  if (error && isUuidTypeError(error)) {
    const uuidRestaurantId = await resolveUuidRestaurantId(restaurantId);
    if (!uuidRestaurantId) {
      throw new Error('Settings update failed: this environment expects a UUID restaurant_id, but your current restaurant ID is not UUID.');
    }

    effectiveRestaurantId = uuidRestaurantId;
    const retry = await supabase
      .from('minimart_settings')
      .upsert(
        {
          restaurant_id:  effectiveRestaurantId,
          tax_rate:       settings.taxRate       ?? 0,
          tax_label:      settings.taxLabel      ?? 'Tax',
          receipt_footer: settings.receiptFooter ?? '',
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'restaurant_id' },
      )
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return normalize(data);
}
