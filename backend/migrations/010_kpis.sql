-- Create KPIs table for staff performance tracking
CREATE TABLE IF NOT EXISTS kpis (
  id SERIAL PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  staff_role VARCHAR(50) NOT NULL CHECK (staff_role IN ('waiter','supervisor','manager','kitchen')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metric VARCHAR(100) NOT NULL, -- e.g., 'orders_served', 'revenue', 'rating'
  target_value DECIMAL(10,2) NOT NULL,
  period VARCHAR(20) NOT NULL DEFAULT 'daily' CHECK (period IN ('daily', 'weekly', 'monthly')),
  created_by VARCHAR(255) NOT NULL, -- manager id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create staff KPI progress table
CREATE TABLE IF NOT EXISTS staff_kpi_progress (
  id SERIAL PRIMARY KEY,
  staff_id VARCHAR(255) NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  current_value DECIMAL(10,2) DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  achieved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(staff_id, kpi_id, period_start)
);

-- Indexes
CREATE INDEX idx_kpis_restaurant_role ON kpis(restaurant_id, staff_role);
CREATE INDEX idx_staff_kpi_progress_staff ON staff_kpi_progress(staff_id);
CREATE INDEX idx_staff_kpi_progress_kpi ON staff_kpi_progress(kpi_id);