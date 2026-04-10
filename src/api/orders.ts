import { apiRequest } from './http';
import type { Order, CreateOrderInput, UpdateOrderStatusInput } from '../types/orders';

const API_BASE = import.meta.env.VITE_API_URL || '';

// POST seed test orders
export async function seedTestOrders(): Promise<{ message: string; count: number }> {
  return apiRequest<{ message: string; count: number }>(`${API_BASE}/orders/seed`, {
    method: 'POST'
  });
}

// GET all orders
export async function fetchOrders(status?: string, restaurantId?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (restaurantId) params.set('restaurantId', restaurantId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<Order[]>(`${API_BASE}/orders${query}`);
}

// GET orders with date range
export async function fetchOrdersByDateRange(startDate: string, endDate: string, restaurantId?: string): Promise<Order[]> {
  const params = new URLSearchParams({
    startDate: encodeURIComponent(startDate),
    endDate: encodeURIComponent(endDate),
  });
  if (restaurantId) params.set('restaurantId', restaurantId);
  return apiRequest<Order[]>(`${API_BASE}/orders?${params.toString()}`);
}

// GET kitchen orders (pending, preparing, ready)
export async function fetchKitchenOrders(restaurantId?: string): Promise<Order[]> {
  const query = restaurantId ? `?restaurantId=${encodeURIComponent(restaurantId)}` : '';
  return apiRequest<Order[]>(`${API_BASE}/orders/kitchen${query}`);
}

// GET single order
export async function fetchOrderById(id: string): Promise<Order> {
  return apiRequest<Order>(`${API_BASE}/orders/${id}`);
}

// POST create new order
export async function createOrder(order: CreateOrderInput): Promise<Order> {
  return apiRequest<Order>(`${API_BASE}/orders`, {
    method: 'POST',
    json: order,
  });
}

// PUT update order status
export async function updateOrderStatus(
  id: string,
  status: UpdateOrderStatusInput
): Promise<Order> {
  const body: any = { status: status.status };
  if (status.assignedTo !== undefined) {
    body.assigned_to = status.assignedTo;
  }
  return apiRequest<Order>(`${API_BASE}/orders/${id}/status`, {
    method: 'PUT',
    json: body,
  });
}

// PATCH update item status
export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  status: string
): Promise<Order> {
  return apiRequest<Order>(`${API_BASE}/orders/${orderId}/items/${itemId}`, {
    method: 'PATCH',
    json: { status },
  });
}

// DELETE cancel order
export async function cancelOrder(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/orders/${id}`, {
    method: 'DELETE',
  });
}
