import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';

// Standard client — uses anon key, subject to RLS
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — uses service role key, bypasses RLS entirely.
// Only used for superadmin write operations (create/update/delete restaurants and staff).
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase; // fallback to anon if key not set

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