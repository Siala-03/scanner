import { apiRequest } from './http';
import type { Staff } from '../types';

const API_BASE = 'https://scanner-3cku.onrender.com/api/staff';

// Fetch all staff
export async function fetchStaff(): Promise<Staff[]> {
  return apiRequest<Staff[]>(`${API_BASE}`);
}

// Fetch staff by ID
export async function fetchStaffById(id: string): Promise<Staff> {
  return apiRequest<Staff>(`${API_BASE}/${id}`);
}

// Get staff on duty
export async function fetchStaffOnDuty(): Promise<Staff[]> {
  return apiRequest<Staff[]>(`${API_BASE}/on-duty`);
}

// Get waiters only
export async function fetchWaiters(): Promise<Staff[]> {
  return apiRequest<Staff[]>(`${API_BASE}/waiters`);
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