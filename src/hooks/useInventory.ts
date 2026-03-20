import { useCallback, useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import {
  fetchInventory,
  fetchLowStockItems,
  fetchSuppliers,
  fetchPurchaseOrders,
  fetchMovements,
  fetchWasteEntries,
  computeInventoryAnalytics,
} from '../api/inventory';
import type {
  InventoryRecord,
  Supplier,
  PurchaseOrder,
  StockMovement,
  WasteEntry,
  InventoryAnalytics,
} from '../types/inventory';

export function useInventoryData() {
  const { joinInventory, socket } = useSocket();
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [waste, setWaste] = useState<WasteEntry[]>([]);
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

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [inv, low, sup, po, mov, wasteEntries, analyticsData] = await Promise.all([
        fetchInventory(),
        fetchLowStockItems(),
        fetchSuppliers(),
        fetchPurchaseOrders(),
        fetchMovements({ limit: 200 }),
        fetchWasteEntries({ limit: 200 }),
        computeInventoryAnalytics(),
      ]);
      setInventory(inv);
      setLowStockItems(low);
      setSuppliers(sup);
      setPurchaseOrders(po);
      setMovements(mov);
      setWaste(wasteEntries);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to load inventory data', err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load inventory data right now. Please check your network or try again.');
    } finally {
      setIsLoading(false);
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
    analytics,
    alerts,
    isLoading,
    loadError,
    refresh: loadAll,
  };
}
