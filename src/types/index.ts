// ============================================
// SMART ORDERING SYSTEM - TYPE DEFINITIONS
// ============================================

// ============================================
// MODIFIER TYPES
// ============================================

export interface ModifierItem {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  maxSelections: number;
  items: ModifierItem[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  itemId: string;
  itemName: string;
  priceAdjustment: number;
}

// Menu Types
export interface MenuItem {
  id: string;
  sku?: string | null;
  name: string;
  description: string;
  price: number;
  category: MenuCategory;
  emoji: string;
  prepTime: number; // in minutes
  isAvailable: boolean;
  isPopular: boolean;
  requiresKitchen?: boolean; // true = food (goes to kitchen), false = bar only — hidden from customer menu
  modifiers?: ModifierGroup[];
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
  menuItem?: MenuItem;
  quantity: number;
  specialInstructions?: string;
  // API response fields
  id?: string;
  menuItemId?: string;
  menuItemName?: string;
  unitPrice?: number;
  totalPrice?: number;
  status?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Order {
  id: string;
  tableNumber?: number;
  orderNumber?: string;
  customerName?: string;
  customerId?: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  verifiedAt?: Date | string;
  readyAt?: Date | string;
  servedAt?: Date | string;
  completedAt?: Date | string;
  assignedWaiterId?: string;
  restaurantId?: string;
  subtotal: number;
  serviceCharge?: number;
  tax?: number;
  total: number;
  notes?: string;
  specialInstructions?: string;
  requiresKitchen?: boolean;
  deliveryProvider?: string;
  deliveryAddress?: string;
  deliveryOrderId?: string;
  deliveryStatus?: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled';
  isOnlineOrder?: boolean;
  onlineQRCodeId?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  promotionId?: string;
  promotionCode?: string;
  promotionDiscount?: number;
  loyaltyRewardId?: string;
  loyaltyDiscount?: number;
  // Payment approval
  paymentStatus?: 'unpaid' | 'confirmed';
  paymentConfirmedBy?: string;
  paymentConfirmedAt?: string;
  // EBM fiscal
  ebmInvoiceId?: string;
  ebmRcptSign?: string;
  ebmRcptNo?: number;
  ebmFiscalizedAt?: string;
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
export type StaffRole = 'waiter' | 'cashier' | 'supervisor' | 'manager' | 'kitchen' | 'superadmin';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  restaurantId?: string;
  avatar?: string;
  isOnDuty: boolean;
  assignedTables: number[];
  performance: StaffPerformance;
  hireDate: Date;
}

export interface Restaurant {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  currency?: string;
  onlineOrderingEnabled?: boolean;
  socialMediaLinks?: Record<string, string>;
}

export interface OnlineQRCode {
  id: string;
  restaurantId: string;
  codeToken: string;
  qrUrl: string;
  shortLink: string;
  isActive: boolean;
  regeneratedAt?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StaffPerformance {
  ordersServed: number;
  avgServiceTime: number; // in minutes
  rating: number | null; // null = no reviews yet
  totalRevenue: number;
  shiftsThisWeek: number;
}

// KPI Types
export type KPIPeriod = 'daily' | 'weekly' | 'monthly';

export type KPIMetric = 'orders_served' | 'revenue' | 'rating' | 'tables_served' | 'prep_time';

export interface KPI {
  id: number;
  restaurant_id: string;
  staff_role: StaffRole;
  name: string;
  description?: string;
  metric: KPIMetric;
  target_value: number;
  period: KPIPeriod;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  assigned_staff_ids?: string[]; // Staff IDs assigned to this KPI
}

export interface StaffKPIProgress {
  id: number;
  staffId: string;
  kpiId: number;
  currentValue: number;
  periodStart: Date;
  periodEnd: Date;
  achieved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface KPIWithProgress extends Omit<KPI, 'staff_role' | 'target_value' | 'created_by' | 'created_at' | 'updated_at' | 'assigned_staff_ids'> {
  staff_role: StaffRole;
  target_value: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  assigned_staff_ids?: string[];
  progress?: StaffKPIProgress;
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

export interface DashboardKPI {
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
  selectedModifiers?: SelectedModifier[];
  adjustedUnitPrice?: number; // base price + modifier adjustments
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

// ============================================
// LOYALTY PROGRAM TYPES
// ============================================

export interface Customer {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
  totalPoints: number;
  totalSpent: number;
  joinDate: Date;
  lastVisit?: Date;
  visitCount: number;
}

export type LoyaltyTransactionType = 'earned' | 'redeemed' | 'expired' | 'adjusted';

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  orderId?: string;
  transactionType: LoyaltyTransactionType;
  points: number;
  description: string;
  createdAt: Date;
}

export type RewardType = 'discount' | 'free_item' | 'service';

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
  rewardType: RewardType;
  discountPercentage?: number;
  freeItemId?: string;
  isActive: boolean;
}

export interface RewardRedemption {
  id: string;
  customerId: string;
  rewardId: string;
  orderId?: string;
  pointsUsed: number;
  redeemedAt: Date;
}

export interface LoyaltySummary {
  customer: Customer;
  recentTransactions: LoyaltyTransaction[];
  availableRewards: Reward[];
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

// ============================================
// PROMOTIONS TYPES
// ============================================

export interface Promotion {
  id: string;
  restaurantId: string;
  name: string;
  code: string;
  type: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxUses?: number;
  usesCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
}

// ============================================
// RESERVATION TYPES
// ============================================

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  restaurantId: string;
  tableNumber?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
  status: ReservationStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export * from './reviews';

export interface StaffSchedule {
  id: string;
  restaurantId: string;
  staffId: string;
  staffName?: string;
  staffRole?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  role?: string;
  notes?: string;
  createdAt: string;
  arrivedAt?: string;
  departedAt?: string;
}

export interface Review {
  id: string;
  restaurantId: string;
  orderId?: string;
  tableNumber?: number;
  rating: number;
  comment?: string;
  customerName?: string;
  waiterId?: string;
  waiterName?: string;
  createdAt: string;
}

export interface MenuItemReview {
  id: string;
  restaurantId: string;
  menuItemId: string;
  orderId?: string;
  rating: number;
  comment?: string;
  customerName?: string;
  createdAt: string;
}

export interface MenuItemRatingSummary {
  menuItemId: string;
  avgRating: number | null;
  totalCount: number;
}
export * from './inventory';