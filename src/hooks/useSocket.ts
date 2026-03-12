import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function useSocket() {
  const socket = getSocket();

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [socket]);

  const joinInventory = useCallback(() => {
    socket.emit('join:inventory');
  }, [socket]);

  const joinOrders = useCallback(() => {
    socket.emit('join:orders');
  }, [socket]);

  const joinRole = useCallback((role: string) => {
    socket.emit('join:role', role);
  }, [socket]);

  return {
    socket,
    joinInventory,
    joinOrders,
    joinRole,
  };
}

// Event types for type safety
export interface InventoryUpdate {
  type: 'create' | 'update' | 'delete';
  record?: unknown;
  menuItemId?: string;
}

export interface PurchaseOrderUpdate {
  type: 'create' | 'update' | 'status';
  order?: unknown;
  orderId?: string;
}

export interface WasteUpdate {
  type: 'create';
  waste?: unknown;
}

export interface MovementUpdate {
  type: 'create';
  movement?: unknown;
}

export interface SupplierUpdate {
  type: 'create' | 'update' | 'delete';
  supplier?: unknown;
  supplierId?: string;
}
