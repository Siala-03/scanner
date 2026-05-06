import { supabase } from '../lib/supabase';

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
  const { data, error } = await supabase
    .from('minimart_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

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
  const { data, error } = await supabase
    .from('minimart_settings')
    .upsert(
      {
        restaurant_id:  restaurantId,
        tax_rate:       settings.taxRate       ?? 0,
        tax_label:      settings.taxLabel      ?? 'Tax',
        receipt_footer: settings.receiptFooter ?? '',
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'restaurant_id' },
    )
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}
