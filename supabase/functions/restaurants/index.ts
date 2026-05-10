import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate, requireRole } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const RESTAURANT_FIELDS = ['name', 'email', 'phone', 'address', 'outlet_type', 'city', 'country', 'currency', 'timezone', 'logo_url', 'settings', 'is_active', 'subscription_status'];

function pickRestaurantFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([k]) => RESTAURANT_FIELDS.includes(k))
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/restaurants/, '').replace(/^\/restaurants/, '');
  const db = admin();

  try {
    // GET /restaurants/public/:restaurantId — no auth
    const publicMatch = path.match(/^\/public\/([^/]+)$/);
    if (req.method === 'GET' && publicMatch) {
      const { data, error } = await db
        .from('restaurants')
        .select('id, name, address, phone, email, logo_url, currency, timezone, outlet_type, settings')
        .eq('id', publicMatch[1])
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    const ctx = await authenticate(req);

    // GET /restaurants
    if (req.method === 'GET' && (path === '' || path === '/')) {
      requireRole(ctx, 'superadmin');
      const { data, error } = await db.from('restaurants').select('*').order('name');
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // GET /restaurants/:id — also accept ?id= query param (used by callEdgeFn)
    const qId = url.searchParams.get('id');
    const idMatch = path.match(/^\/([^/]+)$/) || (qId ? [null, qId] : null);
    if (req.method === 'GET' && idMatch) {
      const id = idMatch[1];
      if (ctx.staffRole !== 'superadmin' && ctx.restaurantId !== id) {
        return err('Unauthorized', 403);
      }
      const { data, error } = await db.from('restaurants').select('*').eq('id', id).single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /restaurants — create restaurant + manager account (superadmin only)
    if (req.method === 'POST' && (path === '' || path === '/')) {
      requireRole(ctx, 'superadmin');
      const body = await req.json();

      const { managerName, managerEmail, managerPhone, managerUsername, managerPassword } = body;
      if (!managerName || !managerUsername || !managerPassword) {
        return err('managerName, managerUsername, and managerPassword are required', 400);
      }

      const restaurantId = `rest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
      const managerId = `mgr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

      // 1. Create restaurant (only valid columns)
      const restaurantPayload = { ...pickRestaurantFields(body), id: restaurantId };
      const { data: restaurant, error: restError } = await db
        .from('restaurants')
        .insert(restaurantPayload)
        .select('*')
        .single();
      if (restError) return err(restError.message, 400);

      // 2. Create manager staff record
      const { error: staffError } = await db.from('staff').insert({
        id: managerId,
        name: managerName,
        email: managerEmail || null,
        phone: managerPhone || null,
        role: 'manager',
        is_on_duty: true,
        assigned_tables: [],
        performance: {},
        hire_date: new Date().toISOString(),
        restaurant_id: restaurantId,
      });

      if (staffError) {
        // Roll back restaurant on manager failure
        await db.from('restaurants').delete().eq('id', restaurantId);
        return err(`Failed to create manager: ${staffError.message}`, 400);
      }

      // 3. Create manager credentials
      const { error: credError } = await db.from('staff_credentials').insert({
        staff_id: managerId,
        username: managerUsername,
        password_hash: managerPassword,
        restaurant_id: restaurantId,
      });

      if (credError) {
        await db.from('staff').delete().eq('id', managerId);
        await db.from('restaurants').delete().eq('id', restaurantId);
        return err(
          credError.message.includes('duplicate') ? 'Username already taken' : `Failed to create credentials: ${credError.message}`,
          400
        );
      }

      return cors({ restaurant, manager: { id: managerId, name: managerName, username: managerUsername } }, { status: 201 });
    }

    // PUT /restaurants/:id — update restaurant fields
    if (req.method === 'PUT' && idMatch) {
      const id = idMatch[1];
      if (ctx.staffRole !== 'superadmin' && ctx.restaurantId !== id) {
        return err('Unauthorized', 403);
      }
      const body = await req.json();
      const payload = pickRestaurantFields(body);
      const { data, error } = await db
        .from('restaurants')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /restaurants/:id (superadmin only)
    if (req.method === 'DELETE' && idMatch) {
      requireRole(ctx, 'superadmin');
      const id = idMatch[1];

      // Cascade-delete all restaurant-dependent records in dependency order.
      // Order: deepest dependents first, then their parents, staff last before restaurant.
      const d = (table: string) => db.from(table).delete().eq('restaurant_id', id);

      // Order items / transactions (depend on orders, customers, rewards)
      await d('minimart_refund_requests');
      await d('minimart_refunds');
      await d('loyalty_transactions');
      await d('reward_redemptions');
      await d('order_items');
      await d('orders');

      // Menu
      await d('menu_item_reviews');
      await d('recipe_ingredients');
      await d('menu_items');

      // Expenses
      await d('expense_attachments');
      await d('expense_audit_log');
      await d('expense_notes');
      await d('expense_receipts');
      await d('expenses');
      await d('expense_categories');
      await d('recurring_expenses');
      await d('expense_budgets');

      // Inventory
      await d('stock_movements');
      await d('stock_movements_enhanced');
      await d('waste_entries');
      await d('waste_entries_enhanced');
      await d('inventory_lots');
      await d('inventory_stock');
      await d('inventory_alerts');
      await d('inventory_forecasts');
      await d('inventory_reports');
      await d('inventory_records');
      await d('par_levels');
      await d('cycle_count_items');
      await d('cycle_counts');
      await d('inventory_items');
      await d('inventory_locations');

      // Suppliers / purchase orders
      await d('purchase_order_status_history');
      await d('purchase_orders');
      await d('supplier_prices');
      await d('supplier_performance');
      await d('supplier_notifications');
      await d('supplier_users');
      await d('suppliers');

      // Customers / loyalty
      await d('credit_transactions');
      await d('credit_alerts');
      await d('credit_accounts');
      await d('credit_applications');
      await d('customer_analytics');
      await d('customers');
      await d('rewards');
      await d('reviews');
      await d('reservations');
      await d('promotions');

      // Analytics / config
      await d('analytics_alerts');
      await d('dashboard_configs');
      await d('minimart_settings');
      await d('ebm_invoices');
      await d('ebm_config');
      await d('cashier_shifts');
      await d('table_service_sessions');
      await d('monthly_consumption');
      await d('operational_metrics');
      await d('predictive_analytics');
      await d('forecast_runs');
      await d('seasonal_patterns');

      // Staff
      await d('staff_kpi_progress');
      await d('staff_performance_analytics');
      await d('kpis');
      await d('staff_schedules');
      await d('tables');
      await d('staff_credentials');
      await d('staff');

      const { error } = await db.from('restaurants').delete().eq('id', id);
      if (error) return err(error.message);
      return cors({ success: true });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
