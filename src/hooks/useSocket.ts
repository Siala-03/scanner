import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Custom event emitter for cross-component communication
type EventCallback = (...args: unknown[]) => void;
const eventListeners: Record<string, EventCallback[]> = {};

export function emitEvent(event: string, ...args: unknown[]) {
  const callbacks = eventListeners[event] || [];
  callbacks.forEach(cb => cb(...args));
}

export function onEvent(event: string, callback: EventCallback) {
  if (!eventListeners[event]) {
    eventListeners[event] = [];
  }
  eventListeners[event].push(callback);
  return () => {
    const idx = eventListeners[event].indexOf(callback);
    if (idx > -1) eventListeners[event].splice(idx, 1);
  };
}

export function useSupabaseRealtime() {
  const ordersChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inventoryChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const subscribeToOrders = useCallback((restaurantId: string, onUpdate: () => void) => {
    // Clean up old subscription
    if (ordersChannelRef.current) {
      supabase.removeChannel(ordersChannelRef.current);
    }

    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => {
        onUpdate();
        emitEvent('orders:update');
      })
      .subscribe();

    ordersChannelRef.current = channel;
    return channel;
  }, []);

  const subscribeToInventory = useCallback((restaurantId: string, onUpdate: () => void) => {
    if (inventoryChannelRef.current) {
      supabase.removeChannel(inventoryChannelRef.current);
    }

    const channel = supabase
      .channel(`inventory-${restaurantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory_records',
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => {
        onUpdate();
        emitEvent('inventory:update');
      })
      .subscribe();

    inventoryChannelRef.current = channel;
    return channel;
  }, []);

  const cleanup = useCallback(() => {
    if (ordersChannelRef.current) {
      supabase.removeChannel(ordersChannelRef.current);
    }
    if (inventoryChannelRef.current) {
      supabase.removeChannel(inventoryChannelRef.current);
    }
  }, []);

  return {
    subscribeToOrders,
    subscribeToInventory,
    cleanup
  };
}

// Legacy socket wrapper - now uses Supabase Realtime
// For backward compatibility with existing code
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function getSocket() {
  // Return a dummy socket that uses Supabase events instead
  return {
    on: (event: string, callback: EventCallback) => {
      return onEvent(event, callback);
    },
    off: (event: string, callback?: EventCallback) => {
      if (callback) {
        const idx = (eventListeners[event] || []).indexOf(callback);
        if (idx > -1) eventListeners[event].splice(idx, 1);
      } else {
        delete eventListeners[event];
      }
    },
    emit: (event: string, ...args: unknown[]) => {
      // Emit to local event system
      emitEvent(event, ...args);
    },
    connected: true
  };
}

export function useSocket() {
  const socket = getSocket();

  useEffect(() => {
    // No actual socket connection needed - using Supabase realtime
  }, [socket]);

  const joinInventory = useCallback(() => {
    console.log('[useSocket] Joined inventory realtime');
  }, []);

  const joinOrders = useCallback(() => {
    console.log('[useSocket] Joined orders realtime');
  }, []);

  const joinRestaurant = useCallback((restaurantId: string) => {
    if (!restaurantId) return;
    console.log(`[useSocket] Joined restaurant: ${restaurantId}`);
  }, []);

  const joinRole = useCallback((role: string) => {
    console.log(`[useSocket] Joined role: ${role}`);
  }, []);

  return {
    socket,
    joinInventory,
    joinOrders,
    joinRestaurant,
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