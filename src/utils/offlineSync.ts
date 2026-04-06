import Dexie, { Table } from 'dexie';
import { Order, CreateOrderInput, UpdateOrderStatusInput } from '../types/orders';

// Types for pending operations
export interface PendingOperation {
  id?: number;
  type: 'create_order' | 'update_order_status' | 'update_order_item_status' | 'cancel_order';
  data: any;
  timestamp: number;
  retryCount: number;
}

export interface CachedOrder extends Order {
  cachedAt: number;
  isDirty: boolean; // true if locally modified
}

export class OfflineDatabase extends Dexie {
  pendingOperations!: Table<PendingOperation>;
  cachedOrders!: Table<CachedOrder>;

  constructor() {
    super('RestaurantOfflineDB');
    this.version(1).stores({
      pendingOperations: '++id, type, timestamp',
      cachedOrders: 'id, orderNumber, tableNumber, status, cachedAt, isDirty',
    });
  }
}

const db = new OfflineDatabase();

export class OfflineSyncManager {
  private static instance: OfflineSyncManager;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;

  private constructor() {
    this.setupNetworkListeners();
    this.registerBackgroundSync();
  }

  static getInstance(): OfflineSyncManager {
    if (!OfflineSyncManager.instance) {
      OfflineSyncManager.instance = new OfflineSyncManager();
    }
    return OfflineSyncManager.instance;
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('Network: Online');
      this.isOnline = true;
      this.syncPendingOperations();
    });

    window.addEventListener('offline', () => {
      console.log('Network: Offline');
      this.isOnline = false;
    });
  }

  private async registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('background-sync');
      } catch (error) {
        console.log('Background sync not supported');
      }
    }
  }

  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  // Store operation for later sync
  async queueOperation(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    await db.pendingOperations.add({
      ...operation,
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  // Cache order locally
  async cacheOrder(order: Order, isDirty: boolean = false): Promise<void> {
    await db.cachedOrders.put({
      ...order,
      cachedAt: Date.now(),
      isDirty,
    });
  }

  // Get cached orders
  async getCachedOrders(): Promise<CachedOrder[]> {
    return await db.cachedOrders.orderBy('cachedAt').reverse().toArray();
  }

  // Get cached order by ID
  async getCachedOrder(id: string): Promise<CachedOrder | undefined> {
    return await db.cachedOrders.get(id);
  }

  // Sync pending operations
  async syncPendingOperations(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) return;

    this.syncInProgress = true;
    console.log('Starting sync of pending operations...');

    try {
      const pendingOps = await db.pendingOperations.orderBy('timestamp').toArray();

      for (const op of pendingOps) {
        try {
          await this.executeOperation(op);
          await db.pendingOperations.delete(op.id!);
          console.log(`Synced operation: ${op.type}`);
        } catch (error) {
          console.error(`Failed to sync operation ${op.type}:`, error);
          op.retryCount++;

          if (op.retryCount >= 3) {
            // Remove failed operations after 3 retries
            await db.pendingOperations.delete(op.id!);
            console.warn(`Removed failed operation after 3 retries: ${op.type}`);
          } else {
            // Update retry count
            await db.pendingOperations.update(op.id!, { retryCount: op.retryCount });
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async executeOperation(op: PendingOperation): Promise<void> {
    const { createOrder, updateOrderStatus, updateOrderItemStatus, cancelOrder } = await import('../api/orders');

    switch (op.type) {
      case 'create_order':
        await createOrder(op.data as CreateOrderInput);
        break;
      case 'update_order_status':
        const statusData = op.data as { id: string; status: UpdateOrderStatusInput };
        await updateOrderStatus(statusData.id, statusData.status);
        break;
      case 'update_order_item_status':
        const itemData = op.data as { orderId: string; itemId: string; status: string };
        await updateOrderItemStatus(itemData.orderId, itemData.itemId, itemData.status);
        break;
      case 'cancel_order':
        await cancelOrder(op.data as string);
        break;
      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  // Clear old cached data
  async cleanupOldCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - maxAge;
    await db.cachedOrders.where('cachedAt').below(cutoff).delete();
  }

  // Get pending operations count
  async getPendingOperationsCount(): Promise<number> {
    return await db.pendingOperations.count();
  }
}

export const offlineSync = OfflineSyncManager.getInstance();