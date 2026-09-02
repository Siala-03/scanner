import { supabase, callEdgeFn } from '../lib/supabase';
import type { Staff, StaffRole, StaffPerformance } from '../types';

function normalizeStaff(raw: Record<string, any>): Staff {
  const perf: Record<string, any> = raw.performance || {};
  const performance: StaffPerformance = {
    ordersServed:   perf.ordersServed   ?? perf.orders_served   ?? 0,
    avgServiceTime: perf.avgServiceTime ?? perf.avg_service_time ?? 15,
    rating:         perf.rating         ?? null,
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

export async function loginStaff(
  username: string,
  password: string,
  restaurantId?: string
): Promise<Staff> {
  // Do NOT fall back to localStorage restaurantId here. A stale value from a previous
  // session causes the edge function to filter staff_credentials by the wrong restaurant,
  // returning 401 for any staff who belong to a different outlet. Only use an explicit
  // restaurantId when it comes from a QR-code URL param passed by the caller.

  // Clear stale session state before attempting a new login.
  localStorage.removeItem('staffId');
  localStorage.removeItem('staffRole');
  localStorage.removeItem('token');
  localStorage.removeItem('authUser');
  localStorage.removeItem('restaurantId');

  const raw = await callEdgeFn('staff-login', {
    method: 'POST',
    body: { action: 'login', username, password, restaurantId: restaurantId ?? '' },
    includeStaffHeader: false,
  });

  const staff = normalizeStaff(raw);

  localStorage.setItem('staffId',   staff.id);
  localStorage.setItem('staffRole', staff.role);
  if (staff.restaurantId) {
    localStorage.setItem('restaurantId', staff.restaurantId);
  }

  if (raw.token) {
    localStorage.setItem('token', raw.token);
    // Do NOT call supabase.auth.setSession() — this app uses custom staff auth,
    // not Supabase Auth. RLS policies grant full access to the anon role.
    // Setting a session with no refresh token causes every request to 401
    // once the JWT expires (~1 hour), breaking all order operations.
  }

  return staff;
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  const role         = localStorage.getItem('staffRole');

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

export async function fetchWaiters(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('role', 'waiter')
    .eq('restaurant_id', restaurantId)
    .order('name');
  if (error) throw error;
  return (data || []).map(normalizeStaff);
}

export async function signUpStaff(input: {
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

export async function updateStaffRole(staffId: string, role: string): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ role })
    .eq('id', staffId)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function updateStaffDuty(staffId: string, isOnDuty: boolean): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ is_on_duty: isOnDuty })
    .eq('id', staffId)
    .select()
    .single();
  if (error) throw error;
  return normalizeStaff(data);
}

export async function deleteStaff(staffId: string): Promise<void> {
  await callEdgeFn('admin-staff', {
    method: 'DELETE',
    params: { staff_id: staffId },
  });
}

export function logoutStaff(): void {
  localStorage.removeItem('staffId');
  localStorage.removeItem('token');
  localStorage.removeItem('staffRole');
  localStorage.removeItem('restaurantId');
  localStorage.removeItem('authUser');
  localStorage.removeItem('selectedRole');
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const staffId = localStorage.getItem('staffId');
  if (!staffId) throw new Error('Not authenticated');

  await callEdgeFn('staff-login', {
    method: 'POST',
    body: { action: 'change-password', staffId, currentPassword, newPassword },
  });
}
