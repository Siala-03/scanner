import { useState, useEffect, useCallback } from 'react';
import {
  fetchWeeklyRevenue,
  fetchTodayKPIs,
  type WeeklyRevenue,
  type KPIMetrics
} from '../api/analytics';

// Hook to get weekly revenue analytics
export function useWeeklyRevenue() {
  const [data, setData] = useState<WeeklyRevenue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const revenueData = await fetchWeeklyRevenue();
      setData(revenueData);
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch weekly revenue:', err);
      setError('Failed to load revenue data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    refetch: loadData
  };
}

// Hook to get today's KPIs
export function useTodayKPIs() {
  const [data, setData] = useState<KPIMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const kpiData = await fetchTodayKPIs();
      setData(kpiData);
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch today KPIs:', err);
      setError('Failed to load KPI data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    refetch: loadData
  };
}