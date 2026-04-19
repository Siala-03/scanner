import { Server as SocketServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { toCamelCase } from './utils/camelCase.js';

let io: SocketServer | null = null;

export function initSocket(httpServer: HTTPServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join rooms based on role
    socket.on('join:role', (role: string) => {
      socket.join(`role:${role}`);
      console.log(`Socket ${socket.id} joined role:${role}`);
    });

    // Join inventory room for real-time updates
    socket.on('join:inventory', () => {
      socket.join('inventory');
      console.log(`Socket ${socket.id} joined inventory room`);
    });

    // Join orders room
    socket.on('join:orders', () => {
      socket.join('orders');
      console.log(`Socket ${socket.id} joined orders room`);
    });

    // Join menu room for real-time updates
    socket.on('join:menu', () => {
      socket.join('menu');
      console.log(`Socket ${socket.id} joined menu room`);
    });

    // Join supplier room for supplier portal notifications
    socket.on('join:supplier', (supplierId: string) => {
      socket.join(`supplier:${supplierId}`);
      console.log(`Socket ${socket.id} joined supplier:${supplierId}`);
    });

    // Join restaurant room for client notifications
    socket.on('join:restaurant', (restaurantId: string) => {
      socket.join(`restaurant:${restaurantId}`);
      console.log(`Socket ${socket.id} joined restaurant:${restaurantId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

export function getIO(): SocketServer | null {
  return io;
}

// Emit events to specific rooms
export function emitInventoryUpdate(data: {
  type: 'create' | 'update' | 'delete' | 'recipe_change' | 'cycle_count_created' | 'cycle_count_completed' | 'cycle_count_cancelled';
  record?: unknown;
  item?: unknown;
  itemId?: string;
  menuItemId?: string;
  locationId?: string;
  quantity?: number;
  cycleCountId?: string;
}) {
  if (io) {
    io.to('inventory').emit('inventory:update', data);
  }
}

export function emitPurchaseOrderUpdate(data: {
  type: 'create' | 'update' | 'status';
  order?: unknown;
  orderId?: string;
}) {
  if (io) {
    io.to('inventory').emit('purchase-order:update', data);
  }
}

export function emitWasteRecorded(data: {
  type: 'create';
  waste?: unknown;
}) {
  if (io) {
    io.to('inventory').emit('waste:update', data);
  }
}

export function emitStockMovement(data: {
  type: 'create';
  movement?: unknown;
}) {
  if (io) {
    io.to('inventory').emit('movement:update', data);
  }
}

export function emitSupplierUpdate(data: {
  type: 'create' | 'update' | 'delete';
  supplier?: unknown;
  supplierId?: string;
}) {
  if (io) {
    io.to('inventory').emit('supplier:update', data);
  }
}

// Order events (for Kitchen Display System and Waiter Dashboard)
export function emitOrderUpdate(data: {
  type: 'create' | 'update' | 'status';
  order?: unknown;
  orderId?: string;
}) {
  if (io) {
    const payload = {
      ...data,
      order: data.order ? toCamelCase(data.order) : undefined
    };

    // Emit to all order listeners
    io.to('orders').emit('order:update', payload);

    // Emit to restaurant-specific room
    const restaurantId = (payload.order as any)?.restaurantId || (payload.order as any)?.restaurant_id;
    if (restaurantId) {
      io.to(`restaurant:${restaurantId}`).emit('order:update', payload);
    }

    // Also emit to waiter role room so waiters always get order updates
    // regardless of which restaurant room they joined
    io.to('role:waiter').emit('order:update', payload);
  }
}

export function emitInventoryAlert(data: {
  type: 'low-stock' | 'out-of-stock' | 'low_stock' | 'out_of_stock';
  menuItemId?: string;
  menuItemName?: string;
  itemId?: string;
  itemName?: string;
  locationId?: string;
  stock: number;
  threshold: number;
}) {
  if (io) {
    io.to('inventory').emit('inventory:alert', data);
  }
}

// Call waiter notification to all waiters on duty via socket
export function emitWaiterCall(data: {
  tableNumber: number;
  timestamp: Date;
}) {
  if (io) {
    io.to('role:waiter').emit('waiter:call', data);
    console.log(`Waiter call emitted for table ${data.tableNumber}`);
  }
}

// Menu events for real-time updates
export function emitMenuUpdate(data: {
  type: string;
  message?: string;
}) {
  if (io) {
    io.to('menu').emit('menu:update', data);
    console.log(`Menu update emitted: ${data.type}`);
  }
}
