import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
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
  generateForecasts,
  fetchForecastAlerts,
} from '../api/inventory';
import type {
  InventoryRecord,
  InventoryLocation,
  Supplier,
  PurchaseOrder,
  StockMovement,
  WasteEntry,
  InventoryAnalytics,
  InventoryForecast,
} from '../types/inventory';

export function useInventoryData() {
  const { joinInventory, socket } = useSocket();
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const inventoryRef = useRef<InventoryRecord[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryRecord[]>([]);

  const upsertInventoryRecords = useCallback((records: InventoryRecord[]) => {
    setInventory((prev) => {
      const map = new Map<string, InventoryRecord>(prev.map((rec) => [rec.menuItemId, rec]));
      records.forEach((rec) => {
        if (rec.menuItemId) {
          map.set(rec.menuItemId, rec);
        }
      });
      const next = Array.from(map.values());
      inventoryRef.current = next;
      return next;
    });
  }, []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [waste, setWaste] = useState<WasteEntry[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [analytics, setAnalytics] = useState<InventoryAnalytics>({
    totalStockValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    pendingPOCount: 0,
    pendingPOValue: 0,
    wasteCostLast30d: 0,
    avgTurnoverDays: 0,
    belowReorderCount: 0,
    topWasteReason: null,
    wasteByReason: [],
    topWasteItems: [],
    stockTurnoverRate: 0,
    categoryBreakdown: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [forecasts, setForecasts] = useState<InventoryForecast[]>([]);
  const [forecastAlerts, setForecastAlerts] = useState<InventoryForecast[]>([]);
  const [isGeneratingForecasts, setIsGeneratingForecasts] = useState(false);

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

    const [invResult, lowResult, supResult, poResult, movResult, wasteResult, analyticsResult, locResult, fcResult, fcAlertsResult] = results;

    if (invResult.status === 'fulfilled') {
      setInventory(invResult.value);
      inventoryRef.current = invResult.value;
      // Clear error if we successfully loaded data
      if (invResult.value.length > 0) {
        setLoadError(null);
      }
    } else {
      const message = invResult.reason instanceof Error ? invResult.reason.message : String(invResult.reason);
      console.error('Critical inventory load failed:', message);
      // Only set error if we don't have existing data
      if (inventoryRef.current.length === 0) {
        setLoadError(message || 'Failed to load inventory items.');
      }
    }

    if (lowResult.status === 'fulfilled') {
      setLowStockItems(lowResult.value);
    } else {
      console.warn('Low stock fetch failed:', lowResult.reason);
    }

    if (supResult.status === 'fulfilled') {
      setSuppliers(supResult.value);
    } else {
      console.warn('Suppliers fetch failed:', supResult.reason);
    }

    if (poResult.status === 'fulfilled') {
      setPurchaseOrders(poResult.value);
    } else {
      console.warn('Purchase orders fetch failed:', poResult.reason);
    }

    if (movResult.status === 'fulfilled') {
      setMovements(movResult.value);
    } else {
      console.warn('Stock movements fetch failed:', movResult.reason);
    }

    if (wasteResult.status === 'fulfilled') {
      setWaste(wasteResult.value);
    } else {
      console.warn('Waste entries fetch failed:', wasteResult.reason);
    }

    if (analyticsResult.status === 'fulfilled') {
      setAnalytics(analyticsResult.value);
    } else {
      console.warn('Inventory analytics fetch failed:', analyticsResult.reason);
    }

    if (locResult.status === 'fulfilled') {
      setLocations(locResult.value);
    } else {
      console.warn('Locations fetch failed:', locResult.reason);
    }

    if (fcResult.status === 'fulfilled') {
      setForecasts(fcResult.value);
    } else {
      setForecasts([]);
      console.warn('Forecasts fetch failed:', fcResult.reason);
    }

    if (fcAlertsResult.status === 'fulfilled') {
      setForecastAlerts(fcAlertsResult.value);
    } else {
      setForecastAlerts([]);
      console.warn('Forecast alerts fetch failed:', fcAlertsResult.reason);
    }

    setIsLoading(false);
  }, []);

  const runForecasting = useCallback(async () => {
    setIsGeneratingForecasts(true);
    try {
      const result = await generateForecasts();
      if (result.success) {
        setForecasts(result.forecasts);
        const critical = result.forecasts.filter(f => f.alertStatus === 'critical' || f.alertStatus === 'warning');
        setForecastAlerts(critical);
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
    joinInventory();
    loadAll();

    const handleInventoryUpdate = () => loadAll();
    const handleInventoryAlert = (data: { type: string; menuItemName: string; stock: number; threshold: number }) => {
      const message = data.type === 'out-of-stock'
        ? `${data.menuItemName} is out of stock.`
        : `${data.menuItemName} is low on stock (${data.stock} <= ${data.threshold}).`;
      setAlerts((prev) => [message, ...prev].slice(0, 5));
      loadAll();
    };

    socket.on('inventory:update', handleInventoryUpdate);
    socket.on('inventory:alert', handleInventoryAlert);

    return () => {
      socket.off('inventory:update', handleInventoryUpdate);
      socket.off('inventory:alert', handleInventoryAlert);
    };
  }, [joinInventory, loadAll, socket]);

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
  };
}
