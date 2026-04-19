-- Servv compatibility migration for Supabase
-- Fixes: missing public.inventory_locations table and related references
-- Safe to run multiple times (idempotent)

BEGIN;

-- 1) Core table used by locations API/UI
CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (
    type IN ('warehouse', 'walk_in', 'dry_store', 'bar', 'kitchen', 'cold_room', 'freezer', 'display', 'other')
  ),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  capacity integer,
  temperature_range text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate active location names per restaurant
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_restaurant_name_unique
  ON public.inventory_locations (restaurant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_inventory_locations_restaurant
  ON public.inventory_locations (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_active
  ON public.inventory_locations (is_active);

-- 2) Ensure inventory_records can point to location rows
ALTER TABLE public.inventory_records
  ADD COLUMN IF NOT EXISTS location_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_inventory_records_location_id'
  ) THEN
    ALTER TABLE public.inventory_records
      ADD CONSTRAINT fk_inventory_records_location_id
      FOREIGN KEY (location_id)
      REFERENCES public.inventory_locations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_records_location_id
  ON public.inventory_records (location_id);

-- 3) Ensure inventory_stock exists for edge-function relation usage
CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  inventory_item_id text NOT NULL,
  location_id text,
  quantity numeric NOT NULL DEFAULT 0,
  reserved_qty numeric NOT NULL DEFAULT 0,
  min_level numeric NOT NULL DEFAULT 0,
  max_level numeric NOT NULL DEFAULT 0,
  reorder_point numeric NOT NULL DEFAULT 0,
  reorder_qty numeric NOT NULL DEFAULT 0,
  safety_stock numeric NOT NULL DEFAULT 0,
  last_counted_at timestamptz,
  last_counted_qty numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_item_id, location_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_inventory_stock_location_id'
  ) THEN
    ALTER TABLE public.inventory_stock
      ADD CONSTRAINT fk_inventory_stock_location_id
      FOREIGN KEY (location_id)
      REFERENCES public.inventory_locations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_stock_location_id
  ON public.inventory_stock (location_id);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_restaurant
  ON public.inventory_stock (restaurant_id);

-- 4) Seed one default location per restaurant if missing
INSERT INTO public.inventory_locations (
  id,
  restaurant_id,
  name,
  type,
  description,
  is_active
)
SELECT
  'loc_default_' || r.id,
  r.id,
  'Main Storage',
  'warehouse',
  'Default storage location',
  true
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_locations il
  WHERE il.restaurant_id = r.id
);

-- 5) Backfill inventory_records.location_id where null
UPDATE public.inventory_records ir
SET location_id = 'loc_default_' || ir.restaurant_id
WHERE ir.location_id IS NULL
  AND ir.restaurant_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.id = 'loc_default_' || ir.restaurant_id
  );

COMMIT;
