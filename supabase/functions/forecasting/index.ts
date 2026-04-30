import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function weightedAverage(values: number[]): number {
  if (!values.length) return 0;
  const total = values.length;
  let weightedSum = 0, weightSum = 0;
  values.forEach((v, i) => {
    const w = (i + 1) / total;
    weightedSum += v * w;
    weightSum += w;
  });
  return weightedSum / weightSum;
}

async function generateForecast(menuItemId: string, menuItemName: string, restaurantId: string, db: any) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Get historical orders
  const { data: orders } = await db
    .from('orders')
    .select('items, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'served')
    .gte('created_at', ninetyDaysAgo);

  const dailyConsumption: Record<string, number> = {};
  for (const order of (orders ?? [])) {
    const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
    for (const item of items) {
      if ((item.menuItemId || item.menu_item_id) === menuItemId) {
        const date = order.created_at.slice(0, 10);
        dailyConsumption[date] = (dailyConsumption[date] || 0) + (item.quantity || 1);
      }
    }
  }

  const consumptionValues = Object.values(dailyConsumption);
  const baseConsumption = consumptionValues.length > 0 ? weightedAverage(consumptionValues) : 1;

  const { data: inv } = await db
    .from('inventory_records')
    .select('stock, low_stock_threshold, reorder_point')
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const currentStock = inv?.stock ?? 0;
  const daysUntilStockout = currentStock > 0 ? Math.floor(currentStock / Math.max(baseConsumption, 0.1)) : 0;
  const alertStatus = daysUntilStockout <= 2 ? 'critical' : daysUntilStockout <= 5 ? 'warning' : 'none';
  const predictedConsumption = Math.round(baseConsumption * 7);
  const recommendedReorderQty = Math.max(Math.round(predictedConsumption * 1.5), 10);

  return {
    id: `forecast-${menuItemId}-${Date.now()}`,
    menuItemId,
    menuItemName,
    forecastDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    predictedConsumption,
    confidenceLevel: Math.min(0.9, 0.4 + consumptionValues.length * 0.01),
    recommendedReorderQty,
    leadTimeDays: 3,
    seasonalityFactor: 1.0,
    trendFactor: 1.0,
    lastStockLevel: currentStock,
    daysUntilStockout,
    alertStatus,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/forecasting/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /forecasting (stored forecasts)
    if (req.method === 'GET' && path === '') {
      const { data } = await db
        .from('inventory_forecasts')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('forecast_date', { ascending: true });
      return cors(data ?? []);
    }

    // GET /forecasting/alerts
    if (req.method === 'GET' && path === '/alerts') {
      const { data } = await db
        .from('inventory_forecasts')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .in('alert_status', ['warning', 'critical'])
        .order('days_until_stockout', { ascending: true });
      return cors(data ?? []);
    }

    // POST /forecasting/generate
    if (req.method === 'POST' && path === '/generate') {
      const { data: items } = await db
        .from('inventory_records')
        .select('menu_item_id')
        .eq('restaurant_id', restaurantId)
        .limit(50);

      const menuItemIds = (items ?? []).map((i: any) => i.menu_item_id).filter(Boolean);
      const { data: menuItems } = menuItemIds.length
        ? await db.from('menu_items').select('id, name').in('id', menuItemIds)
        : { data: [] };
      const nameById = new Map((menuItems ?? []).map((m: any) => [m.id, m.name]));

      const forecasts = [];
      for (const item of (items ?? [])) {
        const forecast = await generateForecast(
          item.menu_item_id,
          nameById.get(item.menu_item_id) || item.menu_item_id,
          restaurantId,
          db
        );
        forecasts.push(forecast);

        // Upsert into inventory_forecasts table (best-effort)
        await db.from('inventory_forecasts').upsert({
          id: forecast.id,
          menu_item_id: forecast.menuItemId,
          menu_item_name: forecast.menuItemName,
          restaurant_id: restaurantId,
          forecast_date: forecast.forecastDate,
          predicted_consumption: forecast.predictedConsumption,
          confidence_level: forecast.confidenceLevel,
          recommended_reorder_qty: forecast.recommendedReorderQty,
          days_until_stockout: forecast.daysUntilStockout,
          alert_status: forecast.alertStatus,
        }, { onConflict: 'menu_item_id,restaurant_id' }).maybeSingle();
      }

      return cors({ success: true, count: forecasts.length, forecasts });
    }

    // GET /forecasting/:menuItemId
    const itemMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && itemMatch) {
      const menuItemId = itemMatch[1];
      const menuItemName = url.searchParams.get('menuItemName') || menuItemId;
      const forecast = await generateForecast(menuItemId, menuItemName, restaurantId, db);
      return cors(forecast);
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
