import { Server as SocketServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';

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
  type: 'create' | 'update' | 'delete';
  record?: unknown;
  menuItemId?: string;
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

// Order events (for Kitchen Display System)
export function emitOrderUpdate(data: {
  type: 'create' | 'update' | 'status';
  order?: unknown;
  orderId?: string;
}) {
  if (io) {
    io.to('orders').emit('order:update', data);
  }
}

// Menu events (for real-time menu updates)
export function emitMenuUpdate(data: {
  type: 'update' | 'change';
  message?: string;
}) {
  if (io) {
    io.to('menu').emit('menu:update', data);
    io.emit('menu:changed', data);
  }
}
