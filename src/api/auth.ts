import { supabase, supabaseAdmin } from '../lib/supabase';
import type { Staff, StaffRole, StaffPerformance } from '../types';

// Map Supabase snake_case row → app camelCase Staff
function normalizeStaff(raw: Record<string, any>): Staff {
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

export async function loginStaff(
  username: string,
  password: string,
  restaurantId?: string
): Promise<Staff> {
  // Look up credentials
  let query = supabase
    .from('staff_credentials')
    .select('staff_id, password_hash, restaurant_id')
    .eq('username', username);

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data: credentials, error: credError } = await query;

  if (credError || !credentials || credentials.length === 0) {
    throw new Error('Invalid username or password');
  }

  // Pick superadmin credential first, then first match
  const cred =
    credentials.find((c: any) => c.restaurant_id === 'default_restaurant') ||
    credentials[0];

  // Verify password (plain-text compare — Supabase stores hash as-is)
  if (cred.password_hash !== password) {
    throw new Error('Invalid username or password');
  }

  // Fetch the staff record
  const { data: raw, error: staffError } = await supabase
    .from('staff')
    .select('*')
    .eq('id', cred.staff_id)
    .single();

  if (staffError || !raw) {
    throw new Error('Staff account not found');
  }

  const staff = normalizeStaff(raw);

  // Persist auth state
  localStorage.setItem('staffId',     staff.id);
  localStorage.setItem('staffRole',   staff.role);
  localStorage.setItem('restaurantId', staff.restaurantId || '');

  return staff;
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const restaurantId = localStorage.getItem('restaurantId') || undefined;
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
  const restaurantId = localStorage.getItem('restaurantId') || undefined;
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
  const restaurantId = input.restaurantId || localStorage.getItem('restaurantId') || undefined;
  const currentRole  = localStorage.getItem('staffRole');

  if (input.role === 'superadmin' && currentRole !== 'superadmin') {
    throw new Error('Only superadmin can create superadmin accounts');
  }

  const staffId = `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const { data: raw, error: staffError } = await supabase
    .from('staff')
    .insert({
      id:              staffId,
      name:            input.name,
      email:           input.email,
      phone:           input.phone,
      role:            input.role,
      is_on_duty:      true,
      assigned_tables: [],
      performance:     {},
      hire_date:       new Date().toISOString(),
      restaurant_id:   restaurantId ?? null,
    })
    .select()
    .single();

  if (staffError) {
    throw new Error(
      staffError.message.includes('duplicate')
        ? 'Email already exists'
        : staffError.message
    );
  }

  const { error: credError } = await supabase
    .from('staff_credentials')
    .insert({
      staff_id:      staffId,
      username:      input.username,
      password_hash: input.password, // stored as-is; update to hashing when ready
      restaurant_id: restaurantId ?? null,
    });

  if (credError) {
    await supabase.from('staff').delete().eq('id', staffId);
    throw new Error(
      credError.message.includes('duplicate')
        ? 'Username already taken'
        : credError.message
    );
  }

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
  await supabase.from('staff_credentials').delete().eq('staff_id', staffId);
  const { error } = await supabase.from('staff').delete().eq('id', staffId);
  if (error) throw error;
}

export function logoutStaff(): void {
  localStorage.removeItem('staffId');
  localStorage.removeItem('token');
  localStorage.removeItem('staffRole');
  localStorage.removeItem('restaurantId');
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const staffId = localStorage.getItem('staffId');
  if (!staffId) throw new Error('Not authenticated');

  const { data: credentials, error: credError } = await supabase
    .from('staff_credentials')
    .select('password_hash')
    .eq('staff_id', staffId)
    .single();

  if (credError || !credentials) throw new Error('Credentials not found');
  if (credentials.password_hash !== currentPassword) {
    throw new Error('Current password is incorrect');
  }

  const { error } = await supabase
    .from('staff_credentials')
    .update({ password_hash: newPassword })
    .eq('staff_id', staffId);

  if (error) throw error;
}
