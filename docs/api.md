# API Reference

All API endpoints are served by the SERVV backend at `VITE_API_URL` (e.g. `https://your-backend.onrender.com`).

Protected routes require `Authorization: Bearer <jwt>` where `<jwt>` is the token returned by the `staff-login` Edge Function.

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Staff login (proxies to Edge Function) |
| POST | `/api/auth/admin-staff` | superadmin | Create / manage staff accounts |

---

## Restaurants

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/restaurants` | superadmin | List all restaurants |
| GET | `/api/restaurants/public/:restaurantId` | — | Public restaurant info (name, logo) |
| GET | `/api/restaurants/:restaurantId` | staff | Get restaurant details |
| POST | `/api/restaurants` | superadmin | Create restaurant |
| PUT | `/api/restaurants/:restaurantId` | manager | Update restaurant settings |
| DELETE | `/api/restaurants/:restaurantId` | superadmin | Delete restaurant |

---

## Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orders` | staff | List orders (filter: `status`, `date`, `restaurantId`) |
| POST | `/api/orders` | — | Place a new order (customer or waiter) |
| GET | `/api/orders/:id` | staff | Get order details |
| PUT | `/api/orders/:id/status` | staff | Update order status |
| POST | `/api/orders/:id/confirm-payment` | supervisor | Confirm payment + trigger fiscalization |
| PATCH | `/api/orders/:id/items/:itemId` | staff | Update order item status |
| DELETE | `/api/orders/:id` | manager | Delete order |
| GET | `/api/orders/kitchen` | kitchen | Active orders for KDS |
| GET | `/api/orders/kitchen/analytics` | staff | Kitchen throughput stats |

---

## Menu

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/menu` | — | List menu items for a restaurant |
| POST | `/api/menu` | manager | Create menu item |
| PUT | `/api/menu/:id` | manager | Update menu item |
| DELETE | `/api/menu/:id` | manager | Delete menu item |
| GET | `/api/menu/categories` | — | List categories |

---

## Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/inventory` | staff | List inventory records |
| POST | `/api/inventory` | manager | Create inventory record |
| PUT | `/api/inventory/:id` | manager | Update record |
| DELETE | `/api/inventory/:id` | manager | Delete record |
| GET | `/api/stock-movements` | staff | Movement log |
| POST | `/api/stock-movements` | staff | Record a movement |
| GET | `/api/waste` | staff | Waste entries |
| POST | `/api/waste` | staff | Record waste |
| GET | `/api/cycle-counts` | staff | List cycle counts |
| POST | `/api/cycle-counts` | staff | Start a cycle count |
| PATCH | `/api/cycle-counts/:id/items/:itemId` | staff | Update count for one item |
| POST | `/api/cycle-counts/:id/complete` | manager | Finalize count |
| POST | `/api/cycle-counts/:id/cancel` | manager | Cancel count |

---

## Suppliers & Purchase Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers` | staff | List suppliers |
| POST | `/api/suppliers` | manager | Add supplier |
| PUT | `/api/suppliers/:id` | manager | Update supplier |
| DELETE | `/api/suppliers/:id` | manager | Delete supplier |
| GET | `/api/purchase-orders` | staff | List purchase orders |
| POST | `/api/purchase-orders` | manager | Create purchase order |
| PUT | `/api/purchase-orders/:id` | manager | Update PO |
| POST | `/api/purchase-orders/:id/receive` | staff | Mark goods received |
| DELETE | `/api/purchase-orders/:id` | manager | Delete PO |

---

## Expenses

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/expenses` | staff | List expenses |
| POST | `/api/expenses` | staff | Create expense |
| PUT | `/api/expenses/:id` | staff | Update expense |
| DELETE | `/api/expenses/:id` | manager | Delete expense |
| POST | `/api/expenses/:id/submit-approval` | staff | Submit for approval |
| POST | `/api/expenses/:id/approve` | manager | Approve expense |
| POST | `/api/expenses/:id/reject` | manager | Reject expense |
| GET | `/api/expenses/approval/pending` | manager | Pending approvals |
| GET | `/api/expenses/categories` | staff | List categories |
| POST | `/api/expenses/categories` | manager | Add category |
| GET | `/api/expenses/analytics` | manager | Expense analytics |
| GET | `/api/expenses/budgets` | manager | Budget list |
| POST | `/api/expenses/budgets` | manager | Create budget |

---

## Credit

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/credit/accounts` | staff | List credit accounts |
| POST | `/api/credit/accounts` | manager | Open credit account |
| PATCH | `/api/credit/accounts/:id` | manager | Update account |
| GET | `/api/credit/accounts/:id/transactions` | staff | Transaction history |
| POST | `/api/credit/transactions/charge` | staff | Charge to credit account |
| POST | `/api/credit/transactions/payment` | staff | Record repayment |
| POST | `/api/credit/transactions/adjustment` | manager | Manual adjustment |
| GET | `/api/credit/applications` | manager | Pending applications |
| POST | `/api/credit/applications` | — | Submit credit application |

---

## Loyalty & SMS

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/loyalty/customers` | staff | List loyalty customers |
| POST | `/api/loyalty/customers` | — | Join loyalty program |
| GET | `/api/loyalty/customers/:id` | staff/customer | Get customer + points |
| POST | `/api/loyalty/points/earn` | staff | Award points for a purchase |
| GET | `/api/loyalty/rewards` | — | Available rewards |
| POST | `/api/loyalty/rewards` | manager | Create reward |
| POST | `/api/loyalty/rewards/redeem` | staff | Redeem a reward |

---

## Promotions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/promotions` | staff | List promotions |
| POST | `/api/promotions` | manager | Create promotion |
| POST | `/api/promotions/validate` | — | Validate a discount code |
| PUT | `/api/promotions/:id` | manager | Update promotion |
| DELETE | `/api/promotions/:id` | manager | Delete promotion |

---

## Reservations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reservations` | staff | List reservations |
| POST | `/api/reservations` | — | Create reservation |
| GET | `/api/reservations/availability` | — | Check table availability |
| PUT | `/api/reservations/:id` | staff | Update / confirm / seat |
| DELETE | `/api/reservations/:id` | manager | Cancel reservation |

---

## Reviews

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reviews` | manager | List reviews |
| GET | `/api/reviews/stats` | manager | Rating stats |
| POST | `/api/reviews` | — | Submit a review |
| GET | `/api/reviews/menu-items` | — | Menu item reviews |
| GET | `/api/reviews/menu-items/stats` | — | Per-item rating stats |

---

## Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/dashboard` | manager | Dashboard KPIs |
| GET | `/api/analytics/revenue` | manager | Revenue over time |
| GET | `/api/analytics/top-items` | manager | Best-selling items |
| GET | `/api/analytics/peak-hours` | manager | Orders by hour |
| GET | `/api/kpis` | manager | Staff performance KPIs |
| GET | `/api/schedules` | manager | Staff schedules |
| POST | `/api/schedules` | manager | Create shift |

---

## Forecasting

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/forecasting/consumption` | manager | AI consumption predictions |
| GET | `/api/forecasting/alerts` | manager | Low-stock alerts |

---

## EBM / Fiscal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ebm/config` | manager | Get EBM config |
| POST | `/api/ebm/config` | manager | Save EBM config |
| POST | `/api/ebm/initialize` | manager | Initialize device with RRA |
| POST | `/api/ebm/fiscalize/:orderId` | staff | Fiscalize a sale invoice |
| POST | `/api/ebm/fiscalize-refund/:orderId` | staff | Fiscalize a refund |
| GET | `/api/ebm/invoices` | manager | Fiscal invoice history |
| GET | `/api/ebm/invoices/:id` | manager | Single invoice detail |
| GET | `/api/ebm/pending` | sync script | Pending invoices for local VSDC batch sync |
| POST | `/api/ebm/sync-result` | sync script | Report VSDC sync results |
| GET | `/api/ebm/items` | manager | EBM item list |
| POST | `/api/ebm/items/save` | manager | Register item with EBM |

---

## Tables

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tables` | staff | List tables |
| POST | `/api/tables` | manager | Create table |
| PUT | `/api/tables/:id` | manager | Update table |
| DELETE | `/api/tables/:id` | manager | Delete table |

---

## AI Assistant

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/ai/chat` | manager | Send message to AI insights assistant |

---

## Print / Receipts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/print/receipt/:orderId` | staff | Generate printable receipt HTML |

---

## Supplier Portal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/supplier/login` | — | Supplier login |
| GET | `/api/supplier/purchase-orders` | supplier | POs assigned to this supplier |
| PUT | `/api/supplier/purchase-orders/:id` | supplier | Update delivery status |

---

## Locations (Multi-location Inventory)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/locations` | manager | List locations |
| POST | `/api/locations` | manager | Create location |
| PUT | `/api/locations/:id` | manager | Update location |
| DELETE | `/api/locations/:id` | manager | Delete location |
| GET | `/api/locations/:id/stock` | manager | Stock at this location |
| GET | `/api/locations/:id/summary` | manager | Location summary |

---

## WebSocket Events

SERVV uses Socket.IO at `VITE_SOCKET_URL` for real-time updates.

| Event (server → client) | Payload | When fired |
|--------------------------|---------|------------|
| `new_order` | order object | New order placed |
| `order_status_changed` | `{ orderId, status }` | Status update |
| `payment_confirmed` | `{ orderId, paymentType }` | Payment confirmed |
| `kitchen_update` | `{ orderId, itemId, status }` | KDS item status change |
| `inventory_alert` | `{ itemId, level }` | Stock below threshold |
