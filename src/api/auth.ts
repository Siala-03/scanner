import { apiRequest } from './http';
import type { Staff, StaffRole } from '../types';

// Use relative API path so local dev proxy and production base both work.
const API_BASE = '/api/auth';

export async function loginStaff(
  username: string,
  password: string,
  restaurantId?: string
): Promise<Staff> {
  try {
    console.log('Attempting login for:', username, 'restaurant:', restaurantId || 'default_restaurant');
    const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/login`, {
      method: 'POST',
      json: { username, password, restaurantId: restaurantId || 'default_restaurant' }
    });
    console.log('Login successful for user:', data.staff.name);
    return data.staff;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
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
  restaurantId?: string;
}): Promise<Staff> {
  try {
    console.log('Attempting signup for:', input.username, 'role:', input.role);
    const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/signup`, {
      method: 'POST',
      json: { ...input, restaurantId: input.restaurantId || 'default_restaurant' }
    });
    console.log('Signup successful for user:', data.staff.name);
    return data.staff;
  } catch (error) {
    console.error('Signup failed:', error);
    throw error;
  }
}


