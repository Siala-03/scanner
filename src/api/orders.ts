import { apiRequest } from './http';
import type { Order, CreateOrderInput, UpdateOrderStatusInput } from '../types/orders';

const API_BASE = '/api';

// POST seed test orders
export async function seedTestOrders(): Promise<{ message: string; count: number }> {
  return apiRequest<{ message: string; count: number }>(`${API_BASE}/orders/seed`, {
    method: 'POST'
  });
}

// GET all orders
export async function fetchOrders(status?: string): Promise<Order[]> {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return apiRequest<Order[]>(`${API_BASE}/orders${query}`);
}

// GET kitchen orders (pending, preparing, ready)
export async function fetchKitchenOrders(): Promise<Order[]> {
  return apiRequest<Order[]>(`${API_BASE}/orders/kitchen`);
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
  return apiRequest<Order>(`${API_BASE}/orders/${id}/status`, {
    method: 'PUT',
    json: status,
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
