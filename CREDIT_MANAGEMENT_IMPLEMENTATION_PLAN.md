# Customer Credit Management - Implementation Plan

## Overview
A comprehensive credit management system that allows customers to place orders on credit with proper controls, tracking, and payment management.

## Features Implemented

### 1. Core Types & API (`src/types/credit.ts`, `src/api/credit.ts`)
✅ **Completed**
- Customer credit accounts with limits and status tracking
- Credit transactions (charges, payments, adjustments, write-offs)
- Credit applications with approval workflow
- Credit alerts for limit breaches and overdue accounts
- Summary statistics for management overview

### 2. React Hook (`src/hooks/useCredit.ts`)
✅ **Completed**
- Full CRUD operations for credit accounts
- Credit charge and payment processing
- Application submission and review workflow
- Real-time state management
- Error handling and loading states

## Remaining Implementation Tasks

### 3. Credit Management Page (`src/pages/manager/CreditManagement.tsx`)
**Status**: To be created

**Components needed**:
- Dashboard with credit summary KPIs
- Accounts list with filtering and search
- Account detail view with transaction history
- Credit application review interface
- Payment processing modal
- Account status management (suspend/block)

**Key Features**:
```tsx
// Main sections:
1. Overview Tab - Summary stats and alerts
2. Accounts Tab - All credit accounts with actions
3. Applications Tab - Pending credit applications
4. Reports Tab - Credit utilization and aging reports
```

### 4. Waiter Credit Order Integration
**Status**: To be integrated into existing order flow

**Changes needed**:
- Add payment method option: "Credit" in order entry
- Lookup customer credit account by phone
- Check credit availability before allowing credit order
- Require manager approval for amounts over threshold
- Create credit transaction on order completion

**Integration points**:
- `src/pages/waiter/WaiterDashboard.tsx` - Order entry flow
- `src/pages/waiter/OrderEntry.tsx` - Payment method selection
- `src/api/orders.ts` - Order creation with credit flag

### 5. Backend Routes (Node.js/Express)
**Status**: To be created in `backend/src/routes/credit.ts`

**Endpoints needed**:
```
GET    /api/credit/accounts              - List all accounts
GET    /api/credit/accounts/:id          - Get account details
GET    /api/credit/accounts/:id/transactions - Get transaction history
POST   /api/credit/accounts              - Create new account
PATCH  /api/credit/accounts/:id          - Update account
DELETE /api/credit/accounts/:id          - Delete account

POST   /api/credit/transactions/charge   - Add charge to account
POST   /api/credit/transactions/payment  - Record payment
POST   /api/credit/transactions/adjustment - Manual adjustment

GET    /api/credit/applications          - List applications
POST   /api/credit/applications          - Submit application
POST   /api/credit/applications/:id/review - Review application

GET    /api/credit/summary               - Get summary statistics
GET    /api/credit/alerts                - Get active alerts
POST   /api/credit/alerts/:id/resolve    - Mark alert as resolved
```

### 6. Database Schema (PostgreSQL)
**Status**: To be created in `backend/src/database/`

**Tables needed**:
```sql
-- Credit Accounts
CREATE TABLE credit_accounts (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT UNIQUE NOT NULL,
  credit_limit DECIMAL(10,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_payment_date TIMESTAMP,
  notes TEXT
);

-- Credit Transactions
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES credit_accounts(id),
  customer_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL, -- charge, payment, adjustment, writeoff
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  order_id UUID, -- Optional link to order
  description TEXT NOT NULL,
  performed_by UUID NOT NULL,
  performed_by_name TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Credit Applications
CREATE TABLE credit_applications (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  requested_limit DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  requested_by_name TEXT NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_by UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMP,
  notes TEXT,
  rejection_reason TEXT
);

-- Credit Alerts
CREATE TABLE credit_alerts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES credit_accounts(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  type VARCHAR(20) NOT NULL, -- over_limit, overdue, near_limit, suspended
  message TEXT NOT NULL,
  amount DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  is_resolved BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX idx_credit_accounts_phone ON credit_accounts(customer_phone);
CREATE INDEX idx_credit_accounts_status ON credit_accounts(status);
CREATE INDEX idx_credit_transactions_account ON credit_transactions(account_id);
CREATE INDEX idx_credit_applications_status ON credit_applications(status);
CREATE INDEX idx_credit_alerts_resolved ON credit_alerts(is_resolved);
```

## Implementation Priority

### Phase 1: Core Backend (Week 1)
1. Create database migrations
2. Implement backend routes
3. Add authentication/authorization
4. Create database seed data for testing

### Phase 2: Manager Interface (Week 2)
1. Build CreditManagement page
2. Implement account management
3. Add application review workflow
4. Create payment processing interface

### Phase 3: Waiter Integration (Week 3)
1. Modify order entry flow
2. Add credit payment option
3. Implement credit checking
4. Add manager approval workflow

### Phase 4: Testing & Refinement (Week 4)
1. End-to-end testing
2. Performance optimization
3. Security review
4. User acceptance testing

## Key Business Rules

### Credit Limits
- Default limit: R500 (configurable by manager)
- Manager can set custom limits per account
- Waiters can approve up to R200 without manager approval
- Orders over R200 require manager approval
- Accounts over limit are automatically suspended

### Payment Terms
- Standard terms: 30 days
- Overdue accounts (>30 days) are blocked from new credit
- Partial payments are allowed
- Multiple payment methods supported

### Account Status Flow
```
Active → (Over limit/Overdue) → Suspended → (Payment/Manager) → Active
Active → (Severe overdue/Fraud) → Blocked → (Manager only) → Active/Suspended
```

### Application Workflow
```
Submitted → Pending Manager Review → Approved → Account Created
                              ↓
                          Rejected → Customer Notified
```

## Success Metrics

### For Managers
- Clear view of total credit exposure
- Easy account management
- Automated alerts for problem accounts
- Streamlined approval process

### For Waiters
- Quick credit lookup by phone
- Clear indication of available credit
- Simple credit order process
- Manager approval when needed

### For Customers
- Easy credit application
- Transparent balance tracking
- Flexible payment options
- Clear communication about status

## Next Steps

1. **Create Backend Routes** - Implement all API endpoints
2. **Build Database Schema** - Create migrations and seed data
3. **Develop Manager UI** - Full credit management interface
4. **Integrate with Orders** - Modify waiter order flow
5. **Testing** - Comprehensive testing of all scenarios
6. **Deployment** - Roll out to production with training

## Notes

- All monetary values in ZAR (South African Rand)
- Phone numbers as primary customer identifier
- Integration with existing order and user systems
- Mobile-responsive design required
- Real-time updates via WebSocket for alerts