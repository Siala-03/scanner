import { apiRequest } from './http';
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

  const params = new URLSearchParams();
  if (restaurantId) params.set('restaurantId', restaurantId);
  const url = `/api/auth/staff${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await apiRequest<{ staff: any[] }>(url);
  return (response.staff || []).map(normalizeStaff);
}

export async function fetchStaffById(id: string): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/api/auth/staff/${id}`);
  return normalizeStaff(response.staff);
}

export async function fetchWaiters(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  const url = `/api/auth/waiters${restaurantId ? '?restaurantId=' + restaurantId : ''}`;
  const response = await apiRequest<{ staff: any[] }>(url);
  return (response.staff || []).map(normalizeStaff);
}

export async function fetchStaffOnDuty(): Promise<Staff[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const params = new URLSearchParams({ restaurantId });
  const response = await apiRequest<{ staff: any[] }>(`/api/auth/staff/on-duty?${params.toString()}`);
  return (response.staff || []).map(normalizeStaff);
}

export async function updateStaffStatus(id: string, isOnDuty: boolean): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/api/auth/staff/${id}/status`, {
    method: 'PUT',
    json: { isOnDuty },
  });
  return normalizeStaff(response.staff);
}

export async function updateStaffAssignments(id: string, assignedTables: number[]): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/api/auth/staff/${id}/assignments`, {
    method: 'PUT',
    json: { assignedTables },
  });
  return normalizeStaff(response.staff);
}

export async function updateStaffRole(id: string, role: StaffRole): Promise<Staff> {
  const response = await apiRequest<{ staff: any }>(`/api/auth/staff/${id}/role`, {
    method: 'PUT',
    json: { role },
  });
  return normalizeStaff(response.staff);
}

export async function deleteStaff(id: string): Promise<{ success: boolean }> {
  await apiRequest(`/api/auth/staff/${id}`, { method: 'DELETE' });
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
  const response = await apiRequest<{ staff: any }>('/api/auth/signup', {
    method: 'POST',
    json: { ...input, restaurantId },
  });
  return normalizeStaff(response.staff);
}