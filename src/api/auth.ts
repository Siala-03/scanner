import { apiRequest } from './http';
import type { Staff, StaffRole } from '../types';

const API_BASE = '/api/auth';

export async function loginStaff(
  username: string,
  password: string
): Promise<Staff> {
  const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/login`, {
    method: 'POST',
    json: { username, password }
  });
  return data.staff;
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const data = await apiRequest<{ staff: Staff[] }>(`${API_BASE}/staff`);
  return data.staff;
}

export async function fetchStaffById(id: string): Promise<Staff> {
  const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/staff/${id}`);
  return data.staff;
}

export async function fetchWaiters(): Promise<Staff[]> {
  const data = await apiRequest<{ staff: Staff[] }>(`${API_BASE}/waiters`);
  return data.staff;
}

export async function signUpStaff(input: {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  username: string;
  password: string;
}): Promise<Staff> {
  const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/signup`, {
    method: 'POST',
    json: input
  });
  return data.staff;
}
