import { supabase, callEdgeFn } from '../lib/supabase';
import type { Staff, StaffRole, StaffPerformance } from '../types';

function getRestaurantId(): string | undefined {
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
      return undefined;
    }
  }

  return undefined;
}

function normalizeStaff(raw: any, ratingMap?: Record<string, number | null>): Staff {
  const perf: Record<string, any> = raw.performance || {};
  const realRating = ratingMap?.[raw.id] ?? null;
  const performance: StaffPerformance = {
    ordersServed:   perf.ordersServed   ?? perf.orders_served   ?? 0,
    avgServiceTime: perf.avgServiceTime ?? perf.avg_service_time ?? 15,
    rating:         realRating,
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

  // Fetch real ratings from reviews in parallel
  const reviewsQuery = restaurantId
    ? supabase.from('reviews').select('waiter_id, rating').eq('restaurant_id', restaurantId).not('waiter_id', 'is', null)
    : Promise.resolve({ data: [] as any[], error: null });

  const [{ data, error }, { data: reviewRows }] = await Promise.all([query, reviewsQuery]);
  if (error) throw error;

  // Compute per-waiter average rating from real review data
  const ratingAgg: Record<string, { sum: number; count: number }> = {};
  (reviewRows || []).forEach((r: any) => {
    if (!r.waiter_id) return;
    if (!ratingAgg[r.waiter_id]) ratingAgg[r.waiter_id] = { sum: 0, count: 0 };
    ratingAgg[r.waiter_id].sum += r.rating;
    ratingAgg[r.waiter_id].count++;
  });
  const ratingMap: Record<string, number | null> = {};
  Object.entries(ratingAgg).forEach(([id, { sum, count }]) => {
    ratingMap[id] = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
  });

  return (data || []).map((row) => normalizeStaff(row, ratingMap));
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

export async function updateStaffStatus(id: string, isOnDuty: boolean): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ is_on_duty: isOnDuty })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function updateStaffAssignments(id: string, assignedTables: number[]): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ assigned_tables: assignedTables })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function updateStaffRole(id: string, role: StaffRole): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ role })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function deleteStaff(id: string): Promise<{ success: boolean }> {
  await callEdgeFn('admin-staff', { method: 'DELETE', params: { staff_id: id } });
  return { success: true };
}

export async function createStaff(input: {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  username: string;
  password: string;
  restaurantId?: string;
}): Promise<Staff> {
  const restaurantId = input.restaurantId || getRestaurantId();
  const raw = await callEdgeFn('admin-staff', {
    method: 'POST',
    body: { ...input, restaurantId },
  });
  return normalizeStaff(raw);
}
