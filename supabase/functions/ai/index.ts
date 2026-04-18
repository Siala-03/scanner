import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate, requireRole } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function getLowStock(restaurantId: string, db: any) {
  try {
    const { data } = await db
      .from('inventory_records')
      .select('menu_items(name), stock, low_stock_threshold, reorder_point')
      .eq('restaurant_id', restaurantId);
    if (!data) return [];
    return data
      .filter((r: any) => r.low_stock_threshold != null && r.stock <= r.low_stock_threshold)
      .slice(0, 15);
  } catch { return []; }
}

async function getTopSales(restaurantId: string, db: any) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('orders')
      .select('items, total')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'served')
      .gte('created_at', thirtyDaysAgo);
    if (!data) return [];
    const counts: Record<string, { qty: number; revenue: number }> = {};
    for (const order of data) {
      const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
      for (const item of items) {
        const name = item.menu_item_name || item.menuItemName || item.name || 'Unknown';
        if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
        counts[name].qty += item.quantity || 1;
        counts[name].revenue += item.totalPrice || item.total_price || 0;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .slice(0, 10)
      .map(([name, v]) => ({ name, ...v }));
  } catch { return []; }
}

async function getOrdersSummary(restaurantId: string, db: any) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: todayOrders } = await db
      .from('orders')
      .select('status, total')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', today);
    const { data: weekOrders } = await db
      .from('orders')
      .select('total')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'served')
      .gte('created_at', weekAgo);
    const todayRevenue = (todayOrders ?? []).filter((o: any) => o.status === 'served').reduce((s: number, o: any) => s + (o.total || 0), 0);
    const weekRevenue = (weekOrders ?? []).reduce((s: number, o: any) => s + (o.total || 0), 0);
    const statusBreakdown: Record<string, number> = {};
    for (const o of (todayOrders ?? [])) {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
    }
    return { today_total_orders: todayOrders?.length ?? 0, today_revenue: todayRevenue, week_revenue: weekRevenue, status_breakdown: statusBreakdown };
  } catch { return {}; }
}

async function getStaffSummary(restaurantId: string, db: any) {
  try {
    const { data } = await db
      .from('staff')
      .select('name, role, is_on_duty')
      .eq('restaurant_id', restaurantId);
    if (!data) return [];
    const onDuty = data.filter((s: any) => s.is_on_duty);
    const byRole: Record<string, number> = {};
    for (const s of data) byRole[s.role] = (byRole[s.role] || 0) + 1;
    return { total: data.length, on_duty: onDuty.length, on_duty_staff: onDuty.map((s: any) => ({ name: s.name, role: s.role })), by_role: byRole };
  } catch { return {}; }
}

async function getWaste(restaurantId: string, db: any) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('waste_entries')
      .select('menu_item_name, qty, total_cost, reason')
      .eq('restaurant_id', restaurantId)
      .gte('timestamp', thirtyDaysAgo);
    if (!data) return [];
    const agg: Record<string, { qty: number; cost: number; reasons: string[] }> = {};
    for (const row of data) {
      if (!agg[row.menu_item_name]) agg[row.menu_item_name] = { qty: 0, cost: 0, reasons: [] };
      agg[row.menu_item_name].qty += row.qty || 0;
      agg[row.menu_item_name].cost += row.total_cost || 0;
      if (row.reason && !agg[row.menu_item_name].reasons.includes(row.reason)) {
        agg[row.menu_item_name].reasons.push(row.reason);
      }
    }
    return Object.entries(agg).sort(([, a], [, b]) => b.cost - a.cost).slice(0, 10).map(([name, v]) => ({ name, ...v }));
  } catch { return []; }
}

async function getExpenses(restaurantId: string, db: any) {
  try {
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const { data } = await db
      .from('expenses')
      .select('amount, status, expense_date, expense_categories(name)')
      .eq('restaurant_id', restaurantId)
      .gte('expense_date', startOfMonth.toISOString().slice(0, 10));
    if (!data) return { by_category: [], total: 0, pending_approval: 0 };
    const agg: Record<string, number> = {};
    let total = 0, pending = 0;
    for (const row of data) {
      const cat = row.expense_categories?.name || 'Other';
      const amt = Number(row.amount || 0);
      agg[cat] = (agg[cat] || 0) + amt;
      total += amt;
      if (row.status === 'pending') pending++;
    }
    return { by_category: Object.entries(agg).map(([category, amount]) => ({ category, amount })), total, pending_approval: pending };
  } catch { return {}; }
}

async function getMenuSummary(restaurantId: string, db: any) {
  try {
    const { data } = await db
      .from('menu_items')
      .select('name, category, price, is_available')
      .eq('restaurant_id', restaurantId)
      .eq('is_deleted', false);
    if (!data) return {};
    const byCategory: Record<string, number> = {};
    for (const item of data) byCategory[item.category || 'Other'] = (byCategory[item.category || 'Other'] || 0) + 1;
    return { total_items: data.length, available: data.filter((i: any) => i.is_available !== false).length, by_category: byCategory };
  } catch { return {}; }
}

async function getCustomersSummary(restaurantId: string, db: any) {
  try {
    const { data } = await db
      .from('customers')
      .select('total_points, total_spent, visit_count, last_visit')
      .eq('restaurant_id', restaurantId);
    if (!data) return {};
    const total = data.length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent = data.filter((c: any) => c.last_visit && c.last_visit >= sevenDaysAgo).length;
    const totalSpent = data.reduce((s: number, c: any) => s + (c.total_spent || 0), 0);
    const totalPoints = data.reduce((s: number, c: any) => s + (c.total_points || 0), 0);
    return { total_customers: total, active_last_7_days: recent, total_revenue_from_loyalty: totalSpent, total_points_outstanding: totalPoints };
  } catch { return {}; }
}

async function getTablesSummary(restaurantId: string, db: any) {
  try {
    const { data } = await db
      .from('tables')
      .select('table_number, status, capacity')
      .eq('restaurant_id', restaurantId);
    if (!data) return {};
    const occupied = data.filter((t: any) => t.status === 'occupied').length;
    return { total_tables: data.length, occupied, available: data.length - occupied, occupancy_rate: data.length ? Math.round((occupied / data.length) * 100) + '%' : '0%' };
  } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ai/, '');

  try {
    if (req.method === 'POST' && path === '/analyze') {
      const ctx = await authenticate(req);
      requireRole(ctx, 'manager', 'superadmin');

      const body = await req.json();
      const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) return err('A prompt is required', 400);

      const apiKey = Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) return err('AI service is not configured', 503);

      const db = admin();
      const [inventory, sales, orders, staff, waste, expenses, menu, customers, tables] = await Promise.all([
        getLowStock(ctx.restaurantId, db),
        getTopSales(ctx.restaurantId, db),
        getOrdersSummary(ctx.restaurantId, db),
        getStaffSummary(ctx.restaurantId, db),
        getWaste(ctx.restaurantId, db),
        getExpenses(ctx.restaurantId, db),
        getMenuSummary(ctx.restaurantId, db),
        getCustomersSummary(ctx.restaurantId, db),
        getTablesSummary(ctx.restaurantId, db),
      ]);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

      const systemInstruction = `You are 'Servv IQ', an elite restaurant operations analyst with full visibility into the restaurant's data.
Provide actionable, specific, data-driven advice. Be direct and concise. Use numbers from the data.

TODAY'S DATE: ${new Date().toISOString().slice(0, 10)}

=== FULL RESTAURANT DATA SNAPSHOT ===

INVENTORY - Low Stock Items (${(inventory as any[]).length} items):
${JSON.stringify(inventory, null, 2)}

SALES - Top Sellers (Last 30 days):
${JSON.stringify(sales, null, 2)}

ORDERS - Summary:
${JSON.stringify(orders, null, 2)}

STAFF - Current Status:
${JSON.stringify(staff, null, 2)}

WASTE - Last 30 Days:
${JSON.stringify(waste, null, 2)}

EXPENSES - This Month:
${JSON.stringify(expenses, null, 2)}

MENU - Overview:
${JSON.stringify(menu, null, 2)}

CUSTOMERS - Loyalty Summary:
${JSON.stringify(customers, null, 2)}

TABLES - Current Occupancy:
${JSON.stringify(tables, null, 2)}

=== GUIDELINES ===
1. Answer questions using the exact numbers above — never make up figures.
2. Cross-reference data: e.g. if a top-seller has low stock, flag it urgently.
3. If a question is about something not in the data, say so and suggest where in the app to find it.
4. Keep responses concise and actionable. Use bullet points for lists.
5. Currency values are in the restaurant's local currency.`;

      let answerText: string;
      let aiResult: any;
      try {
        aiResult = await model.generateContent([systemInstruction, prompt]);
        answerText = aiResult.response.text();
      } catch (e: any) {
        const blocked = aiResult?.response?.candidates?.[0]?.finishReason;
        if (blocked && blocked !== 'STOP') {
          return err(`AI response was blocked (${blocked}). Please rephrase.`, 422);
        }
        return err(e.message || 'AI generation failed', 502);
      }

      const suggestedActions: string[] = [];
      if ((inventory as any[]).length > 0) suggestedActions.push('review_purchase_orders');
      if ((waste as any[]).length > 0) suggestedActions.push('check_waste_analysis');
      if ((orders as any).today_revenue > 0) suggestedActions.push('view_sales_report');

      return cors({ answer: answerText, suggestedActions, timestamp: new Date() });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
