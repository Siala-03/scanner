import { useState, useEffect, useCallback } from 'react';
import type { Staff } from '../types';
import { fetchStaff, fetchStaffOnDuty, fetchWaiters, fetchStaffById } from '../api/staff';

function resolveRestaurantId(): string | undefined {
  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (authUserRaw) {
    try {
      const authUser = JSON.parse(authUserRaw);
      const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
      if (typeof fallbackId === 'string' && fallbackId.trim()) {
        localStorage.setItem('restaurantId', fallbackId);
        return fallbackId;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchStaff();
      setStaff(data);
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch staff:', err);
      setError('Failed to load staff data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  return { staff, isLoading, error, refetch: loadStaff };
}

export function useStaffOnDuty() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadStaff = useCallback(async () => {
    try {
      setIsLoading(true);
      const onDutyStaff = await fetchStaffOnDuty();
      setStaff(onDutyStaff);
    } catch (err) {
      console.warn('Failed to fetch staff on duty:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  return { staff, isLoading, refetch: loadStaff };
}

export function useWaiters() {
  const [waiters, setWaiters] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadWaiters = useCallback(async () => {
    try {
      setIsLoading(true);
      const waiterList = await fetchWaiters();
      setWaiters(waiterList);
    } catch (err) {
      console.warn('Failed to fetch waiters:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadWaiters(); }, [loadWaiters]);

  return { waiters, isLoading, refetch: loadWaiters };
}

export function useStaffById(id: string | undefined) {
  const [staffMember, setStaffMember] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStaff = useCallback(async () => {
    if (!id) { setStaffMember(null); setIsLoading(false); return; }
    try {
      setIsLoading(true);
      const data = await fetchStaffById(id);
      setStaffMember(data);
    } catch (err) {
      console.warn('Failed to fetch staff member:', err);
      setStaffMember(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  return { staff: staffMember, isLoading };
}
