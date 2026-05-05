# User Roles

SERVV has two separate portals: **Restaurant** (`/manager`) and **Minimart** (`/minimart`). Each has its own set of roles.

---

## Restaurant Roles

### Superadmin
- Manages all tenants (restaurants and minimarts)
- Creates, edits, suspends outlets
- Creates manager accounts
- Not tied to any single restaurant

### Manager
Full access to their restaurant's operations and settings.

| Feature | Access |
|---------|--------|
| Dashboard & analytics | ✅ |
| Menu management | ✅ |
| Staff management | ✅ |
| Inventory | ✅ |
| Orders history | ✅ |
| Expenses | ✅ |
| Credit management | ✅ |
| Loyalty & SMS | ✅ |
| Promotions | ✅ |
| Reservations | ✅ |
| Staff scheduling | ✅ |
| Reviews | ✅ |
| QR code generator | ✅ |
| Restaurant settings | ✅ |
| EBM / Fiscal settings | ✅ |

### Supervisor
Day-to-day floor operations.

| Feature | Access |
|---------|--------|
| Live orders view | ✅ |
| Payment approval | ✅ |
| Order history | ✅ |
| Revenue reports | ✅ |
| Staff performance | ✅ |
| Inventory (view) | ✅ |
| Expenses (view/approve) | ✅ |
| Online orders | ✅ |

### Waiter
- Views and manages their assigned tables
- Places orders for customers
- Marks orders as served
- Calls for payment

### Kitchen
- Kitchen Display System (KDS)
- Views incoming orders in real time
- Marks items as preparing → ready

### Customer
- Scans QR code at table
- Browses menu, places order
- Tracks order status
- Can join loyalty program

### Supplier
- Separate login portal
- Views purchase orders assigned to them
- Updates order status and delivery info

---

## Minimart Roles

### Manager (Minimart)
- Manages products and categories
- Views sales history and analytics
- Manages cashier accounts
- Accesses at `/minimart`

### Cashier
- Operates the POS terminal
- Scans or searches products
- Accepts payment (cash / card / mobile money)
- Prints receipts
- Accesses at `/minimart`

---

## Login

All staff log in at the relevant URL (`/manager` or `/minimart`) with their username and password. Credentials are set by the manager or superadmin. Passwords are case-sensitive.

> **Note:** The customer portal opens automatically when scanning a table QR code and does not require a login.
