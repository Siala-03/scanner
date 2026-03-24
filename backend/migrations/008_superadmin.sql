-- ============================================
-- SUPERADMIN ROLE AND RESTAURANT MANAGEMENT
-- ============================================

-- Update staff role constraint to include superadmin
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('waiter', 'supervisor', 'manager', 'kitchen', 'superadmin'));

-- Create superadmin user (only if no superadmin exists)
INSERT INTO staff (id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id)
VALUES ('superadmin-001', 'Super Administrator', 'superadmin', 'admin@restaurantapp.com', '+1234567890', true, '{}', '{}', now(), 'default_restaurant')
ON CONFLICT (id) DO NOTHING;

-- Create superadmin credentials
INSERT INTO staff_credentials (staff_id, username, password_hash, restaurant_id)
VALUES ('superadmin-001', 'superadmin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'default_restaurant')
ON CONFLICT (username, restaurant_id) DO NOTHING;

-- Add restaurant management permissions (we'll handle this in application logic)
-- Superadmin can access all restaurants, managers only their restaurant