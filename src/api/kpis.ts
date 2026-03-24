import { KPI, KPIWithProgress } from '../types';

const API_BASE = '/api';

export async function getKPIs(): Promise<KPI[]> {
  const response = await fetch(`${API_BASE}/kpis`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch KPIs');
  }

  return response.json();
}

export async function createKPI(kpi: { staffRole: string; name: string; description?: string; metric: string; targetValue: number; period: string; assignedStaffIds?: string[] }): Promise<KPI> {
  const response = await fetch(`${API_BASE}/kpis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(kpi),
  });

  if (!response.ok) {
    throw new Error('Failed to create KPI');
  }

  return response.json();
}

export async function getStaffKPIs(): Promise<KPIWithProgress[]> {
  const response = await fetch(`${API_BASE}/kpis/staff`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch staff KPIs');
  }

  return response.json();
}

export async function updateKPIProgress(kpiId: number, currentValue: number): Promise<void> {
  const response = await fetch(`${API_BASE}/kpis/progress/${kpiId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({ currentValue }),
  });

  if (!response.ok) {
    throw new Error('Failed to update KPI progress');
  }
}

export async function deleteKPI(kpiId: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/kpis/${kpiId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to delete KPI');
  }

  return { success: true };
}