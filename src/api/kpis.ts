import { KPI, KPIWithProgress } from '../types';

// KPI management is not yet backed by Supabase — return safe empty values
// so supervisor dashboard doesn't crash while the feature is pending.

export async function getKPIs(): Promise<KPI[]> {
  return [];
}

export async function createKPI(kpi: Omit<KPI, 'id' | 'restaurantId' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<KPI> {
  throw new Error('KPI management not yet implemented');
}

export async function getStaffKPIs(): Promise<KPIWithProgress[]> {
  return [];
}

export async function assignKPI(_staffId: string, _kpiId: number): Promise<void> {}
export async function unassignKPI(_staffId: string, _kpiId: number): Promise<void> {}
export async function updateKPIProgress(_kpiId: number, _currentValue: number): Promise<void> {}
export async function deleteKPI(_kpiId: number): Promise<{ success: boolean }> {
  return { success: true };
}
