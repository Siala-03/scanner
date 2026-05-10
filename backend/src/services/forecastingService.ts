import { pool } from '../db.js';

function isForecastSchemaError(error: any): boolean {
  const code = String(error?.code || '');
  // 42P01: undefined_table, 42703: undefined_column
  return code === '42P01' || code === '42703';
}

export interface ForecastResult {
  id: string;
  menuItemId: string;
  menuItemName: string;
  forecastDate: string;
  predictedConsumption: number;
  confidenceLevel: number;
  recommendedReorderQty: number;
  leadTimeDays: number;
  seasonalityFactor: number;
  trendFactor: number;
  lastStockLevel: number;
  daysUntilStockout: number;
  alertStatus: 'none' | 'warning' | 'critical';
}

interface HistoricalData {
  date: string;
  consumption: number;
  waste: number;
  dayOfWeek: number;
}

interface SeasonalData {
  dayOfWeek: number;
  avgConsumption: number;
  sampleCount: number;
}

/**
 * AI-powered inventory forecasting using weighted moving averages with seasonality detection
 */
export async function generateInventoryForecast(
  menuItemId: string,
  menuItemName: string,
  daysAhead: number = 7
): Promise<ForecastResult> {
  // Get historical consumption data (last 90 days)
  const historicalData = await getHistoricalConsumption(menuItemId, 90);
  
  if (historicalData.length === 0) {
    const currentStock = await getCurrentStock(menuItemId);
    return createDefaultForecast(menuItemId, menuItemName, daysAhead, currentStock);
  }

  // Calculate base consumption using weighted moving average (more recent = more weight)
  const baseConsumption = calculateWeightedMovingAverage(historicalData, 30);
  
  // Detect seasonal patterns
  const seasonalFactor = calculateSeasonalityFactor(historicalData);
  
  // Calculate trend (is consumption increasing or decreasing?)
  const trendFactor = calculateTrendFactor(historicalData);
  
  // Calculate confidence based on data quality and consistency
  const confidence = calculateConfidence(historicalData, baseConsumption);
  
  // Get current stock level
  const currentStock = await getCurrentStock(menuItemId);
  const leadTimeDays = 3; // Default lead time
  
  // Calculate predicted daily consumption with adjustments
  const adjustedDailyConsumption = baseConsumption * seasonalFactor * trendFactor;
  
  // Calculate days until stockout
  const daysUntilStockout = currentStock > 0 
    ? Math.floor(currentStock / Math.max(adjustedDailyConsumption, 1))
    : 0;
  
  // Determine alert status
  let alertStatus: 'none' | 'warning' | 'critical' = 'none';
  if (daysUntilStockout <= 2) {
    alertStatus = 'critical';
  } else if (daysUntilStockout <= 5) {
    alertStatus = 'warning';
  }
  
  // Calculate recommended reorder quantity (cover next 2 weeks + safety stock)
  const recommendedReorderQty = Math.ceil(adjustedDailyConsumption * 14);
  
  const forecastId = `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  
  return {
    id: forecastId,
    menuItemId,
    menuItemName,
    forecastDate: new Date().toISOString().split('T')[0],
    predictedConsumption: Math.round(adjustedDailyConsumption),
    confidenceLevel: Math.round(confidence * 100) / 100,
    recommendedReorderQty,
    leadTimeDays,
    seasonalityFactor: Math.round(seasonalFactor * 100) / 100,
    trendFactor: Math.round(trendFactor * 100) / 100,
    lastStockLevel: currentStock,
    daysUntilStockout,
    alertStatus,
  };
}

/**
 * Generate forecasts for all inventory items
 */
export async function generateAllForecasts(restaurantId: string): Promise<ForecastResult[]> {
  // Get all inventory items
  const inventoryResult = await pool.query(
    'SELECT menu_item_id FROM inventory_records WHERE restaurant_id = $1',
    [restaurantId]
  );
  
  const forecasts: ForecastResult[] = [];
  
  for (const row of inventoryResult.rows) {
    try {
      // Try to get menu item name from menu_items table
      let menuItemName = row.menu_item_id;
      
      const menuResult = await pool.query(
        'SELECT name FROM menu_items WHERE id = $1 AND restaurant_id = $2',
        [row.menu_item_id, restaurantId]
      );
      
      if (menuResult.rows.length > 0) {
        menuItemName = menuResult.rows[0].name;
      }
      
      const forecast = await generateInventoryForecast(row.menu_item_id, menuItemName, 7);
      forecasts.push(forecast);

      try {
        await storeForecast(forecast);
      } catch (storeErr) {
        if (isForecastSchemaError(storeErr)) {
          console.warn('inventory_forecasts table not ready; skipping storage.');
        } else {
          console.error(`Failed to store forecast for ${row.menu_item_id}:`, storeErr);
        }
      }
    } catch (error) {
      console.error(`Failed to generate forecast for ${row.menu_item_id}:`, error);
    }
  }
  
  return forecasts;
}

/**
 * Get stored forecasts from database
 */
export async function getStoredForecasts(restaurantId: string): Promise<ForecastResult[]> {
  let result;
  try {
    result = await pool.query(
      `SELECT * FROM inventory_forecasts 
       WHERE menu_item_id IN (SELECT menu_item_id FROM inventory_records WHERE restaurant_id = $1)
       ORDER BY alert_status DESC, days_until_stockout ASC`,
      [restaurantId]
    );
  } catch (error) {
    if (isForecastSchemaError(error)) {
      console.warn('Forecast schema not ready for getStoredForecasts; returning empty list.');
      return [];
    }
    throw error;
  }
  
  return result.rows.map(row => ({
    id: row.id,
    menuItemId: row.menu_item_id,
    menuItemName: row.menu_item_name,
    forecastDate: row.forecast_date,
    predictedConsumption: row.predicted_consumption,
    confidenceLevel: row.confidence_level,
    recommendedReorderQty: row.recommended_reorder_qty,
    leadTimeDays: row.lead_time_days,
    seasonalityFactor: row.seasonality_factor,
    trendFactor: row.trend_factor,
    lastStockLevel: row.last_stock_level,
    daysUntilStockout: row.days_until_stockout,
    alertStatus: row.alert_status,
  }));
}

/**
 * Get alerts (items that need attention based on forecast)
 */
export async function getForecastAlerts(restaurantId: string): Promise<ForecastResult[]> {
  let result;
  try {
    result = await pool.query(
      `SELECT * FROM inventory_forecasts 
       WHERE menu_item_id IN (SELECT menu_item_id FROM inventory_records WHERE restaurant_id = $1)
       AND alert_status IN ('warning', 'critical')
       ORDER BY 
         CASE alert_status 
           WHEN 'critical' THEN 1 
           WHEN 'warning' THEN 2 
           ELSE 3 
         END,
         days_until_stockout ASC`,
      [restaurantId]
    );
  } catch (error) {
    if (isForecastSchemaError(error)) {
      console.warn('Forecast schema not ready for getForecastAlerts; returning empty list.');
      return [];
    }
    throw error;
  }
  
  return result.rows.map(row => ({
    id: row.id,
    menuItemId: row.menu_item_id,
    menuItemName: row.menu_item_name,
    forecastDate: row.forecast_date,
    predictedConsumption: row.predicted_consumption,
    confidenceLevel: row.confidence_level,
    recommendedReorderQty: row.recommended_reorder_qty,
    leadTimeDays: row.lead_time_days,
    seasonalityFactor: row.seasonality_factor,
    trendFactor: row.trend_factor,
    lastStockLevel: row.last_stock_level,
    daysUntilStockout: row.days_until_stockout,
    alertStatus: row.alert_status,
  }));
}

// =====================
// HELPER FUNCTIONS
// =====================

async function getHistoricalConsumption(menuItemId: string, days: number): Promise<HistoricalData[]> {
  const result = await pool.query(
    `SELECT 
       DATE(timestamp) as date,
       SUM(CASE WHEN type = 'sale' THEN ABS(qty) ELSE 0 END) as consumption,
       SUM(CASE WHEN type = 'waste' THEN ABS(qty) ELSE 0 END) as waste,
       EXTRACT(DOW FROM timestamp)::integer as day_of_week
     FROM stock_movements 
     WHERE menu_item_id = $1 
       AND timestamp >= NOW() - INTERVAL '${days} days'
       AND type IN ('sale', 'waste')
     GROUP BY DATE(timestamp), EXTRACT(DOW FROM timestamp)
     ORDER BY date DESC`,
    [menuItemId]
  );
  
  return result.rows.map(row => ({
    date: row.date,
    consumption: parseInt(row.consumption) || 0,
    waste: parseInt(row.waste) || 0,
    dayOfWeek: parseInt(row.day_of_week),
  }));
}

async function getCurrentStock(menuItemId: string): Promise<number> {
  const result = await pool.query(
    'SELECT stock FROM inventory_records WHERE menu_item_id = $1',
    [menuItemId]
  );
  
  return result.rows.length > 0 ? (result.rows[0].stock || 0) : 0;
}

function calculateWeightedMovingAverage(data: HistoricalData[], days: number): number {
  if (data.length === 0) return 0;
  
  const recentData = data.slice(0, Math.min(days, data.length));
  let weightedSum = 0;
  let weightTotal = 0;
  
  for (let i = 0; i < recentData.length; i++) {
    const weight = (recentData.length - i) / recentData.length; // More recent = higher weight
    weightedSum += (recentData[i].consumption + recentData[i].waste) * weight;
    weightTotal += weight;
  }
  
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function calculateSeasonalityFactor(data: HistoricalData[]): number {
  if (data.length < 7) return 1;

  const dayConsumption: { [key: number]: number[] } = {};

  for (const row of data) {
    const day = row.dayOfWeek;
    if (!dayConsumption[day]) dayConsumption[day] = [];
    dayConsumption[day].push(row.consumption);
  }

  // Build a day-keyed map (0=Sun … 6=Sat) so currentDay lookup is correct
  const dayAverages: { [key: number]: number } = {};
  for (let i = 0; i < 7; i++) {
    if (dayConsumption[i] && dayConsumption[i].length > 0) {
      dayAverages[i] = dayConsumption[i].reduce((a, b) => a + b, 0) / dayConsumption[i].length;
    }
  }

  const avgValues = Object.values(dayAverages);
  if (avgValues.length === 0) return 1;

  const overallAvg = avgValues.reduce((a, b) => a + b, 0) / avgValues.length;
  if (overallAvg === 0) return 1;

  const currentDay = new Date().getDay();
  const currentDayAvg = dayAverages[currentDay] ?? overallAvg;

  return currentDayAvg / overallAvg;
}

function calculateTrendFactor(data: HistoricalData[]): number {
  if (data.length < 14) return 1;
  
  // Split data in half and compare
  const midpoint = Math.floor(data.length / 2);
  const recentHalf = data.slice(0, midpoint);
  const olderHalf = data.slice(midpoint);
  
  const recentAvg = recentHalf.reduce((sum, row) => sum + row.consumption + row.waste, 0) / recentHalf.length;
  const olderAvg = olderHalf.reduce((sum, row) => sum + row.consumption + row.waste, 0) / olderHalf.length;
  
  if (olderAvg === 0) return 1;
  
  // Cap trend factor between 0.7 and 1.3 to prevent extreme predictions
  const rawFactor = recentAvg / olderAvg;
  return Math.max(0.7, Math.min(1.3, rawFactor));
}

function calculateConfidence(data: HistoricalData[], baseConsumption: number): number {
  if (data.length < 7) return 0.3; // Low confidence with little data
  if (data.length < 30) return 0.5;
  
  // Calculate standard deviation
  const mean = baseConsumption;
  const squaredDiffs = data.map(row => Math.pow((row.consumption + row.waste) - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  // Confidence decreases as coefficient of variation increases
  const cv = mean > 0 ? stdDev / mean : 1;
  const confidence = Math.max(0.1, 1 - cv);
  
  return Math.min(0.95, confidence);
}

function createDefaultForecast(
  menuItemId: string,
  menuItemName: string,
  daysAhead: number,
  currentStock: number = 0
): ForecastResult {
  const forecastId = `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  // Without sales history we cannot predict consumption, only report current stock status
  const alertStatus: 'none' | 'warning' | 'critical' = currentStock <= 0 ? 'critical' : 'none';

  return {
    id: forecastId,
    menuItemId,
    menuItemName,
    forecastDate: new Date().toISOString().split('T')[0],
    predictedConsumption: 0,
    confidenceLevel: 0.1,
    recommendedReorderQty: currentStock <= 0 ? 50 : 0,
    leadTimeDays: 3,
    seasonalityFactor: 1,
    trendFactor: 1,
    lastStockLevel: currentStock,
    daysUntilStockout: currentStock > 0 ? 999 : 0,
    alertStatus,
  };
}

async function storeForecast(forecast: ForecastResult): Promise<void> {
  await pool.query(
    `INSERT INTO inventory_forecasts 
      (id, menu_item_id, menu_item_name, forecast_date, predicted_consumption, 
       confidence_level, recommended_reorder_qty, lead_time_days, seasonality_factor, 
       trend_factor, last_stock_level, days_until_stockout, alert_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (menu_item_id, forecast_date) 
     DO UPDATE SET 
       predicted_consumption = $5, confidence_level = $6, recommended_reorder_qty = $7,
       lead_time_days = $8, seasonality_factor = $9, trend_factor = $10,
       last_stock_level = $11, days_until_stockout = $12, alert_status = $13`,
    [
      forecast.id,
      forecast.menuItemId,
      forecast.menuItemName,
      forecast.forecastDate,
      forecast.predictedConsumption,
      forecast.confidenceLevel,
      forecast.recommendedReorderQty,
      forecast.leadTimeDays,
      forecast.seasonalityFactor,
      forecast.trendFactor,
      forecast.lastStockLevel,
      forecast.daysUntilStockout,
      forecast.alertStatus,
    ]
  );
}