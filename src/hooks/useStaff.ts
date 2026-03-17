import { useState, useEffect, useCallback } from 'react';
import type { Staff } from '../types';
import { fetchStaff, fetchStaffOnDuty, fetchWaiters, fetchStaffById } from '../api/staff';
import { getSocket } from './useSocket';

// Hook to get staff from backend with real-time sync
export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch staff from backend
  const loadStaff = useCallback(async () => {
    try {
      setIsLoading(true);
      const backendStaff = await fetchStaff();
      setStaff(backendStaff);
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch staff from backend:', err);
      setError('Failed to load staff data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for staff updates via WebSocket
  useEffect(() => {
    loadStaff();

    try {
      const socket = getSocket();

      const handleStaffUpdate = () => {
        console.log('Staff update received, reloading...');
        loadStaff();
      };

      socket.on('staff:update', handleStaffUpdate);
      socket.on('staff:changed', handleStaffUpdate);

      return () => {
        socket.off('staff:update', handleStaffUpdate);
        socket.off('staff:changed', handleStaffUpdate);
      };
    } catch (err) {
      console.warn('Socket not available for staff:', err);
    }
  }, [loadStaff]);

  return {
    staff,
    isLoading,
    error,
    refetch: loadStaff
  };
}

// Hook to get staff on duty
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

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  return {
    staff,
    isLoading,
    refetch: loadStaff
  };
}

// Hook to get waiters
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

  useEffect(() => {
    loadWaiters();
  }, [loadWaiters]);

  return {
    waiters,
    isLoading,
    refetch: loadWaiters
  };
}

// Hook to get staff by ID
export function useStaffById(id: string | undefined) {
  const [staffMember, setStaffMember] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStaff = useCallback(async () => {
    if (!id) {
      setStaffMember(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const staff = await fetchStaffById(id);
      setStaffMember(staff);
    } catch (err) {
      console.warn('Failed to fetch staff member:', err);
      setStaffMember(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  return {
    staff: staffMember,
    isLoading
  };
}