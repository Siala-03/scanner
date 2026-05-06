import { supabase } from '../lib/supabase';

export interface CashierShift {
  id: string;
  restaurantId: string;
  cashierId?: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string | null;
  openingFloat: number;
  closingFloat?: number | null;
  expectedCash?: number | null;
  cashVariance?: number | null;
  totalSales?: number | null;
  totalTransactions?: number | null;
  status: 'open' | 'closed';
  notes?: string | null;
}

function normalize(raw: any): CashierShift {
  return {
    id:                raw.id,
    restaurantId:      raw.restaurant_id,
    cashierId:         raw.cashier_id ?? undefined,
    cashierName:       raw.cashier_name ?? '',
    openedAt:          raw.opened_at,
    closedAt:          raw.closed_at ?? null,
    openingFloat:      Number(raw.opening_float ?? 0),
    closingFloat:      raw.closing_float != null ? Number(raw.closing_float) : null,
    expectedCash:      raw.expected_cash != null ? Number(raw.expected_cash) : null,
    cashVariance:      raw.cash_variance != null ? Number(raw.cash_variance) : null,
    totalSales:        raw.total_sales != null ? Number(raw.total_sales) : null,
    totalTransactions: raw.total_transactions != null ? Number(raw.total_transactions) : null,
    status:            raw.status ?? 'open',
    notes:             raw.notes ?? null,
  };
}

export async function getActiveShift(
  restaurantId: string,
  cashierId: string
): Promise<CashierShift | null> {
  const { data, error } = await supabase
    .from('cashier_shifts')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('cashier_id', cashierId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[shifts] getActiveShift:', error.message);
    return null;
  }
  return data ? normalize(data) : null;
}

export async function openShift(params: {
  restaurantId: string;
  cashierId: string;
  cashierName: string;
  openingFloat: number;
}): Promise<CashierShift> {
  const { data, error } = await supabase
    .from('cashier_shifts')
    .insert({
      restaurant_id: params.restaurantId,
      cashier_id:    params.cashierId,
      cashier_name:  params.cashierName,
      opening_float: Math.round(params.openingFloat * 100) / 100,
      status:        'open',
    })
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}

export async function closeShift(
  shiftId: string,
  params: {
    closingFloat: number;
    expectedCash: number;
    totalSales: number;
    totalTransactions: number;
    notes?: string;
  }
): Promise<CashierShift> {
  const cashVariance =
    Math.round((params.closingFloat - params.expectedCash) * 100) / 100;

  const { data, error } = await supabase
    .from('cashier_shifts')
    .update({
      status:             'closed',
      closed_at:          new Date().toISOString(),
      closing_float:      Math.round(params.closingFloat * 100) / 100,
      expected_cash:      Math.round(params.expectedCash * 100) / 100,
      cash_variance:      cashVariance,
      total_sales:        Math.round(params.totalSales * 100) / 100,
      total_transactions: params.totalTransactions,
      notes:              params.notes ?? null,
    })
    .eq('id', shiftId)
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}
