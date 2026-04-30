import { apiRequest } from './http';
import type { Staff, StaffRole, StaffPerformance } from '../types';

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

/**
 * Login via Edge Function — credentials never leave the server.
 */
export async function loginStaff(
  username: string,
  password: string,
  restaurantId?: string
): Promise<Staff> {
  const raw = await apiRequest<any>('/auth/login', {
    method: 'POST',
    json: { username, password, restaurantId },
  });

  const staff = normalizeStaff(raw);

  localStorage.setItem('staffId',      staff.id);
  localStorage.setItem('staffRole',    staff.role);
  localStorage.setItem('restaurantId', staff.restaurantId || '');

  return staff;
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  const role         = localStorage.getItem('staffRole');

  const params = new URLSearchParams();
  if (restaurantId) params.set('restaurantId', restaurantId);
  const url = `/auth/staff${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await apiRequest<{ staff: any[] }>(url);
  return (response.staff || []).map(normalizeStaff);
}

export async function fetchStaffById(id: string): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/auth/staff/${id}`);
  return normalizeStaff(response.staff);
}

export async function fetchWaiters(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  const url = `/auth/waiters${restaurantId ? '?restaurantId=' + restaurantId : ''}`;
  const response = await apiRequest<{ staff: any[] }>(url);
  return (response.staff || []).map(normalizeStaff);
}

/**
 * Create a new staff member via Edge Function — writes to staff_credentials server-side.
 */
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
  const raw = await apiRequest<{ staff: any }>('/auth/signup', {
    method: 'POST',
    json: { ...input, restaurantId },
  });
  return normalizeStaff(raw.staff);
}

export async function updateStaffRole(staffId: string, role: string): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/auth/staff/${staffId}/role`, {
    method: 'PUT',
    json: { role },
  });
  return normalizeStaff(response.staff);
}

export async function updateStaffDuty(staffId: string, isOnDuty: boolean): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/auth/staff/${staffId}/status`, {
    method: 'PUT',
    json: { isOnDuty },
  });
  return normalizeStaff(response.staff);
}

/**
 * Delete a staff member via backend API
 */
export async function deleteStaff(staffId: string): Promise<void> {
  await apiRequest(`/auth/staff/${staffId}`, { method: 'DELETE' });
}

export function logoutStaff(): void {
  localStorage.removeItem('staffId');
  localStorage.removeItem('token');
  localStorage.removeItem('staffRole');
  localStorage.removeItem('restaurantId');
}

/**
 * Change password via Edge Function — current password verified server-side.
 */
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
