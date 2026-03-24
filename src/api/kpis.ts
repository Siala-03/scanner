import { KPI, KPIWithProgress } from '../types';
import { apiRequest } from './http';

const API_BASE = '/api';

export async function getKPIs(): Promise<KPI[]> {
  return apiRequest<KPI[]>(`${API_BASE}/kpis`);
}

export async function createKPI(kpi: { staffRole: string; name: string; description?: string; metric: string; targetValue: number; period: string; assignedStaffIds?: string[] }): Promise<KPI> {
  return apiRequest<KPI>(`${API_BASE}/kpis`, {
    method: 'POST',
    json: kpi,
  });
}

export async function getStaffKPIs(): Promise<KPIWithProgress[]> {
  return apiRequest<KPIWithProgress[]>(`${API_BASE}/kpis/staff`);
}

export async function updateKPIProgress(kpiId: number, currentValue: number): Promise<void> {
  await apiRequest<void>(`${API_BASE}/kpis/progress/${kpiId}`, {
    method: 'PUT',
    json: { currentValue },
  });
}

export async function deleteKPI(kpiId: number): Promise<{ success: boolean }> {
  await apiRequest<void>(`${API_BASE}/kpis/${kpiId}`, {
    method: 'DELETE',
  });
  return { success: true };
}