import { offlineSync } from '../utils/offlineSync';

// Wrapper for order operations that handles offline mode
export class OfflineAwareAPI {
  static async createOrder(orderData: any): Promise<any> {
    if (!offlineSync.isNetworkOnline()) {
      // Queue for later sync
      await offlineSync.queueOperation({
        type: 'create_order',
        data: orderData,
      });

      // Return a temporary order object
      const tempOrder = {
        id: `temp-${Date.now()}`,
        ...orderData,
        status: 'pending',
        createdAt: new Date().toISOString(),
        orderNumber: `TEMP-${Date.now()}`,
        subtotal: orderData.items.reduce((sum: number, item: any) => sum + (item.unitPrice * item.quantity), 0),
        tax: 0,
        total: orderData.items.reduce((sum: number, item: any) => sum + (item.unitPrice * item.quantity), 0),
        items: orderData.items.map((item: any) => ({
          ...item,
          id: `temp-item-${Date.now()}-${Math.random()}`,
          status: 'pending',
          totalPrice: item.unitPrice * item.quantity,
        })),
      };

      // Cache the temporary order
      await offlineSync.cacheOrder(tempOrder, true);

      return tempOrder;
    }

    // Online: execute immediately
    const { createOrder } = await import('./orders');
    const result = await createOrder(orderData);
    await offlineSync.cacheOrder(result);
    return result;
  }

  static async updateOrderStatus(orderId: string, statusData: any): Promise<any> {
    if (!offlineSync.isNetworkOnline()) {
      // Queue for later sync
      await offlineSync.queueOperation({
        type: 'update_order_status',
        data: { id: orderId, status: statusData },
      });

      // Update cached order
      const cachedOrder = await offlineSync.getCachedOrder(orderId);
      if (cachedOrder) {
        cachedOrder.status = statusData.status;
        cachedOrder.updatedAt = new Date().toISOString();
        if (statusData.status === 'served' || statusData.status === 'cancelled') {
          cachedOrder.completedAt = new Date().toISOString();
        }
        await offlineSync.cacheOrder(cachedOrder, true);
      }

      return cachedOrder || { id: orderId, ...statusData };
    }

    // Online: execute immediately
    const { updateOrderStatus } = await import('./orders');
    const result = await updateOrderStatus(orderId, statusData);
    await offlineSync.cacheOrder(result);
    return result;
  }

  static async updateOrderItemStatus(orderId: string, itemId: string, status: string): Promise<any> {
    if (!offlineSync.isNetworkOnline()) {
      // Queue for later sync
      await offlineSync.queueOperation({
        type: 'update_order_item_status',
        data: { orderId, itemId, status },
      });

      // Update cached order
      const cachedOrder = await offlineSync.getCachedOrder(orderId);
      if (cachedOrder) {
        const item = cachedOrder.items.find(i => i.id === itemId);
        if (item) {
          item.status = status as any;
          if (status === 'ready' || status === 'served') {
            item.completedAt = new Date().toISOString();
          }
        }
        await offlineSync.cacheOrder(cachedOrder, true);
      }

      return cachedOrder || { id: orderId };
    }

    // Online: execute immediately
    const { updateOrderItemStatus } = await import('./orders');
    const result = await updateOrderItemStatus(orderId, itemId, status);
    await offlineSync.cacheOrder(result);
    return result;
  }

  static async cancelOrder(orderId: string): Promise<void> {
    if (!offlineSync.isNetworkOnline()) {
      // Queue for later sync
      await offlineSync.queueOperation({
        type: 'cancel_order',
        data: orderId,
      });

      // Update cached order
      const cachedOrder = await offlineSync.getCachedOrder(orderId);
      if (cachedOrder) {
        cachedOrder.status = 'cancelled';
        cachedOrder.updatedAt = new Date().toISOString();
        cachedOrder.completedAt = new Date().toISOString();
        await offlineSync.cacheOrder(cachedOrder, true);
      }

      return;
    }

    // Online: execute immediately
    const { cancelOrder } = await import('./orders');
    await cancelOrder(orderId);
  }

  static async fetchOrders(status?: string, restaurantId?: string): Promise<any[]> {
    if (!offlineSync.isNetworkOnline()) {
      // Return cached orders
      const cachedOrders = await offlineSync.getCachedOrders();
      return cachedOrders.filter(order =>
        (!status || status === 'all' || order.status === status) &&
        (!restaurantId || order.restaurantId === restaurantId)
      );
    }

    try {
      // Online: fetch from server and cache
      const { fetchOrders } = await import('./orders');
      const orders = await fetchOrders(status, restaurantId);

      // Cache all orders
      for (const order of orders) {
        await offlineSync.cacheOrder(order);
      }

      return orders;
    } catch (error) {
      // If server fails, fall back to cache
      console.warn('Server fetch failed, using cached orders:', error);
      const cachedOrders = await offlineSync.getCachedOrders();
      return cachedOrders.filter(order =>
        (!status || status === 'all' || order.status === status) &&
        (!restaurantId || order.restaurantId === restaurantId)
      );
    }
  }

  static async fetchOrderById(id: string): Promise<any> {
    if (!offlineSync.isNetworkOnline()) {
      // Return cached order
      return await offlineSync.getCachedOrder(id);
    }

    try {
      // Online: fetch from server and cache
      const { fetchOrderById } = await import('./orders');
      const order = await fetchOrderById(id);
      await offlineSync.cacheOrder(order);
      return order;
    } catch (error) {
      // If server fails, fall back to cache
      console.warn('Server fetch failed, using cached order:', error);
      return await offlineSync.getCachedOrder(id);
    }
  }
}