import { supabase } from '../lib/supabase';
import { apiRequest } from './http';
import { StaffSchedule } from '../types';

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
  restaurantId: string,
  startDate: string,
  endDate: string
): Promise<StaffSchedule[]> {
  // Use Supabase client directly (same as fetchStaff) so this works even when
  // VITE_API_URL is unset. FK migration 044 ensures the schema cache join works.
  const { data, error } = await supabase
    .from('staff_schedules')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
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
  const id = `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const { data: row, error } = await supabase
    .from('staff_schedules')
    .insert({
      id,
      restaurant_id: data.restaurantId,
      staff_id: data.staffId,
      shift_date: data.shiftDate,
      start_time: data.startTime,
      end_time: data.endTime,
      role: data.role ?? null,
      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToSchedule(row as Record<string, unknown>);
}

export async function updateSchedule(
  id: string,
  data: { startTime?: string; endTime?: string; role?: string; notes?: string }
): Promise<StaffSchedule> {
  const updates: Record<string, unknown> = {};
  if (data.startTime !== undefined) updates.start_time = data.startTime;
  if (data.endTime !== undefined) updates.end_time = data.endTime;
  if (data.role !== undefined) updates.role = data.role;
  if (data.notes !== undefined) updates.notes = data.notes;

  const { data: row, error } = await supabase
    .from('staff_schedules')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToSchedule(row as Record<string, unknown>);
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('staff_schedules').delete().eq('id', id);
  if (error) throw error;
}
