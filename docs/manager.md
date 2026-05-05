# Manager Guide

Log in at `https://your-app.vercel.app/manager` with your manager username and password.

---

## Dashboard

The home screen shows:
- Today's revenue, active orders, total orders served
- Orders by hour chart
- Order status breakdown
- AI insights chat (ask questions about your data)
- Inventory forecasting alerts
- Real-time payment confirmation toasts

---

## Menu Management

**Setup → Manage Menu**

- Add, edit, delete menu items
- Set name, price, category, description, image
- Mark items as requiring kitchen display (`requires_kitchen`)
- Add modifiers (e.g. "Extra Sauce", "No Onions") with optional price adjustments
- Enable/disable items without deleting

---

## Order History

**Operations → Order History**

- Filter by date range, status, payment method
- View full order details and items
- Export for reporting

---

## Staff Management

**Setup → Staff**

- Add staff members (name, role, email, phone)
- Set username and password for each
- Change roles
- View performance metrics per staff member
- Mark staff on/off duty

---

## Inventory

**Setup → Inventory**

- Track stock levels for ingredients and products
- Set par levels and reorder points
- Record stock movements and waste
- Link inventory items to menu items (auto-deduct on sale)
- Run cycle counts
- Manage suppliers and purchase orders
- Forecasting: AI-generated consumption predictions

---

## Analytics

**Finance → Analytics**

- Revenue trends (daily/weekly/monthly)
- Top-selling items
- Peak hours analysis
- Customer analytics
- Staff performance KPIs
- Predictive analytics

---

## Expenses

**Finance → Expenses**

- Log business expenses by category
- Approval workflow (submit → manager approves)
- Recurring expenses
- Attach receipts
- Budget tracking

---

## Credit Management

**Finance → Credit**

- Create credit accounts for regular customers
- Set credit limits
- Track balances and transactions
- Approve/reject credit applications
- Alerts for overdue accounts

---

## Loyalty & SMS

**Menu & Marketing → Loyalty & SMS**

- Customers earn points on purchases
- Define rewards (discounts, free items)
- View loyalty transaction history
- Send SMS campaigns to customers

---

## Promotions

**Menu & Marketing → Promotions**

- Create discount codes (percentage or fixed amount)
- Set validity dates, usage limits, minimum order
- Customers apply codes at checkout

---

## Reservations

**Operations → Reservations**

- View and manage table reservations
- Confirm, seat, complete, cancel bookings
- Customer name, party size, date/time, notes

---

## Scheduling

**Setup → Schedule**

- Assign shifts to staff
- View weekly schedule
- Track hours worked

---

## Reviews

**Operations → Reviews**

- View customer ratings and comments
- Monitor menu item reviews
- Track overall rating trends

---

## QR Codes

**Setup → QR Codes**

- Generate QR codes for each table
- Download as PNG for printing
- Customers scan to access the menu and place orders

---

## Settings

**Setup → Settings**

- Restaurant name, address, phone, email
- Upload logo (appears on printed receipts)
- Set city and country
- Currency (defaults to RWF)

---

## EBM / Fiscal

**Setup → Fiscal (EBM)**

- Configure TPIN, Branch ID, Device Serial
- Choose Online EBM (OSDC) or Local VSDC
- Initialize device with RRA
- View fiscal invoice history
- Download auto-installer for local VSDC sync

See the full [EBM Guide](./ebm.md) for setup instructions.

---

## Payment Confirmation (Supervisor Panel)

Supervisors see a "Payment Approval" panel showing orders awaiting payment confirmation. They select the payment method (Cash / Card / Mobile Money) and click **Confirm Payment**. This:
1. Updates the order status
2. Notifies the manager dashboard in real time
3. Triggers EBM fiscalization (if configured)
4. Allows receipt printing
