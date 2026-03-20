import { apiRequest } from './http';
import type { Staff } from '../types';

const API_BASE = '/api/auth/staff';

// Fetch all staff
export async function fetchStaff(): Promise<Staff[]> {
  const data = await apiRequest<{ staff: Staff[] }>(`${API_BASE}`);
  return data.staff;
}

// Fetch staff by ID
export async function fetchStaffById(id: string): Promise<Staff> {
  const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/${id}`);
  return data.staff;
}

// Get staff on duty
export async function fetchStaffOnDuty(): Promise<Staff[]> {
  const data = await apiRequest<{ staff: Staff[] }>(`${API_BASE}/on-duty`);
  return data.staff;
}

// Get waiters only
export async function fetchWaiters(): Promise<Staff[]> {
  const data = await apiRequest<{ staff: Staff[] }>(`${API_BASE}/waiters`);
  return data.staff;
}

// Update staff status
export async function updateStaffStatus(id: string, isOnDuty: boolean): Promise<Staff> {
  return apiRequest<Staff>(`${API_BASE}/${id}/status`, {
    method: 'PUT',
    json: { isOnDuty }
  });
}

// Update staff assignments
export async function updateStaffAssignments(id: string, assignedTables: number[]): Promise<Staff> {
  return apiRequest<Staff>(`${API_BASE}/${id}/assignments`, {
    method: 'PUT',
    json: { assignedTables }
  });
}