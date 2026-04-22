# Online Ordering QR Code System - Implementation Guide

## 📋 Overview
This is a complete QR code-based online ordering system that allows customers to:
- Scan a QR code or visit a short link from social media
- Browse your restaurant menu and place orders
- Track their order status
- Get email notifications

Managers can:
- Generate and regenerate QR codes
- Download QR codes for printing/sharing
- Share links on social media
- View/manage online orders

Supervisors and waiters can:
- See online orders in dedicated sections
- Update order status
- Track customer details and special instructions

---

## 🚀 Setup Instructions

### 1. **Database Migration**
Run the migration to create the required tables:

```sql
-- File: supabase/004_online_qr_codes.sql
-- This adds:
-- - online_qr_codes table
-- - is_online_order column to orders
-- - online_qr_code_id column to orders
-- - customer_email column to orders
```

Execute this in Supabase SQL Editor.

### 2. **Update App Routing**
Add the online ordering page route in your main app:

```typescript
// In your router setup
<Route path="/order/:qrCodeToken" element={<OnlineOrderingPage />} />
```

Or if using a different routing approach:

```typescript
// In your app navigation
if (window.location.pathname.startsWith('/order/')) {
  const token = window.location.pathname.split('/order/')[1];
  return <OnlineOrderingPage qrCodeToken={token} />;
}
```

### 3. **Add Manager Dashboard Section**
In the Manager's dashboard, add the QR code manager:

```typescript
import { OnlineOrderingQRManager } from '../pages/manager/OnlineOrderingQRManager';

// In your manager page
<OnlineOrderingQRManager 
  restaurantId={restaurantId}
  restaurantName={restaurantName}
/>
```

### 4. **Add Supervisor Dashboard Section**
In the Supervisor's dashboard, add the online orders panel:

```typescript
import { OnlineOrdersPanel } from '../components/supervisor/OnlineOrdersPanel';

// In your supervisor dashboard
<div className="mt-6">
  <h3 className="text-lg font-semibold mb-4">📱 Online Orders</h3>
  <OnlineOrdersPanel 
    orders={orders}
    onStatusChange={(orderId, newStatus) => {
      onUpdateOrderStatus(orderId, newStatus);
    }}
  />
</div>
```

### 5. **Add Waiter Dashboard Section**
In the Waiter's dashboard, add the online orders for waiter:

```typescript
import { OnlineOrdersForWaiter } from '../components/waiter/OnlineOrdersSection';

// In your waiter dashboard
<div className="mt-6">
  <h3 className="text-lg font-semibold mb-4">🛒 Online Orders</h3>
  <OnlineOrdersForWaiter 
    orders={orders}
    onUpdateStatus={(orderId, newStatus) => {
      onUpdateOrderStatus(orderId, newStatus);
    }}
  />
</div>
```

---

## 📱 How It Works

### Customer Flow:
1. **Scan QR Code** - Customer scans the QR code in your restaurant, on social media, or website
2. **Browse Menu** - Sees all available menu items with prices
3. **Add Items** - Selects items and quantities
4. **Checkout** - Enters name and email
5. **Confirm Order** - Places order which immediately goes to kitchen
6. **Track** - Can track order status via email

### Manager Flow:
1. **Generate QR Code** - Creates a unique QR code for online ordering
2. **Download** - Downloads high-quality image for printing
3. **Share** - Copies the short link for social media
4. **Regenerate** - Can regenerate if QR code is compromised
5. **Monitor** - Views online orders in supervisor dashboard

### Order Processing:
1. **Pending** - Order received, awaiting kitchen confirmation
2. **Preparing** - Kitchen is preparing the order
3. **Ready** - Order is ready for pickup
4. **Served** - Waiter marks as served/delivered

---

## 🔑 Key Features

### QR Code Management
- **Unique Token Generation**: Each restaurant gets a unique code token
- **Short Links**: URL-friendly links for social media (e.g., `yoursite.com/order/ABC12345`)
- **Regeneration**: Ability to invalidate old codes and create new ones
- **Download/Print**: High-quality PNG downloads for physical display

### Online Orders Section
- **Real-time Updates**: Orders appear instantly
- **Status Tracking**: Pending → Preparing → Ready → Served
- **Customer Info**: Name, email, special instructions
- **Summary View**: See all online orders grouped by status
- **One-click Status Updates**: Quick buttons to move orders through workflow

### Customer Experience
- **Clean Interface**: Mobile-optimized ordering flow
- **Menu Browsing**: Categories, prices, descriptions
- **Cart Management**: Add/remove items easily
- **Special Instructions**: Notes for dietary requirements
- **Email Confirmation**: Customers get order confirmation

---

## 📂 File Structure

```
src/
├── api/
│   └── onlineOrders.ts                 # API utilities
├── pages/
│   ├── manager/
│   │   └── OnlineOrderingQRManager.tsx # Manager QR code page
│   ├── customer/
│   │   └── OnlineOrderingPage.tsx      # Public ordering page
│   ├── supervisor/
│   └── waiter/
├── components/
│   ├── supervisor/
│   │   └── OnlineOrdersPanel.tsx       # Supervisor view
│   └── waiter/
│       └── OnlineOrdersSection.tsx     # Waiter view
└── types/
    └── index.ts                        # Updated with OnlineQRCode type

supabase/
└── 004_online_qr_codes.sql             # Database migration
```

---

## 🔌 API Reference

### Creating QR Code
```typescript
import { createOnlineQRCode } from '../api/onlineOrders';

const qrCode = await createOnlineQRCode(restaurantId);
// Returns: { id, codeToken, qrUrl, shortLink, ... }
```

### Getting or Creating QR Code
```typescript
import { getOrCreateOnlineQRCode } from '../api/onlineOrders';

const qrCode = await getOrCreateOnlineQRCode(restaurantId);
// Creates one if doesn't exist
```

### Regenerating QR Code
```typescript
import { regenerateOnlineQRCode } from '../api/onlineOrders';

const newQrCode = await regenerateOnlineQRCode(restaurantId);
// Deactivates old code, creates new one
```

### Creating Online Order
```typescript
import { createOnlineOrder } from '../api/onlineOrders';

const order = await createOnlineOrder(
  restaurantId,
  qrCodeId,
  customerName,
  customerEmail,
  items,
  specialInstructions
);
```

### Getting Online Orders
```typescript
import { getOnlineOrders, getPendingOnlineOrders } from '../api/onlineOrders';

// Get all online orders
const allOrders = await getOnlineOrders(restaurantId);

// Get pending orders only
const pending = await getPendingOnlineOrders(restaurantId);

// Get by status
const readyOrders = await getOnlineOrders(restaurantId, 'ready');
```

---

## 🎨 Customization

### Brand Colors
Update colors in the components to match your brand:

```typescript
// In OnlineOrderingQRManager.tsx
ctx.fillStyle = '#your-brand-color'; // Change header color
```

### Tax Rate
Modify tax calculation in `onlineOrders.ts`:

```typescript
const tax = Math.round(subtotal * 0.15); // Change 0.1 to your tax rate
```

### Short Link Format
Customize the link format:

```typescript
// In createOnlineQRCode()
const shortLink = `${window.location.origin}/menu/${codeToken}`; // Custom format
```

### Email Notifications
Integrate with your email service:

```typescript
// Add after order creation
await sendOrderConfirmationEmail(customerEmail, order);
```

---

## 🔒 Security Considerations

1. **QR Code Tokens**: Random tokens are generated for each code
2. **Regeneration**: Old codes can be deactivated if compromised
3. **Email Validation**: Orders capture customer email for verification
4. **HTTPS**: Ensure all short links use HTTPS
5. **Rate Limiting**: Consider adding rate limiting to prevent abuse

---

## 📊 Analytics & Tracking

Track online order metrics:
- Orders received via QR code
- Customer conversion rate
- Popular items from online orders
- Average order value
- Peak ordering times

Example query:
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as online_orders,
  AVG(total) as avg_order_value,
  SUM(total) as total_revenue
FROM orders
WHERE is_online_order = true
  AND restaurant_id = 'your-restaurant-id'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🐛 Troubleshooting

### QR Code Not Loading
- Check that the restaurant ID is correct
- Verify the database migration was applied
- Check browser console for errors

### Orders Not Appearing
- Ensure `is_online_order` is set to `true`
- Check that `online_qr_code_id` is populated
- Verify orders are for the correct restaurant

### Link Not Working
- Test the short link directly in browser
- Check that routing is configured
- Verify the QR code token matches database

### Email Not Received
- Check customer email address is valid
- Implement email service integration
- Add email logging for debugging

---

## 📱 Mobile Optimization

All components are fully responsive:
- QR code manager displays on desktop
- Ordering page optimized for mobile
- Touch-friendly buttons and inputs
- Responsive grid layouts

Test on various devices:
```bash
# Open in different viewport sizes
- Desktop: 1920x1080
- Tablet: 768x1024
- Mobile: 375x667
```

---

## 🚀 Production Checklist

- [ ] Database migration applied
- [ ] Routes configured
- [ ] Components integrated into dashboards
- [ ] Email notifications implemented
- [ ] SSL/HTTPS enabled
- [ ] QR code tested on mobile
- [ ] Social media links configured
- [ ] Tax rate verified
- [ ] Currency formatting correct
- [ ] Analytics tracking implemented
- [ ] Error handling tested
- [ ] Rate limiting configured
- [ ] Backup/disaster recovery plan

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review database schema in `004_online_qr_codes.sql`
3. Check browser console for errors
4. Verify Supabase connection
5. Test with sample data

---

Generated: April 2026
Version: 1.0
