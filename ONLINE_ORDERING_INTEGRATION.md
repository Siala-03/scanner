# 🔧 Online Ordering Integration Checklist

This file provides step-by-step code snippets to integrate the online ordering system into your app.

---

## ✅ Step 1: Run Database Migration

**File:** `supabase/004_online_qr_codes.sql`

Execute this SQL in Supabase SQL Editor:
- Goes to **SQL Editor** in Supabase dashboard
- Create new query
- Copy entire contents of migration file
- Click **Run**

Status: ✓ Tables created

---

## ✅ Step 2: Update Type Definitions

**Status:** Already updated in `src/types/index.ts`
- Added `OnlineQRCode` interface
- Updated `Order` with `isOnlineOrder`, `onlineQRCodeId`, `customerEmail`
- Updated `Restaurant` with `onlineOrderingEnabled`, `socialMediaLinks`

---

## ✅ Step 3: API Integration

**Files Created:**
- `src/api/onlineOrders.ts` - All API functions

**Functions Available:**
```typescript
// QR Code Management
createOnlineQRCode(restaurantId)
getOrCreateOnlineQRCode(restaurantId)
regenerateOnlineQRCode(restaurantId)
getOnlineQRCodeByToken(codeToken)

// Order Management
createOnlineOrder(restaurantId, qrCodeId, customerName, customerEmail, items, specialInstructions)
getOnlineOrders(restaurantId, status?)
getPendingOnlineOrders(restaurantId)
```

---

## ✅ Step 4: Router Configuration

### Add Public Ordering Route

**In your main App.tsx or router file:**

```typescript
import { OnlineOrderingPage } from './pages/customer/OnlineOrderingPage';

// Add this route
<Routes>
  {/* Existing routes */}
  
  {/* Online Ordering - Public Route */}
  <Route 
    path="/order/:qrCodeToken" 
    element={<OnlineOrderingPage qrCodeToken={param.qrCodeToken} />} 
  />
  
  {/* Your other routes */}
</Routes>
```

**Or if using pathname directly:**

```typescript
// In your main render/routing logic
if (pathname.startsWith('/order/')) {
  const token = pathname.split('/order/')[1];
  return <OnlineOrderingPage qrCodeToken={token} />;
}
```

---

## ✅ Step 5: Manager Dashboard Integration

### Add QR Code Manager to Manager Settings Page

**File:** `src/pages/manager/RestaurantSettings.tsx` (or similar)

**Add this import:**
```typescript
import { OnlineOrderingQRManager } from './OnlineOrderingQRManager';
```

**Add this JSX in your manager page:**
```typescript
export function RestaurantSettings() {
  const { restaurantId, restaurantName } = useCurrentRestaurant();
  
  return (
    <div className="space-y-6">
      {/* Existing settings sections */}
      
      {/* New: Online Ordering Section */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold mb-4">📱 Online Ordering</h3>
        <OnlineOrderingQRManager 
          restaurantId={restaurantId}
          restaurantName={restaurantName}
        />
      </div>
    </div>
  );
}
```

**Navigation Link:**
Add to manager sidebar:
```typescript
<NavLink href="/manager/settings">
  📱 Online Ordering
</NavLink>
```

---

## ✅ Step 6: Supervisor Dashboard Integration

### Add Online Orders Panel to Supervisor Dashboard

**File:** `src/pages/supervisor/SupervisorDashboard.tsx`

**Add this import:**
```typescript
import { OnlineOrdersPanel } from '../../components/supervisor/OnlineOrdersPanel';
```

**Add this in your supervisor dashboard:**
```typescript
export function SupervisorDashboard({ onManageMenu, onLogout }: SupervisorDashboardProps) {
  const { orders } = useOrdersContext();
  // ... existing code ...

  return (
    <div className="supervisor-surface min-h-screen bg-slate-900 text-slate-100 p-4">
      {/* Existing KPI cards and sections */}
      
      {/* NEW: Online Orders Section */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">📱</span>
          <h2 className="text-xl font-bold">Online Orders</h2>
          <span className="text-xs bg-blue-600 px-2 py-1 rounded">
            {orders.filter(o => o.isOnlineOrder && !['served', 'cancelled'].includes(o.status || '')).length} Active
          </span>
        </div>
        <OnlineOrdersPanel 
          orders={orders}
          onStatusChange={(orderId, newStatus) => {
            onUpdateOrderStatus(orderId, newStatus as any);
          }}
        />
      </div>
    </div>
  );
}
```

---

## ✅ Step 7: Waiter Dashboard Integration

### Add Online Orders Section to Waiter Dashboard

**File:** `src/pages/waiter/WaiterDashboard.tsx`

**Add this import:**
```typescript
import { OnlineOrdersForWaiter } from '../../components/waiter/OnlineOrdersSection';
```

**Add this in your waiter dashboard:**
```typescript
export function WaiterDashboard({
  waiter,
  orders,
  restaurantName,
  onUpdateOrderStatus,
}: WaiterDashboardProps) {
  // ... existing code ...

  return (
    <div className="waiter-dashboard min-h-screen">
      {/* Existing order entry and management sections */}
      
      {/* NEW: Online Orders Section - High Priority */}
      {orders.some(o => o.isOnlineOrder && o.status === 'ready') && (
        <div className="mt-6 p-4 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
          <h3 className="text-lg font-bold text-green-700 dark:text-green-300 mb-3">
            🟢 Online Orders Ready for Pickup
          </h3>
          <OnlineOrdersForWaiter 
            orders={orders}
            onUpdateStatus={(orderId, newStatus) => {
              onUpdateOrderStatus(orderId, newStatus);
            }}
          />
        </div>
      )}
      
      {/* Regular online orders section */}
      <div className="mt-6">
        <h3 className="text-lg font-bold mb-3">📱 All Online Orders</h3>
        <OnlineOrdersForWaiter 
          orders={orders}
          onUpdateStatus={(orderId, newStatus) => {
            onUpdateOrderStatus(orderId, newStatus);
          }}
        />
      </div>
    </div>
  );
}
```

---

## ✅ Step 8: Fetch Online Orders in Contexts

### Update Orders Context to Include Online Orders

**File:** `src/contexts/OrdersContext.tsx` (or where you manage orders)

**Ensure you're fetching online orders:**
```typescript
// Add to your orders fetch logic
import { getPendingOnlineOrders } from '../api/onlineOrders';

// In your useEffect or context hook
useEffect(() => {
  const loadOrders = async () => {
    // Existing table orders fetch
    const tableOrders = await fetchRegularOrders(restaurantId);
    
    // NEW: Also fetch online orders
    const onlineOrders = await getPendingOnlineOrders(restaurantId);
    
    // Combine them
    setOrders([...tableOrders, ...onlineOrders]);
  };
  
  loadOrders();
}, [restaurantId]);
```

---

## ✅ Step 9: Update Order Status Handler

### Ensure Order Status Updates Work for Online Orders

**File:** `src/contexts/OrdersContext.tsx` or your order update handler

**Verify this function handles online orders:**
```typescript
const handleUpdateOrderStatus = async (
  orderId: string,
  newStatus: 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled'
) => {
  // Update in database
  const { error } = await supabaseAdmin
    .from('orders')
    .update({ 
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId);

  if (!error) {
    // Update local state
    setOrders(prev => 
      prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
    );
    
    // TODO: Send customer email notification
    // sendOrderStatusEmail(order.customerEmail, newStatus);
  }
};
```

---

## ✅ Step 10: Email Notifications (Optional but Recommended)

### Send Customer Notifications

**Create new file:** `src/api/emailNotifications.ts`

```typescript
import { Order } from '../types';

const STATUS_MESSAGES: Record<string, string> = {
  verified: 'Your order has been verified. We are preparing it now!',
  preparing: 'Your order is being prepared. It will be ready soon!',
  ready: 'Your order is ready for pickup! Please come get it.',
  served: 'Thanks for your order! Hope you enjoyed your meal.',
};

export async function sendOrderStatusEmail(
  customerEmail: string,
  orderNumber: string,
  status: string
) {
  try {
    const response = await fetch('/api/emails/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: customerEmail,
        orderNumber,
        status,
        message: STATUS_MESSAGES[status],
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }
  } catch (error) {
    console.error('Email notification failed:', error);
    // Silently fail - don't break order processing
  }
}
```

**In your order update handler:**
```typescript
// After updating order status
await sendOrderStatusEmail(order.customerEmail, order.orderNumber, newStatus);
```

---

## ✅ Step 11: Environment Variables

**Add to your `.env` file (if needed for email service):**

```env
VITE_RESTAURANT_BASE_URL=https://yourrestaurant.com
VITE_ONLINE_ORDER_ENABLED=true
VITE_SUPPORT_EMAIL=support@yourrestaurant.com
```

---

## ✅ Step 12: Testing Checklist

### Manager Testing:
- [ ] Generate QR code
- [ ] Download QR code image
- [ ] Copy short link
- [ ] Regenerate code
- [ ] Verify QR code scans correctly

### Customer Testing (Mobile):
- [ ] Scan QR code
- [ ] See menu items
- [ ] Add items to cart
- [ ] Enter name and email
- [ ] Place order successfully
- [ ] See order confirmation

### Kitchen Testing:
- [ ] Online order appears with "Online" indicator
- [ ] Special instructions visible
- [ ] Can change status

### Supervisor Testing:
- [ ] Online orders appear in panel
- [ ] Status counts are correct
- [ ] Can see customer details
- [ ] Can update status

### Waiter Testing:
- [ ] Online orders visible
- [ ] Ready orders highlighted
- [ ] Can mark as served
- [ ] Status updates propagate

---

## ✅ Step 13: Production Deployment

**Before going live:**

1. **Database**: Run migration on production database
2. **Code**: Deploy all new files and changes
3. **Routes**: Verify `/order/:token` route works publicly
4. **Domains**: Ensure short links resolve correctly
5. **Email**: Set up email notifications
6. **SSL**: Verify HTTPS working
7. **Testing**: Full end-to-end test with real user
8. **Monitoring**: Set up error tracking

---

## 📋 Files Created/Modified Summary

### New Files:
- ✅ `supabase/004_online_qr_codes.sql` - Database migration
- ✅ `src/api/onlineOrders.ts` - API utilities
- ✅ `src/types/index.ts` - Type updates (OnlineQRCode, Order extensions)
- ✅ `src/pages/manager/OnlineOrderingQRManager.tsx` - Manager QR code page
- ✅ `src/pages/customer/OnlineOrderingPage.tsx` - Public ordering page
- ✅ `src/components/supervisor/OnlineOrdersPanel.tsx` - Supervisor dashboard component
- ✅ `src/components/waiter/OnlineOrdersSection.tsx` - Waiter dashboard component
- ✅ `src/utils/dateUtils.ts` - Date formatting utilities
- ✅ `ONLINE_ORDERING_SETUP.md` - Setup guide
- ✅ `ONLINE_ORDERING_QUICK_START.md` - Quick reference

### Modified Files:
- ⚠️ `src/types/index.ts` - Added OnlineQRCode interface, updated Order and Restaurant
- ⚠️ `src/pages/manager/RestaurantSettings.tsx` - Add OnlineOrderingQRManager component
- ⚠️ `src/pages/supervisor/SupervisorDashboard.tsx` - Add OnlineOrdersPanel component
- ⚠️ `src/pages/waiter/WaiterDashboard.tsx` - Add OnlineOrdersForWaiter component
- ⚠️ `src/contexts/OrdersContext.tsx` - Ensure online orders are fetched and updated

---

## 🚀 You're Ready!

All components are built and ready to integrate. Follow the steps above to add them to your application.

**Estimated Integration Time:** 30-60 minutes
**Testing Time:** 1-2 hours
**Total Time to Live:** 2-3 hours

---

**Questions?** Check the detailed guides:
- `ONLINE_ORDERING_SETUP.md` - Technical setup
- `ONLINE_ORDERING_QUICK_START.md` - User guide

Good luck! 🎉
