import { useState, useEffect } from 'react';
import { KPI, KPIWithProgress } from '../types';
import { getKPIs, getStaffKPIs, createKPI as apiCreateKPI } from '../api/kpis';

export function useKPIs() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    try {
      setIsLoading(true);
      const data = await getKPIs();
      setKpis(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch KPIs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refetch();
  }, []);

  const createKPI = async (kpiData: {
    staffRole: string;
    name: string;
    description?: string;
    metric: string;
    targetValue: number;
    period: string;
    assignedStaffIds?: string[];
  }) => {
    try {
      const newKPI = await apiCreateKPI(kpiData);
      setKpis(prev => [newKPI, ...prev]);
      return newKPI;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create KPI');
      throw err;
    }
  };

  return { kpis, isLoading, error, refetch, createKPI };
}

export function useStaffKPIs() {
  const [kpis, setKpis] = useState<KPIWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    try {
      setIsLoading(true);
      const data = await getStaffKPIs();
      setKpis(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch staff KPIs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refetch();
  }, []);

  useEffect(() => {
    const onFocus = () => refetch();
    const onRestaurantChange = () => refetch();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('restaurantIdChanged', onRestaurantChange);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('restaurantIdChanged', onRestaurantChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { kpis, isLoading, error, refetch };
}
