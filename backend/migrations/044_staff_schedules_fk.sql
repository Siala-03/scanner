-- Add missing FK from staff_schedules.staff_id -> staff.id
-- This is required for Supabase PostgREST to resolve the join in its schema cache.
-- Without this, any query that joins staff_schedules with staff fails with
-- "Could not find a relationship between 'staff_schedules' and 'staff' in the schema cache".

ALTER TABLE staff_schedules
  ADD CONSTRAINT fk_staff_schedules_staff
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
