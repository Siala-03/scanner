import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseAdmin as supabase } from '../lib/supabase';
import {
  fetchInventory,
  fetchLowStockItems,
  fetchSuppliers,
  fetchPurchaseOrders,
  fetchMovements,
  fetchWasteEntries,
  computeInventoryAnalytics,
  fetchLocations,
  fetchForecasts,
  fetchForecastAlerts,
} from '../api/inventory';
import type {
  InventoryRecord,
  Supplier,
  PurchaseOrder,
  StockMovement,
  WasteEntry,
  InventoryAnalytics,
  InventoryForecast,
} from '../types/inventory';

// InventoryLocation might not be in the types yet — use a safe fallback
type InventoryLocation = any;

export function useInventoryData() {
  const [inventory, setInventory]           = useState<InventoryRecord[]>([]);
  const [lowStockItems, setLowStockItems]   = useState<InventoryRecord[]>([]);
  const [suppliers, setSuppliers]           = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [movements, setMovements]           = useState<StockMovement[]>([]);
  const [waste, setWaste]                   = useState<WasteEntry[]>([]);
  const [locations, setLocations]           = useState<InventoryLocation[]>([]);
  const [analytics, setAnalytics]           = useState<InventoryAnalytics>({
    totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0,
    pendingPOCount: 0, pendingPOValue: 0, wasteCostLast30d: 0,
    avgTurnoverDays: 0, belowReorderCount: 0, topWasteReason: null,
    wasteByReason: [], topWasteItems: [], stockTurnoverRate: 0, categoryBreakdown: [],
  });
  const [isLoading, setIsLoading]           = useState(true);
  const [loadError, setLoadError]           = useState<string | null>(null);
  const [alerts, setAlerts]                 = useState<string[]>([]);
  const [forecasts, setForecasts]           = useState<InventoryForecast[]>([]);
  const [forecastAlerts, setForecastAlerts] = useState<InventoryForecast[]>([]);
  const [isGeneratingForecasts, setIsGeneratingForecasts] = useState(false);

  const inventoryRef  = useRef<InventoryRecord[]>([]);
  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const upsertInventoryRecords = useCallback((records: InventoryRecord[]) => {
    setInventory(prev => {
      const map = new Map(prev.map(r => [r.menuItemId, r]));
      records.forEach(r => { if (r.menuItemId) map.set(r.menuItemId, r); });
      const next = Array.from(map.values());
      inventoryRef.current = next;
      return next;
    });
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const results = await Promise.allSettled([
      fetchInventory(),
      fetchLowStockItems(),
      fetchSuppliers(),
      fetchPurchaseOrders(),
      fetchMovements({ limit: 200 }),
      fetchWasteEntries({ limit: 200 }),
      computeInventoryAnalytics(),
      fetchLocations(),
      fetchForecasts(),
      fetchForecastAlerts(),
    ]);

    const [invR, lowR, supR, poR, movR, wasteR, analyticsR, locR, fcR, fcAlertsR] = results;

    if (invR.status === 'fulfilled') {
      setInventory(invR.value);
      inventoryRef.current = invR.value;

      // Check for low-stock alerts
      const critical = invR.value.filter(r => r.stock === 0 || r.stock <= r.lowStockThreshold);
      if (critical.length > 0) {
        const msgs = critical.slice(0, 3).map(r =>
          r.stock === 0
            ? `${r.menuItemId} is out of stock`
            : `${r.menuItemId} is low (${r.stock} left)`
        );
        setAlerts(msgs);
      }
    } else {
      if (inventoryRef.current.length === 0) {
        setLoadError('Failed to load inventory');
      }
    }

    if (lowR.status === 'fulfilled')      setLowStockItems(lowR.value);
    if (supR.status === 'fulfilled')      setSuppliers(supR.value);
    if (poR.status === 'fulfilled')       setPurchaseOrders(poR.value);
    if (movR.status === 'fulfilled')      setMovements(movR.value);
    if (wasteR.status === 'fulfilled')    setWaste(wasteR.value);
    if (analyticsR.status === 'fulfilled') setAnalytics(analyticsR.value);
    if (locR.status === 'fulfilled')      setLocations(locR.value);
    if (fcR.status === 'fulfilled')       setForecasts(fcR.value);
    if (fcAlertsR.status === 'fulfilled') setForecastAlerts(fcAlertsR.value);

    setIsLoading(false);
  }, []);

  const runForecasting = useCallback(async () => {
    setIsGeneratingForecasts(true);
    try {
      const { generateForecasts } = await import('../api/inventory');
      const result = await generateForecasts();
      if (result.success) {
        setForecasts(result.forecasts);
        setForecastAlerts(result.forecasts.filter((f: any) =>
          f.alertStatus === 'critical' || f.alertStatus === 'warning'
        ));
      }
      return result;
    } catch (err) {
      console.error('Failed to generate forecasts', err);
      throw err;
    } finally {
      setIsGeneratingForecasts(false);
    }
  }, []);

  useEffect(() => {
    loadAll();

    const restaurantId = localStorage.getItem('restaurantId');
    if (restaurantId) {
      if (channelRef.current) supabase.removeChannel(channelRef.current);

      channelRef.current = supabase
        .channel(`inventory-realtime-${restaurantId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'inventory_records',
          filter: `restaurant_id=eq.${restaurantId}`,
        }, () => loadAll())
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'purchase_orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        }, () => loadAll())
        .subscribe();
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [loadAll]);

  return {
    inventory,
    lowStockItems,
    suppliers,
    purchaseOrders,
    movements,
    waste,
    locations,
    analytics,
    alerts,
    forecasts,
    forecastAlerts,
    isGeneratingForecasts,
    runForecasting,
    isLoading,
    loadError,
    refresh: loadAll,
    upsertInventoryRecords,
    // Legacy compat
    joinInventory: () => {},
    socket: { on: () => {}, off: () => {} },
  };
}
