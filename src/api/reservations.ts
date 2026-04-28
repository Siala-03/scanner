import { apiRequest } from './http';
import { Reservation } from '../types';

export async function getReservations(restaurantId: string, date?: string, status?: string): Promise<Reservation[]> {
  const params = new URLSearchParams({ restaurantId });
  if (date) params.set('date', date);
  if (status) params.set('status', status);
  return apiRequest(`/reservations?${params}`);
}

export async function checkAvailability(restaurantId: string, date: string): Promise<Reservation[]> {
  const params = new URLSearchParams({ restaurantId, date });
  return apiRequest(`/reservations/availability?${params}`, { includeAuthHeaders: false });
}

export async function createReservation(data: {
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes?: number;
  tableNumber?: number;
  notes?: string;
}): Promise<Reservation> {
  return apiRequest('/reservations', { method: 'POST', json: data, includeAuthHeaders: false });
}

export async function updateReservation(id: string, data: {
  status?: string;
  tableNumber?: number;
  notes?: string;
}): Promise<Reservation> {
  return apiRequest(`/reservations/${id}`, { method: 'PUT', json: data });
}

export async function cancelReservation(id: string): Promise<void> {
  return apiRequest(`/reservations/${id}`, { method: 'DELETE' });
}
