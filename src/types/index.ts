// ============================================
// SMART ORDERING SYSTEM - TYPE DEFINITIONS
// ============================================

// Menu Types
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: MenuCategory;
  emoji: string;
  prepTime: number; // in minutes
  isAvailable: boolean;
  isPopular: boolean;
}

export type MenuCategory =
  | 'alcoholic-drinks'
  | 'beers'
  | 'wine'
  | 'soft-drinks'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | (string & {});

export interface MenuCategoryInfo {
  id: MenuCategory;
  name: string;
  emoji: string;
}

// Order Types
export type OrderStatus =
'pending' |
'verified' |
'preparing' |
'ready' |
'served' |
'cancelled';

export interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

export interface Order {
  id: string;
  tableNumber: number;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  readyAt?: Date;
  servedAt?: Date;
  assignedWaiterId?: string;
  subtotal: number;
  serviceCharge: number;
  total: number;
  specialInstructions?: string;
  requiresKitchen: boolean;
}

// Table Types
export interface Table {
  id: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  currentOrderId?: string;
  assignedWaiterId?: string;
}

// Staff Types
export type StaffRole = 'waiter' | 'supervisor' | 'manager' | 'kitchen';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  avatar?: string;
  isOnDuty: boolean;
  assignedTables: number[];
  performance: StaffPerformance;
  hireDate: Date;
}

export interface StaffPerformance {
  ordersServed: number;
  avgServiceTime: number; // in minutes
  rating: number; // 1-5
  totalRevenue: number;
  shiftsThisWeek: number;
}

export interface WaiterAssignment {
  waiterId: string;
  tableNumbers: number[];
  shiftStart: Date;
  shiftEnd: Date;
}

export interface StaffCredentials {
  staffId: string;
  username: string;
  password: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: Staff | null;
  role: StaffRole | null;
}

// Analytics Types
export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

export interface HourlyOrders {
  hour: number;
  orders: number;
  revenue: number;
}

export interface CategoryRevenue {
  category: MenuCategory;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface PopularItem {
  item: MenuItem;
  orderCount: number;
  revenue: number;
}

export interface TablePerformance {
  tableNumber: number;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  avgTurnoverTime: number;
}

export interface KPI {
  label: string;
  value: string | number;
  change: number; // percentage change
  trend: 'up' | 'down' | 'neutral';
  icon?: string;
}

// Activity Feed Types
export type ActivityType =
'order_placed' |
'order_verified' |
'order_ready' |
'order_served' |
'order_cancelled' |
'staff_clock_in' |
'staff_clock_out' |
'menu_updated' |
'table_assigned' |
'waiter_called';

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Cart Types (for customer)
export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

// Filter/Sort Types
export interface OrderFilters {
  status?: OrderStatus[];
  tableNumber?: number;
  waiterId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export * from './reviews';
export * from './inventory';