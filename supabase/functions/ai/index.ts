import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.0';
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
      .eq('restaurant_id', restaurantId)
      .filter('stock', 'lte', 'low_stock_threshold')
      .limit(10);
    return data ?? [];
  } catch { return []; }
}

async function getTopSales(restaurantId: string, db: any) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('orders')
      .select('items')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'served')
      .gte('created_at', thirtyDaysAgo);

    if (!data) return [];

    const counts: Record<string, number> = {};
    for (const order of data) {
      const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
      for (const item of items) {
        const name = item.menu_item_name || item.menuItemName || item.name || 'Unknown';
        counts[name] = (counts[name] || 0) + (item.quantity || 1);
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, qty]) => ({ name, total_qty: qty }));
  } catch { return []; }
}

async function getWaste(restaurantId: string, db: any) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('waste_entries')
      .select('menu_item_name, qty, total_cost')
      .eq('restaurant_id', restaurantId)
      .gte('timestamp', thirtyDaysAgo);

    if (!data) return [];
    const agg: Record<string, { qty: number; cost: number }> = {};
    for (const row of data) {
      if (!agg[row.menu_item_name]) agg[row.menu_item_name] = { qty: 0, cost: 0 };
      agg[row.menu_item_name].qty += row.qty || 0;
      agg[row.menu_item_name].cost += row.total_cost || 0;
    }
    return Object.entries(agg)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .slice(0, 3)
      .map(([name, v]) => ({ name, ...v }));
  } catch { return []; }
}

async function getExpenses(restaurantId: string, db: any) {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const { data } = await db
      .from('expenses')
      .select('amount, expense_categories(name)')
      .eq('restaurant_id', restaurantId)
      .gte('expense_date', startOfMonth.toISOString());

    if (!data) return [];
    const agg: Record<string, number> = {};
    for (const row of data) {
      const cat = row.expense_categories?.name || 'Other';
      agg[cat] = (agg[cat] || 0) + Number(row.amount || 0);
    }
    return Object.entries(agg).map(([category, total]) => ({ category, total }));
  } catch { return []; }
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
      const [inventory, sales, waste, expenses] = await Promise.all([
        getLowStock(ctx.restaurantId, db),
        getTopSales(ctx.restaurantId, db),
        getWaste(ctx.restaurantId, db),
        getExpenses(ctx.restaurantId, db),
      ]);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const systemInstruction = `You are 'Servv IQ', an elite restaurant operations analyst.
Your goal is to provide actionable, data-driven advice to the restaurant manager.

CURRENT DATA SNAPSHOT:
- Low Stock Items: ${JSON.stringify(inventory)}
- Top 5 Best Sellers (30 days): ${JSON.stringify(sales)}
- Top Waste Drivers: ${JSON.stringify(waste)}
- Monthly Expenses by Category: ${JSON.stringify(expenses)}

GUIDELINES:
1. If stock is low for a best-seller, warn to reorder immediately.
2. If waste is high for an item, suggest checking portion sizes or storage.
3. If expenses spike, suggest an audit.
4. Keep answers professional, concise, and focused on profitability.
5. Only use the data provided. If you don't know, suggest where to look in the app.`;

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
      if (inventory.length > 0) suggestedActions.push('review_purchase_orders');
      if (waste.length > 0) suggestedActions.push('check_waste_analysis');

      return cors({ answer: answerText, suggestedActions, timestamp: new Date() });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
