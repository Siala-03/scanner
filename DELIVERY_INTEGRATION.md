# Delivery Integration: VubaVuba

This guide documents the VubaVuba delivery integration for the restaurant POS system.

## Overview

The delivery integration allows customers to choose between:
- **Dine In**: Order served at their table
- **VubaVuba Delivery**: Fast delivery to a specified address

Orders placed through VubaVuba are automatically synced with the delivery service and receive updates as the order progresses through pickup and delivery stages.

## Architecture

### Backend

#### Database Schema
New fields added to the `orders` table (migration: `013_delivery_integration.sql`):
- `delivery_provider` - text: 'VubaVuba' or null for dine-in
- `delivery_address` - text: Full delivery address
- `delivery_order_id` - text: VubaVuba-assigned order ID
- `delivery_status` - text: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled'
- `delivery_data` - jsonb: Raw API response from VubaVuba

#### Services

**VubaVuba Service** (`backend/src/services/vubaVubaService.ts`)
- `createVubaVubaOrder(order)`: Creates delivery order in VubaVuba API
  - Payload includes order items, total, customer name, delivery address
  - Returns `deliveryOrderId` and `deliveryStatus` from VubaVuba
  - Stores raw API response for debugging

- `updateVubaVubaOrderStatus(deliveryOrderId, status)`: Updates delivery status
  - Called when restaurant marks order as served/completed
  - Notifies VubaVuba to begin delivery

**Order Service** (`backend/src/services/orderService.ts`)
- `createOrder()` now accepts `deliveryProvider` and `deliveryAddress`
- If delivery provider is 'VubaVuba':
  1. Creates order in local database
  2. Immediately syncs to VubaVuba API
  3. Stores delivery_order_id and delivery_status
  4. On sync failure, logs error but doesn't fail order creation

#### Routes

**POST /api/orders**
Request body:
```json
{
  "tableNumber": 5,
  "customerName": "John Doe",
  "items": [...],
  "deliveryProvider": "VubaVuba",
  "deliveryAddress": "123 Main St, Downtown"
}
```

Response includes delivery fields:
```json
{
  "id": "order_xxx",
  "deliveryProvider": "VubaVuba",
  "deliveryOrderId": "vuba-123456",
  "deliveryStatus": "assigned",
  "deliveryAddress": "123 Main St, Downtown"
}
```

**POST /api/orders/:id/delivery-sync** (Admin/Debug)
Force re-sync an order with VubaVuba. Useful for webhook retries.

**PUT /api/orders/:id/status**
When order transitions to 'served' or 'completed' and has `delivery_provider='VubaVuba'`:
- Automatically calls VubaVuba to update status to 'delivered'
- Updates local `delivery_status` field

### Frontend

#### Components

**Delivery Selection UI** (`CartPage.tsx`)
- Toggle between "Dine In" and "VubaVuba Delivery"
- Input field for delivery address (conditionally shown)
- Validation: address required when VubaVuba is selected

```tsx
<button onClick={() => setDeliveryProvider('vubavuba')}>
  VubaVuba Delivery
</button>

{isDelivery && (
  <input
    type="text"
    placeholder="Enter delivery address"
    value={deliveryAddress}
    onChange={(e) => setDeliveryAddress(e.target.value)}
  />
)}
```

#### Order Flow

1. **Cart Page** - Customer selects delivery method and address
2. **CustomerApp** - Routes delivery info through `onPlaceOrder` callback
3. **useOrders Hook** - Passes delivery data to API
4. **Order API** - Includes `deliveryProvider` and `deliveryAddress` in POST body
5. **Backend** - Creates order + syncs to VubaVuba (async, non-blocking)

#### Type Updates

Updated `CreateOrderInput` interface:
```typescript
{
  deliveryProvider?: string;
  deliveryAddress?: string;
}
```

Updated `Order` interface includes delivery fields:
```typescript
{
  deliveryProvider?: string;
  deliveryAddress?: string;
  deliveryOrderId?: string;
  deliveryStatus?: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled';
}
```

## Environment Variables

### Backend

```bash
# VubaVuba API credentials
VUBA_API_URL="https://api.vubavuba.example.com/v1/orders"
VUBA_API_KEY="your-api-key-here"
```

## Configuration

### VubaVuba API

The service expects the following VubaVuba API endpoints:

**Create Order**: `POST /v1/orders/create`
```json
{
  "partner_order_id": "order_xxx",
  "pickup_zone": "restaurant-location",
  "customer_name": "John Doe",
  "customer_phone": "555-1234",
  "delivery_address": "123 Main St",
  "items": [
    {
      "item_id": "menu-item-1",
      "name": "Burger",
      "qty": 1,
      "price": 1500
    }
  ],
  "total_amount": 1500,
  "notes": ""
}
```

Response:
```json
{
  "delivery_order_id": "vuba-123456",
  "status": "assigned"
}
```

**Update Status**: `PUT /v1/orders/{id}/status`
```json
{ "status": "delivered" }
```

## Error Handling

### Sync Failures

If VubaVuba API is unavailable:
- Order is still created successfully in local database
- Delivery sync errors are logged but don't fail the request
- Use `/api/orders/:id/delivery-sync` endpoint to retry manually

### Validation

- `deliveryAddress` must be provided when `deliveryProvider='VubaVuba'`
- Frontend validates address before submission
- Backend validates in order creation

## Testing

### Manual Testing

1. **Dine In Order**:
   - Select "Dine In - Table X"
   - Place order
   - Verify `deliveryProvider` is null in order response

2. **Delivery Order**:
   - Select "VubaVuba Delivery"
   - Enter address: "123 Test St, Suite 100"
   - Place order
   - Verify `deliveryOrderId` is populated
   - Verify `deliveryStatus` is 'assigned' or 'pending'

3. **Admin Sync Retry**:
   - POST to `/api/orders/{orderId}/delivery-sync`
   - Should return updated order with delivery data

### Demo/Stub Mode

For development without real VubaVuba credentials, set:
```bash
VUBA_API_KEY="demo-vubavuba-key"
VUBA_API_URL="https://api.vubavuba.example.com/v1/orders"
```

The service will make real HTTP requests but the API should be mocked or stubbed in test environments.

## Monitoring

Check delivery order status:
- Kitchen Display: Orders marked with delivery icon/badge
- Admin Dashboard: Filter orders by delivery status
- Database: Query `orders` table filtering by `delivery_provider` and `delivery_status`

## Future Enhancements

1. **Webhook Support**: VubaVuba sends status updates → automatic order status sync
2. **Real-time Tracking**: Customer sees delivery location in real-time
3. **Multi-Provider**: Support additional delivery services (Uber Eats, DoorDash, etc.)
4. **Delivery Time Estimates**: Display ETA to customer
5. **Rate Limiting**: Implement backoff strategy for VubaVuba API calls
