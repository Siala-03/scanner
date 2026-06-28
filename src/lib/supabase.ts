import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
});

// Clean up stale Supabase Auth sessions from before this fix.
// Previous versions called setSession() with an unrefreshable JWT that
// caused 401s on every request once it expired.
if (typeof window !== 'undefined' && supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).hostname.split('.')[0];
    localStorage.removeItem(`sb-${host}-auth-token`);
  } catch { /* ignore */ }
}

// Base URL for Supabase Edge Functions (service key lives server-side in each function)
const edgeFunctionsBase = `${supabaseUrl}/functions/v1`;

/**
 * Call a Supabase Edge Function. Automatically attaches the anon key and,
 * when available, the current staff ID for server-side identity verification.
 */
export async function callEdgeFn(
  fnName: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    params?: Record<string, string>;
    includeStaffHeader?: boolean;
  } = {}
): Promise<any> {
  const url = new URL(`${edgeFunctionsBase}/${fnName}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const staffId =
    typeof window !== 'undefined' ? localStorage.getItem('staffId') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
  if (options.includeStaffHeader !== false && staffId) {
    headers['x-staff-id'] = staffId;
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Edge function ${fnName} failed`);
  }

  return res.json();
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  is_on_duty: boolean;
  assigned_tables: number[];
  performance: Record<string, unknown>;
  hire_date: string;
  restaurant_id: string;
}

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface MenuItem {
  id: string;
  sku?: string | null;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  is_available: boolean;
  preparation_time: number;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  table_number: number;
  status: string;
  total: number;
  items: OrderItem[];
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  notes: string | null;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  status: string;
  prepared_by: string | null;
}

export interface InventoryRecord {
  id: string;
  menu_item_id: string;
  stock: number;
  low_stock_threshold: number;
  reorder_point: number;
  reorder_qty: number;
  unit_cost: number;
  supplier_id: string | null;
  location: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  categories: string[];
  lead_time_days: number;
  payment_terms: string;
  rating: number;
  is_active: boolean;
  notes: string;
  restaurant_id: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  total_points: number;
  visit_count: number;
  restaurant_id: string;
  created_at: string;
}
