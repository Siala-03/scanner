import { supabase, supabaseAdmin } from '../lib/supabase';
import type { Staff, StaffRole, StaffPerformance } from '../types';

function getRestaurantId(): string | undefined {
  return localStorage.getItem('restaurantId') || undefined;
}

function normalizeStaff(raw: any): Staff {
  const perf: Record<string, any> = raw.performance || {};
  const performance: StaffPerformance = {
    ordersServed:   perf.ordersServed   ?? perf.orders_served   ?? 0,
    avgServiceTime: perf.avgServiceTime ?? perf.avg_service_time ?? 15,
    rating:         perf.rating         ?? 4.5,
    totalRevenue:   perf.totalRevenue   ?? perf.total_revenue   ?? 0,
    shiftsThisWeek: perf.shiftsThisWeek ?? perf.shifts_this_week ?? 0,
  };

  return {
    id:             raw.id,
    name:           raw.name,
    role:           raw.role as StaffRole,
    email:          raw.email   || '',
    phone:          raw.phone   || '',
    restaurantId:   raw.restaurant_id || raw.restaurantId || undefined,
    isOnDuty:       raw.is_on_duty    ?? raw.isOnDuty    ?? true,
    assignedTables: raw.assigned_tables ?? raw.assignedTables ?? [],
    hireDate:       raw.hire_date ? new Date(raw.hire_date) : new Date(),
    performance,
  };
}

export async function fetchStaff(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  const role = localStorage.getItem('staffRole');

  let query = supabase.from('staff').select('*').order('name');
  if (role !== 'superadmin' && restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeStaff);
}

export async function fetchStaffById(id: string): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function fetchStaffOnDuty(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_on_duty', true)
    .order('name');
  if (error) throw error;
  return (data || []).map(normalizeStaff);
}

export async function fetchWaiters(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('role', 'waiter')
    .order('name');
  if (error) throw error;
  return (data || []).map(normalizeStaff);
}

export async function updateStaffStatus(id: string, isOnDuty: boolean): Promise<Staff> {
  const { data, error } = await supabaseAdmin
    .from('staff')
    .update({ is_on_duty: isOnDuty })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function updateStaffAssignments(id: string, assignedTables: number[]): Promise<Staff> {
  const { data, error } = await supabaseAdmin
    .from('staff')
    .update({ assigned_tables: assignedTables })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function updateStaffRole(id: string, role: StaffRole): Promise<Staff> {
  const { data, error } = await supabaseAdmin
    .from('staff')
    .update({ role })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function deleteStaff(id: string): Promise<{ success: boolean }> {
  await supabaseAdmin.from('staff_credentials').delete().eq('staff_id', id);
  const { error } = await supabaseAdmin.from('staff').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
