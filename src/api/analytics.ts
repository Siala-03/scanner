import { apiRequest } from './http';

const API_BASE = 'https://scanner-3cku.onrender.com/api/analytics';

// Revenue analytics
export interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

export interface WeeklyRevenue {
  thisWeek: RevenueData[];
  lastWeek: RevenueData[];
  totalThisWeek: number;
  totalLastWeek: number;
  growth: number;
}

// KPI data
export interface KPIMetrics {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  popularItems: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
  peakHours: Array<{
    hour: number;
    orders: number;
  }>;
}

// Fetch weekly revenue
export async function fetchWeeklyRevenue(): Promise<WeeklyRevenue> {
  return apiRequest<WeeklyRevenue>(`${API_BASE}/revenue/weekly`);
}

// Fetch today's KPIs
export async function fetchTodayKPIs(): Promise<KPIMetrics> {
  return apiRequest<KPIMetrics>(`${API_BASE}/kpis/today`);
}

// Fetch revenue by date range
export async function fetchRevenueByDateRange(
  startDate: string,
  endDate: string
): Promise<RevenueData[]> {
  return apiRequest<RevenueData[]>(
    `${API_BASE}/revenue/range?start=${startDate}&end=${endDate}`
  );
}