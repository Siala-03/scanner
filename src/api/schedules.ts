import { apiRequest } from './http';
import { StaffSchedule } from '../types';

export async function getSchedules(
  restaurantId: string,
  startDate: string,
  endDate: string
): Promise<StaffSchedule[]> {
  const params = new URLSearchParams({ restaurantId, startDate, endDate });
  return apiRequest(`/schedules?${params}`);
}

export async function createSchedule(data: {
  restaurantId: string;
  staffId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  role?: string;
  notes?: string;
}): Promise<StaffSchedule> {
  return apiRequest('/schedules', { method: 'POST', json: data });
}

export async function updateSchedule(
  id: string,
  data: { startTime?: string; endTime?: string; role?: string; notes?: string }
): Promise<StaffSchedule> {
  return apiRequest(`/schedules/${id}`, { method: 'PUT', json: data });
}

export async function deleteSchedule(id: string): Promise<void> {
  return apiRequest(`/schedules/${id}`, { method: 'DELETE' });
}
