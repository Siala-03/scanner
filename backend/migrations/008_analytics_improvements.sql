-- ============================================
-- ANALYTICS IMPROVEMENTS: NEW TABLES
-- ============================================

-- Customer analytics table
CREATE TABLE IF NOT EXISTS customer_analytics (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  customer_identifier text NOT NULL, -- email, phone, or generated ID
  total_orders integer NOT NULL DEFAULT 0,
  total_spent integer NOT NULL DEFAULT 0,
  avg_order_value integer NOT NULL DEFAULT 0,
  last_order_date timestamptz,
  first_order_date timestamptz,
  favorite_items jsonb DEFAULT '[]',
  order_frequency_days integer,
  customer_segment text CHECK (customer_segment IN ('new', 'regular', 'vip', 'at_risk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Staff performance analytics
CREATE TABLE IF NOT EXISTS staff_performance_analytics (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  staff_id text NOT NULL,
  date date NOT NULL,
  orders_served integer NOT NULL DEFAULT 0,
  revenue_generated integer NOT NULL DEFAULT 0,
  avg_service_time_minutes integer,
  customer_ratings jsonb DEFAULT '[]',
  avg_rating decimal(3,2),
  tips_earned integer DEFAULT 0,
  efficiency_score decimal(5,2), -- 0-100
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Operational metrics
CREATE TABLE IF NOT EXISTS operational_metrics (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  date date NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('revenue', 'orders', 'customers', 'efficiency', 'waste', 'inventory')),
  metric_name text NOT NULL,
  metric_value decimal(10,2) NOT NULL,
  target_value decimal(10,2),
  unit text, -- 'currency', 'count', 'percentage', 'minutes'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Predictive analytics cache
CREATE TABLE IF NOT EXISTS predictive_analytics (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  prediction_type text NOT NULL CHECK (prediction_type IN ('demand', 'inventory', 'staffing', 'revenue')),
  prediction_date date NOT NULL,
  prediction_data jsonb NOT NULL,
  confidence_score decimal(3,2), -- 0-1
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Custom dashboards configuration
CREATE TABLE IF NOT EXISTS dashboard_configs (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  user_id text NOT NULL,
  dashboard_name text NOT NULL,
  config jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Analytics alerts and notifications
CREATE TABLE IF NOT EXISTS analytics_alerts (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  alert_type text NOT NULL CHECK (alert_type IN ('revenue_drop', 'efficiency_low', 'waste_high', 'inventory_low', 'customer_churn')),
  threshold_value decimal(10,2),
  current_value decimal(10,2),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_analytics_restaurant ON customer_analytics(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customer_analytics_segment ON customer_analytics(customer_segment);
CREATE INDEX IF NOT EXISTS idx_staff_performance_restaurant_date ON staff_performance_analytics(restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_operational_metrics_restaurant_date ON operational_metrics(restaurant_id, date, metric_type);
CREATE INDEX IF NOT EXISTS idx_predictive_analytics_restaurant_type ON predictive_analytics(restaurant_id, prediction_type);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_restaurant_active ON analytics_alerts(restaurant_id, is_active);