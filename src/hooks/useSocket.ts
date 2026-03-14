import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Default to production backend URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://scanner-3cku.onrender.com';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    try {
      socket = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        timeout: 5000,
      });
    } catch (err) {
      console.warn('Failed to create socket:', err);
      // Return a dummy socket that does nothing
      return {
        on: () => {},
        off: () => {},
        emit: () => {},
        connected: false
      } as unknown as Socket;
    }
  }
  return socket;
}

export function useSocket() {
  const socket = getSocket();

  useEffect(() => {
    try {
      if (!socket.connected) {
        socket.connect();
      }
    } catch (err) {
      console.warn('Socket connection failed:', err);
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
