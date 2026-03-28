# Expense Management System - Complete Implementation Guide

## Overview

The expense management system is a comprehensive solution for tracking, approving, and managing operational expenses with a clear workflow between supervisors and managers, including receipt generation and audit logging.

## Architecture

### Database Schema
The system uses the following tables:
- **expenses** - Main expense records with approval status tracking
- **expense_categories** - Categorization of expenses
- **recurring_expenses** - Recurring expense templates
- **expense_budgets** - Budget tracking and alerts
- **expense_receipts** - Receipt storage and reference
- **expense_notes** - Communication and notes during approval
- **expense_audit_log** - Complete audit trail of all changes
- **expense_attachments** - File references for receipts/documents

### Workflow States

Expenses move through the following approval states:

```
draft → pending_approval → approved
                    ↓
                rejected → (can be resubmitted as draft)
                    ↑
              (recalled)
```

**State Definitions:**
- **draft**: Initial state, supervisor can edit freely
- **pending_approval**: Submitted to manager for review
- **approved**: Approved by manager, ready to record
- **rejected**: Rejected by manager with reason provided
- **recalled**: Recalled from pending state back to draft

## Usage Guide

### For Supervisors

#### Creating an Expense

1. Navigate to the Expense Management page
2. Click "New Expense"
3. Fill in the expense details:
   - **Category**: Select from available categories (Rent, Utilities, Payroll, etc.)
   - **Vendor Name**: Name of the supplier (optional)
   - **Description**: Detailed description of the expense
   - **Amount**: Expense amount
   - **Expense Date**: Date the expense occurred
   - **Payment Method**: Cash, Credit Card, Debit Card, Bank Transfer, Check
   - **Reference Number**: Invoice/Receipt number for tracking
   - **Tax Information**: Tax rate and deductibility status
   - **Notes**: Additional notes

4. Click "Create Expense" to save as draft

#### Submitting for Approval

1. Find the expense in draft state
2. Click "Submit" to send to manager for approval
3. The expense status changes to "pending_approval"
4. Manager receives notification

#### Managing Receipts

1. Click the "Receipt" button on any expense
2. Review the receipt preview
3. Click "Print/Download" to generate PDF
4. Receipt can be emailed or archived

#### Adding Notes

1. Click "View" on an expense
2. Go to the "Notes" tab
3. Add comments or additional information
4. Notes are visible to manager during approval

#### Tracking History

1. Click "View" on an expense
2. Go to the "History" tab
3. See all actions taken on the expense with timestamps and user roles

### For Managers

#### Reviewing Pending Expenses

1. Navigate to Expense Approval Dashboard
2. Click the "Pending Approval" tab
3. View all expenses awaiting approval
4. Summary cards show:
   - Number of pending expenses
   - Number of approved expenses
   - Number of rejected expenses
   - Total amounts for each status

#### Approving an Expense

1. Click "View" on the pending expense
2. Review all expense details
3. Optionally add approval notes
4. Click "Approve" to approve the expense
5. Approval is recorded with timestamp and user ID

#### Rejecting an Expense

1. Click "View" on the pending expense
2. Scroll to the rejection section
3. Provide a detailed rejection reason (required)
4. Click "Reject"
5. Supervisor receives notification and can revise and resubmit

#### Creating Direct Expenses

Managers can create expenses directly (pre-approved):

1. Click the "Create" tab
2. Fill in expense details
3. Click "Create Expense"
4. Expense is automatically set to approved status
5. No approval workflow needed

#### Generating Receipts

1. Click "View" on any approved expense
2. Click "Receipt" if not already generated
3. Review the formatted receipt
4. Print or download as PDF

## API Endpoints

### Expense Management

```
GET    /api/expenses              - Fetch expenses with filters
GET    /api/expenses/:id          - Get expense by ID
POST   /api/expenses              - Create new expense
PUT    /api/expenses/:id          - Update expense
DELETE /api/expenses/:id          - Delete expense
```

### Approval Workflow

```
POST   /api/expenses/:id/submit-approval   - Submit for approval
POST   /api/expenses/:id/approve           - Approve expense
POST   /api/expenses/:id/reject            - Reject expense
POST   /api/expenses/:id/recall            - Recall from pending
GET    /api/expenses/approval/pending      - Get pending expenses
GET    /api/expenses/approval/summary      - Get approval summary
```

### Receipts

```
POST   /api/expenses/:id/generate-receipt  - Generate receipt
GET    /api/expenses/:id/receipt           - Get receipt details
```

### Notes & History

```
POST   /api/expenses/:id/notes             - Add note
GET    /api/expenses/:id/notes             - Get all notes
GET    /api/expenses/:id/audit-log         - Get audit history
```

### Categories & More

```
GET    /api/expenses/categories            - Get all categories
POST   /api/expenses/categories            - Create category
GET    /api/expenses/analytics             - Get expense analytics
GET    /api/expenses/budgets               - Get budgets
```

## Frontend Components

### SupervisorExpenseManagement.tsx

Main component for supervisors to manage expenses.

**Key Features:**
- Create and edit expenses
- Submit for approval
- Generate receipts
- Add notes
- View history

**Usage:**
```tsx
import SupervisorExpenseManagement from '@/components/supervisor/ExpenseManagement';

export function Dashboard() {
  return <SupervisorExpenseManagement />;
}
```

### ManagerExpenseApproval.tsx

Dashboard for managers to review and approve expenses.

**Key Features:**
- View pending expenses
- Approve/reject with notes
- Create direct expenses
- Receipt generation
- Summary statistics

**Usage:**
```tsx
import ManagerExpenseApproval from '@/components/manager/ExpenseApproval';

export function ManagerDashboard() {
  return <ManagerExpenseApproval />;
}
```

### ReceiptGenerator.tsx

Modal component for generating and printing receipts.

**Usage:**
```tsx
import ReceiptGenerator from '@/components/ui/ReceiptGenerator';

const [showReceipt, setShowReceipt] = useState(false);

return (
  <>
    <button onClick={() => setShowReceipt(true)}>
      Generate Receipt
    </button>
    {showReceipt && (
      <ReceiptGenerator
        expense={selectedExpense}
        restaurantName="My Restaurant"
        restaurantAddress="123 Main St"
        restaurantPhone="(555) 123-4567"
        onClose={() => setShowReceipt(false)}
      />
    )}
  </>
);
```

## Custom Hooks

### useExpenseManagement()

Comprehensive hook for managing expense state and operations.

**Usage:**
```tsx
import { useExpenseManagement } from '@/hooks/useExpenseManagement';

export function MyComponent() {
  const {
    expenses,
    pendingExpenses,
    loading,
    error,
    loadExpenses,
    createNewExpense,
    approveExpenseRequest,
    rejectExpenseRequest,
    // ... more methods
  } = useExpenseManagement();

  useEffect(() => {
    loadExpenses({ approvalStatus: 'pending_approval' });
  }, []);

  return (
    // Component JSX
  );
}
```

## Receipt Generation

Receipts include:
- Restaurant information (name, address, phone)
- Receipt number and date
- Expense category and vendor
- Detailed description
- Calculation breakdown (subtotal, tax, total)
- Payment method and status
- Approval status
- Audit information

Recipients can:
- **Print**: Direct browser printing
- **Download**: As HTML/PDF via browser print function
- **Email**: Share from receipt component

## Approval Workflow Example

### Scenario: Supervisor Creates Expense

1. **Supervisor Creates Expense**
   - Status: `draft`
   - Can edit at any time
   - No approval needed yet

2. **Supervisor Generates Receipt**
   - Receipt created and stored
   - Can be printed/downloaded
   - Reference number automatically generated

3. **Supervisor Submits for Approval**
   - Status: `pending_approval`
   - Sent to manager queue
   - Supervisor can view but not edit
   - Audit log entry: "submitted_for_approval"

4. **Manager Reviews Pending Expenses**
   - Views on dashboard
   - Can see all notes and audit history
   - Checks receipt and details

5. **Manager Approves**
   - Status: `approved`
   - Can add approval notes
   - Audit log entry: "approved" with timestamp
   - Expense marked as finalized

6. **Alternative: Manager Rejects**
   - Status: `rejected`
   - Rejection reason required
   - Audit log entry: "rejected" with reason
   - Supervisor notified and can revise

## Key Features

### Audit Trail
Every action is logged with:
- Action type (created, updated, submitted, approved, rejected, etc.)
- User who performed action
- User role (supervisor, manager, admin)
- Timestamp
- Previous and new status
- Optional notes

### Communication
- Notes/comments system for manager-supervisor communication
- Rejection reasons clearly documented
- Approval notes for context
- Visible to all relevant parties

### Receipt Management
- Automatic receipt numbering
- Formatted receipts with all details
- Print/download functionality
- Tax calculations
- Payment status tracking

### Analytics
- Expenses by category
- Expenses by month
- Expenses by payment method
- Top vendors
- Recurring expenses total
- Tax deductible totals

### Filters & Search
- Filter by approval status
- Filter by user role
- Filter by date range
- Filter by amount range
- Search by vendor or description

## Database Migration

To set up the system, run the migration:

```bash
# PostgreSQL
npm run migrate

# This will run:
# - 018_expense_management.sql (initial schema)
# - 019_expense_approval_workflow.sql (approval workflow)
```

## Error Handling

The system handles common errors:

- **Validation Errors**: Missing required fields
- **Permission Errors**: Wrong role attempting action
- **Not Found Errors**: Expense/receipt doesn't exist
- **Duplicate Errors**: Creating duplicate category
- **Status Conflicts**: Invalid status transitions

All errors are logged and displayed to users with helpful messages.

## Security Considerations

1. **Role-Based Access**: Different views for supervisors and managers
2. **Audit Trail**: Complete history of all changes
3. **Data Validation**: Server-side validation of all inputs
4. **User Tracking**: All actions attributed to specific users
5. **Status Locking**: Approved/rejected can only be changed by recalling

## Performance Optimization

- **Pagination**: Expenses list is paginated (default 50 per page)
- **Indexed Queries**: Key fields indexed for fast filtering
- **Lazy Loading**: Relationships loaded on demand
- **Caching**: Categories and budgets cached where appropriate

## Troubleshooting

### Issue: Can't submit expense for approval
**Solution**: Ensure all required fields are filled (category, description, amount, date)

### Issue: Expense stuck in pending status
**Solution**: Manager must approve or reject. Contact manager if needed.

### Issue: Receipt not generating
**Solution**: Ensure expense is approved. Try refreshing the page.

### Issue: Notes not appearing
**Solution**: Refresh the page. Check browser console for errors.

## Future Enhancements

Potential improvements:
- Bulk approval/rejection
- Email notifications for approvals
- Receipt email delivery
- Expense templates
- Budget alerts and warnings
- Integration with accounting software
- Mobile app support
- Export to CSV/Excel
- Advanced filtering and sorting
- Multi-level approval (director approval)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review audit logs for error context
3. Check browser console for JavaScript errors
4. Contact development team with error details
