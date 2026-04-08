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
    console.log('Attempting login for:', username, 'restaurant:', restaurantId || 'not specified');
    const body: any = { username, password };
    if (restaurantId) {
      body.restaurantId = restaurantId;
    }
    const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/login`, {
      method: 'POST',
      json: body
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

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest(`${API_BASE}/me/password`, {
    method: 'PUT',
    json: { currentPassword, newPassword }
  });
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
    const storedRestaurantId = localStorage.getItem('restaurantId');
    const restaurantId = input.restaurantId || storedRestaurantId || 'default_restaurant';
    console.log('Attempting signup for:', input.username, 'role:', input.role, 'restaurant:', restaurantId);
    const data = await apiRequest<{ staff: Staff }>(`${API_BASE}/signup`, {
      method: 'POST',
      json: { ...input, restaurantId }
    });
    console.log('Signup successful for user:', data.staff.name);
    return data.staff;
  } catch (error) {
    console.error('Signup failed:', error);
    throw error;
  }
}

export function logoutStaff(): void {
  // Clear authentication data from localStorage
  localStorage.removeItem('staffId');
  localStorage.removeItem('token');
  localStorage.removeItem('staffRole');
  localStorage.removeItem('restaurantId');
  console.log('User logged out successfully');
}


