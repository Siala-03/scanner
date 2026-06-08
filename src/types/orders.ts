// ============================================
// ORDER TYPES
// ============================================

import { SelectedModifier } from './index';

export type OrderStatus = 
  | 'pending' 
  | 'preparing' 
  | 'ready' 
  | 'served' 
  | 'cancelled';

export type OrderItemStatus = 
  | 'pending' 
  | 'preparing' 
  | 'ready' 
  | 'served';

export interface OrderModifier {
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers?: string[];
  selectedModifiers?: SelectedModifier[];
  notes?: string;
  status: OrderItemStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  tableNumber?: number;
  customerName?: string;
  customerId?: string;
  restaurantId?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdBy?: string;
  assignedTo?: string;
  deliveryProvider?: string;
  deliveryAddress?: string;
  deliveryOrderId?: string;
  deliveryStatus?: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled';
  loyaltyRewardId?: string;
  loyaltyDiscount?: number;
  loyaltyFreeItemId?: string;
  promotionId?: string;
  promotionCode?: string;
  promotionDiscount?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// For creating new orders
export interface CreateOrderInput {
  tableNumber?: number;
  customerName?: string;
  customerId?: string;
  restaurantId?: string;
  items: {
    menuItemId: string;
    menuItemName: string;
    quantity: number;
    unitPrice: number;
    modifiers?: string[];
    selectedModifiers?: SelectedModifier[];
    notes?: string;
  }[];
  notes?: string;
  createdBy?: string;
  deliveryProvider?: string;
  deliveryAddress?: string;
  loyaltyRewardId?: string;
  promotionCode?: string;
  requiresKitchen?: boolean;
}

// For updating order status
export interface UpdateOrderStatusInput {
  status: OrderStatus;
  assignedTo?: string;
  cancellationReason?: string;  // required when status = 'cancelled'
  cancelledBy?: string;         // staff name who rejected
}
