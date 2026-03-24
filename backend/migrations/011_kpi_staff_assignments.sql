-- Add assigned_staff_ids column to kpis table
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS assigned_staff_ids TEXT[] DEFAULT '{}';