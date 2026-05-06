import { supabase } from '../lib/supabase';

const SHIFT_SELECT_CANDIDATES = [
  'id, restaurant_id, cashier_id, cashier_name, opened_at, closed_at, opening_float, closing_float, expected_cash, cash_variance, total_sales, total_transactions, status, notes',
  'id, restaurant_id, cashier_id, opened_at, closed_at, opening_float, closing_float, expected_cash, cash_variance, total_sales, total_transactions, status, notes',
  'id, restaurant_id, cashier_id, opened_at, closed_at, opening_float, closing_float, expected_cash, cash_variance, total_sales, total_transactions, status',
  'id, restaurant_id, cashier_id, opened_at, closed_at, opening_float, closing_float, total_sales, total_transactions, status',
  '*',
];

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST204' || (message.includes('column') && message.includes('does not exist'));
}

async function selectSingleShift(
  build: (selectCols: string) => ReturnType<typeof supabase.from>
): Promise<any> {
  let lastError: any = null;

  for (const selectCols of SHIFT_SELECT_CANDIDATES) {
    const query = build(selectCols) as any;
    const { data, error } = await query;
    if (!error) return data;
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  throw lastError;
}

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
  try {
    const data = await selectSingleShift((selectCols) =>
      supabase
        .from('cashier_shifts')
        .select(selectCols)
        .eq('restaurant_id', restaurantId)
        .eq('cashier_id', cashierId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    return data ? normalize(data) : null;
  } catch (error: any) {
    console.warn('[shifts] getActiveShift:', error.message);
    return null;
  }
}

export async function openShift(params: {
  restaurantId: string;
  cashierId: string;
  cashierName: string;
  openingFloat: number;
}): Promise<CashierShift> {
  const roundedFloat = Math.round(params.openingFloat * 100) / 100;
  const payloads = [
    {
      restaurant_id: params.restaurantId,
      cashier_id: params.cashierId,
      cashier_name: params.cashierName,
      opening_float: roundedFloat,
      status: 'open',
    },
    {
      restaurant_id: params.restaurantId,
      cashier_id: params.cashierId,
      opening_float: roundedFloat,
      status: 'open',
    },
    {
      restaurant_id: params.restaurantId,
      cashier_id: params.cashierId,
      opening_float: roundedFloat,
    },
  ];

  let lastError: any = null;
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from('cashier_shifts')
      .insert(payload)
      .select()
      .single();

    if (!error) return normalize(data);
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  throw lastError;
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

  const payloads = [
    {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closing_float: Math.round(params.closingFloat * 100) / 100,
      expected_cash: Math.round(params.expectedCash * 100) / 100,
      cash_variance: cashVariance,
      total_sales: Math.round(params.totalSales * 100) / 100,
      total_transactions: params.totalTransactions,
      notes: params.notes ?? null,
    },
    {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closing_float: Math.round(params.closingFloat * 100) / 100,
      expected_cash: Math.round(params.expectedCash * 100) / 100,
      cash_variance: cashVariance,
      total_sales: Math.round(params.totalSales * 100) / 100,
      total_transactions: params.totalTransactions,
    },
    {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closing_float: Math.round(params.closingFloat * 100) / 100,
      total_sales: Math.round(params.totalSales * 100) / 100,
      total_transactions: params.totalTransactions,
    },
  ];

  let lastError: any = null;
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from('cashier_shifts')
      .update(payload)
      .eq('id', shiftId)
      .select()
      .single();

    if (!error) return normalize(data);
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  throw lastError;
}
