-- ============================================
-- INVENTORY FORECASTING TABLES
-- ============================================

-- Seasonal patterns storage (for seasonality detection)
CREATE TABLE IF NOT EXISTS seasonal_patterns (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL,
  day_of_week integer NOT NULL, -- 0-6 (Sunday-Saturday)
  hour_of_day integer NOT NULL, -- 0-23
  avg_consumption numeric NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seasonal_menu_item ON seasonal_patterns(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_day_week ON seasonal_patterns(day_of_week);

-- Monthly aggregation for longer-term forecasting
CREATE TABLE IF NOT EXISTS monthly_consumption (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL, -- 1-12
  total_consumed integer NOT NULL DEFAULT 0,
  total_waste integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  avg_daily_consumption numeric NOT NULL DEFAULT 0,
  days_tracked integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_menu_item ON monthly_consumption(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_monthly_year_month ON monthly_consumption(year, month);

-- Forecast results storage
CREATE TABLE IF NOT EXISTS inventory_forecasts (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL,
  menu_item_name text,
  forecast_date date NOT NULL,
  predicted_consumption integer NOT NULL,
  confidence_level numeric NOT NULL DEFAULT 0, -- 0-1
  recommended_reorder_qty integer NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 3,
  seasonality_factor numeric NOT NULL DEFAULT 1,
  trend_factor numeric NOT NULL DEFAULT 1,
  last_stock_level integer,
  days_until_stockout integer,
  alert_status text, -- 'none', 'warning', 'critical'
  forecast_model text NOT NULL DEFAULT 'weighted_average',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_menu_item ON inventory_forecasts(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_forecast_date ON inventory_forecasts(forecast_date);
CREATE INDEX IF NOT EXISTS idx_forecast_alert ON inventory_forecasts(alert_status) WHERE alert_status IS NOT NULL;

-- Analytics: store last computed forecast run
CREATE TABLE IF NOT EXISTS forecast_runs (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL,
  items_forecasted integer NOT NULL DEFAULT 0,
  alerts_generated integer NOT NULL DEFAULT 0,
  run_status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_restaurant ON forecast_runs(restaurant_id);