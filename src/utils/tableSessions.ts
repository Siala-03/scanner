import type { Order } from '../types';
import { apiRequest } from '../api/http';

export const TABLE_SESSION_PENDING_CLOSE_MS = 10 * 60 * 1000;

type TableSessionStatus = 'active' | 'pending_close' | 'closed';

export interface TableServiceSession {
  id: string;
  restaurant_id: string;
  table_number: number;
  status: TableSessionStatus;
  started_at: string;
  last_activity_at: string;
  receipt_printed_at?: string;
  pending_close_at?: string;
  closed_at?: string;
}

function getRestaurantId(): string | null {
  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (!authUserRaw) return null;

  try {
    const authUser = JSON.parse(authUserRaw);
    const fallback = authUser?.restaurantId || authUser?.restaurant_id;
    return typeof fallback === 'string' && fallback.trim() ? fallback : null;
  } catch {
    return null;
  }
}

function toClientSession(raw: any): TableServiceSession {
  return {
    id: raw.id,
    restaurant_id: raw.restaurant_id,
    table_number: raw.table_number,
    status: raw.status,
    started_at: raw.started_at,
    last_activity_at: raw.last_activity_at,
    receipt_printed_at: raw.receipt_printed_at ?? undefined,
    pending_close_at: raw.pending_close_at ?? undefined,
    closed_at: raw.closed_at ?? undefined,
  } as TableServiceSession;
}

function emitSessionEvent() {
  window.dispatchEvent(new Event('tableSessionsUpdated'));
}

export async function closeExpiredTableSessions(_tableNumber?: number): Promise<void> {
  // Expiry is handled server-side on every table-session API call.
}

export async function getActiveTableSession(tableNumber: number): Promise<TableServiceSession | null> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return null;

  const params = new URLSearchParams({
    restaurantId,
    tableNumber: String(tableNumber),
  });

  const response = await apiRequest<{ session: any | null }>(`/table-sessions/current?${params.toString()}`);
  const session = response.session ? toClientSession(response.session) : null;
  emitSessionEvent();
  return session;
}

export async function recordTableSessionActivity(tableNumber: number): Promise<TableServiceSession | null> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return null;

  const response = await apiRequest<{ session: any }>('/table-sessions/activity', {
    method: 'POST',
    json: {
      restaurantId,
      tableNumber,
    },
  });
  const session = response.session ? toClientSession(response.session) : null;
  emitSessionEvent();
  return session;
}

export async function markTableSessionPendingCloseFromReceipt(
  tableNumber: number,
  pendingMs: number = TABLE_SESSION_PENDING_CLOSE_MS
): Promise<TableServiceSession | null> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return null;

  const pendingCloseMinutes = Math.max(1, Math.round(pendingMs / 60000));
  const response = await apiRequest<{ session: any }>('/table-sessions/receipt-printed', {
    method: 'POST',
    json: {
      restaurantId,
      tableNumber,
      pendingCloseMinutes,
    },
  });
  const session = response.session ? toClientSession(response.session) : null;
  emitSessionEvent();
  return session;
}

export function isOrderInTableSession(order: Order, session: TableServiceSession | null): boolean {
  if (!session) return false;

  const created = new Date(order.createdAt).getTime();
  if (Number.isNaN(created)) return false;

  const started = new Date(session.started_at).getTime();
  if (Number.isNaN(started) || created < started) return false;

  if (session.closed_at) {
    const closed = new Date(session.closed_at).getTime();
    if (!Number.isNaN(closed) && created > closed) return false;
  }

  return true;
}
