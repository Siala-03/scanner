-- Add attendance tracking columns to staff_schedules
ALTER TABLE staff_schedules
  ADD COLUMN IF NOT EXISTS arrived_at  time,
  ADD COLUMN IF NOT EXISTS departed_at time;
