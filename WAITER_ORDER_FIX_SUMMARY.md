# Waiter Portal Order Display Fix

## Problem
Customer orders placed through QR code scanning were not appearing in the waiter's portal. This prevented waiters from seeing, confirming, and processing customer orders.

## Root Cause
The issue was in the `useOrders` hook (`src/hooks/useOrders.ts`). The hook was not joining the waiter role room in the socket connection, which meant it wasn't receiving real-time order updates that were being broadcast to waiters.

## Solution
Added `joinRole('waiter')` to the useEffect in `useOrders.ts` to ensure the socket connection joins the waiter role room. This allows the waiter dashboard to receive real-time order updates via WebSocket.

### Changes Made

**File: `src/hooks/useOrders.ts`**

1. Added `joinRole` to the destructured values from `useSocket()`:
```typescript
const { socket, joinOrders, joinRestaurant, joinRole } = useSocket();
```

2. Added `joinRole('waiter')` call in the useEffect:
```typescript
useEffect(() => {
  // ... existing code ...
  joinOrders();
  joinRestaurant(restaurantId);
  joinRole('waiter'); // Join waiter role room for order updates
  // ... rest of code ...
}, [restaurantId, joinOrders, joinRestaurant, joinRole, socket]);
```

## How It Works

### Order Flow
1. **Customer places order** → Scans QR code, selects items, confirms order
2. **Order created** → Sent to backend via API
3. **Backend emits socket event** → `emitOrderUpdate({ type: 'create', order })`
4. **Socket broadcasts to rooms** → Sends to 'orders' room and `restaurant:${restaurantId}` room
5. **Waiter dashboard receives update** → Now properly listening via `joinRole('waiter')`
6. **Order appears in waiter portal** → Waiter can confirm, reject, or manage the order
7. **Waiter approves order** → Status changes to 'verified' and goes to kitchen
8. **Kitchen receives order** → Kitchen display shows food orders for preparation

### Socket Room Structure
- `orders` - General orders room (all order updates)
- `restaurant:${restaurantId}` - Restaurant-specific room
- `role:waiter` - Waiter role room (for waiter-specific notifications)

## Testing
To verify the fix works:

1. **Deploy the updated code** to your production environment
2. **Clear browser cache** on both customer and waiter devices
3. **Test the flow**:
   - Open waiter portal (navigate to `/waiter`)
   - Open customer menu (scan QR code or navigate to `/t/1`)
   - Place an order as customer
   - Verify order appears in waiter portal within a few seconds
   - Waiter should see the order in "Pending" tab
   - Waiter can approve/reject the order
   - Approved food orders should appear in kitchen display

## Additional Notes

### Socket Connection
The socket connection is managed by `useSocket()` hook which:
- Connects to the backend URL specified in `VITE_SOCKET_URL`
- Automatically reconnects on connection loss
- Maintains connection across component unmounts

### Restaurant ID Handling
The system properly filters orders by `restaurantId` to ensure:
- Waiters only see orders from their restaurant
- Kitchen only sees orders from their restaurant
- Multi-restaurant deployments work correctly

### Offline Support
The system has offline-aware API that:
- Queues operations when offline
- Syncs when connection is restored
- Caches orders locally for offline viewing

## Related Files
- `src/hooks/useOrders.ts` - Main order management hook
- `src/hooks/useSocket.ts` - Socket connection management
- `src/pages/waiter/WaiterDashboard.tsx` - Waiter UI
- `src/pages/customer/CustomerApp.tsx` - Customer ordering UI
- `backend/src/socket.ts` - Backend socket implementation
- `backend/src/routes/orders.ts` - Order API endpoints
- `backend/src/services/orderService.ts` - Order creation logic