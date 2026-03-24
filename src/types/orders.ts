// ============================================
// ORDER TYPES
// ============================================

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
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// For creating new orders
export interface CreateOrderInput {
  tableNumber?: number;
  customerName?: string;
  customerId?: string;
  items: {
    menuItemId: string;
    menuItemName: string;
    quantity: number;
    unitPrice: number;
    modifiers?: string[];
    notes?: string;
  }[];
  notes?: string;
  createdBy?: string;
  deliveryProvider?: string;
  deliveryAddress?: string;
  loyaltyRewardId?: string;
}

// For updating order status
export interface UpdateOrderStatusInput {
  status: OrderStatus;
  assignedTo?: string;
}
