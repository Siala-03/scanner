import { apiRequest } from './http';

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '';

export interface SupplierUser {
  id: string;
  supplierId: string;
  supplierName: string;
  email: string;
  name: string;
  phone?: string;
}

export interface SupplierOrder {
  id: string;
  supplier_id: string;
  supplier_name: string;
  restaurant_id?: string;
  restaurant_name?: string;
  status: 'draft' | 'sent' | 'confirmed' | 'shipped' | 'partial' | 'received' | 'cancelled';
  items: {
    menuItemId: string;
    menuItemName: string;
    orderedQty: number;
    receivedQty: number;
    unitCost: number;
    totalCost: number;
  }[];
  total_cost: number;
  expected_delivery?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  shipped_at?: string;
  shipped_by?: string;
  received_at?: string;
  received_by?: string;
  received_confirmed_at?: string;
  delivery_address?: string;
  tracking_number?: string;
  carrier?: string;
  status_history?: {
    id: string;
    status: string;
    changed_by: string;
    changed_by_type: string;
    notes?: string;
    created_at: string;
  }[];
}

export interface SupplierStats {
  pending_orders: number;
  shipped_orders: number;
  completed_orders: number;
  partial_orders: number;
  pending_value: number;
  completed_value: number;
}

export interface SupplierPortalAccessProvisionResult {
  id: string;
  supplierId: string;
  supplierName: string;
  email: string;
  name: string;
  phone?: string | null;
  password: string;
  isNew: boolean;
}

export interface SupplierPortalAccessInfo {
  exists: boolean;
  supplierId: string;
  supplierName?: string;
  id?: string;
  email?: string;
  name?: string;
  phone?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('supplier_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function supplierLogin(email: string, password: string): Promise<SupplierUser> {
  return apiRequest<SupplierUser>(`${API_BASE}/supplier-auth/login`, {
    method: 'POST',
    json: { email, password },
  });
}

export async function supplierSignUp(data: {
  supplierId: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
}): Promise<SupplierUser> {
  return apiRequest<SupplierUser>(`${API_BASE}/supplier-auth/signup`, {
    method: 'POST',
    json: data,
  });
}

export async function getSupplierMe(): Promise<SupplierUser> {
  return apiRequest<SupplierUser>(`${API_BASE}/supplier-auth/me`, {
    headers: getAuthHeader(),
  });
}

export async function fetchSupplierOrders(status?: string): Promise<SupplierOrder[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<SupplierOrder[]>(`${API_BASE}/supplier-portal/orders${query}`, {
    headers: getAuthHeader(),
  });
}

export async function fetchSupplierOrder(id: string): Promise<SupplierOrder> {
  return apiRequest<SupplierOrder>(`${API_BASE}/supplier-portal/orders/${id}`, {
    headers: getAuthHeader(),
  });
}

export async function confirmSupplierOrder(id: string, notes?: string): Promise<SupplierOrder> {
  return apiRequest<SupplierOrder>(`${API_BASE}/supplier-portal/orders/${id}/confirm`, {
    method: 'POST',
    headers: getAuthHeader(),
    json: { notes },
  });
}

export async function shipSupplierOrder(
  id: string,
  data: { carrier?: string; tracking_number?: string; notes?: string }
): Promise<SupplierOrder> {
  return apiRequest<SupplierOrder>(`${API_BASE}/supplier-portal/orders/${id}/ship`, {
    method: 'POST',
    headers: getAuthHeader(),
    json: data,
  });
}

export async function fetchSupplierStats(): Promise<SupplierStats> {
  return apiRequest<SupplierStats>(`${API_BASE}/supplier-portal/stats`, {
    headers: getAuthHeader(),
  });
}

export async function provisionSupplierPortalAccess(data: {
  supplierId: string;
  email: string;
  name: string;
  phone?: string;
  password?: string;
}): Promise<SupplierPortalAccessProvisionResult> {
  return apiRequest<SupplierPortalAccessProvisionResult>(`${API_BASE}/supplier-auth/manager-access`, {
    method: 'POST',
    json: data,
  });
}

export async function fetchSupplierPortalAccess(supplierId: string): Promise<SupplierPortalAccessInfo> {
  return apiRequest<SupplierPortalAccessInfo>(`${API_BASE}/supplier-auth/manager-access/${supplierId}`);
}

export function buildSupplierToken(user: SupplierUser): string {
  // Canonical token format used by backend: supplierId:userId
  return `${user.supplierId}:${user.id}`;
}

export function setSupplierToken(token: string) {
  localStorage.setItem('supplier_token', token);
}

export function getSupplierToken(): string | null {
  return localStorage.getItem('supplier_token');
}

export function clearSupplierToken() {
  localStorage.removeItem('supplier_token');
}
