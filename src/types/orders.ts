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
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdBy?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// For creating new orders
export interface CreateOrderInput {
  tableNumber?: number;
  customerName?: string;
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
}

// For updating order status
export interface UpdateOrderStatusInput {
  status: OrderStatus;
  assignedTo?: string;
}
