import { apiRequest } from './http';
import { StaffSchedule } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SCHEDULES_BASE_PATH = API_BASE.includes('/functions/v1') ? '/schedules' : '/api/schedules';

function rowToSchedule(row: Record<string, unknown>): StaffSchedule {
  return {
    id: row.id as string,
    restaurantId: (row.restaurant_id ?? row.restaurantId) as string,
    staffId: (row.staff_id ?? row.staffId) as string,
    staffName: (row.staff_name ?? row.staffName ?? undefined) as string | undefined,
    staffRole: (row.staff_role ?? row.staffRole ?? undefined) as string | undefined,
    shiftDate: String(row.shift_date ?? row.shiftDate ?? '').slice(0, 10),
    startTime: String(row.start_time ?? row.startTime ?? '').slice(0, 5),
    endTime: String(row.end_time ?? row.endTime ?? '').slice(0, 5),
    role: (row.role ?? undefined) as string | undefined,
    notes: (row.notes ?? undefined) as string | undefined,
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
  };
}

export async function getSchedules(
  _restaurantId: string,
  startDate: string,
  endDate: string
): Promise<StaffSchedule[]> {
  const data = await apiRequest<any[]>(
    `${SCHEDULES_BASE_PATH}?startDate=${startDate}&endDate=${endDate}`
  );
  return (data || []).map(rowToSchedule);
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
  const row = await apiRequest<any>(SCHEDULES_BASE_PATH, {
    method: 'POST',
    json: {
      staffId: data.staffId,
      shiftDate: data.shiftDate,
      startTime: data.startTime,
      endTime: data.endTime,
      role: data.role ?? null,
      notes: data.notes ?? null,
    },
  });
  return rowToSchedule(row);
}

export async function updateSchedule(
  id: string,
  data: { startTime?: string; endTime?: string; role?: string; notes?: string }
): Promise<StaffSchedule> {
  const row = await apiRequest<any>(`${SCHEDULES_BASE_PATH}/${id}`, {
    method: 'PUT',
    json: data,
  });
  return rowToSchedule(row);
}

export async function deleteSchedule(id: string): Promise<void> {
  await apiRequest<void>(`${SCHEDULES_BASE_PATH}/${id}`, { method: 'DELETE' });
}
