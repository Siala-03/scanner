# 📋 Online Order Approval Workflow - Complete Guide

## 🔄 The New Workflow (with Supervisor Approval)

### Step-by-Step Order Flow:

```
1. Customer Places Order (via QR Code)
        ↓
2. Order Status: PENDING (⏳ Awaiting Supervisor Approval)
        ↓
   📱 Appears in: Waiter Dashboard & Supervisor Dashboard
        ↓
3. Supervisor Reviews & Approves
        ↓
4. Order Status: VERIFIED (✅ Approved)
        ↓
   👨‍🍳 Sent to: Kitchen
        ↓
5. Kitchen Prepares Order
        ↓
6. Order Status: PREPARING (👨‍🍳 Being Prepared)
        ↓
7. Kitchen Finishes
        ↓
8. Order Status: READY (🎯 Ready for Pickup)
        ↓
9. Waiter Delivers to Customer
        ↓
10. Order Status: SERVED (✅ Complete)
```

---

## 👨‍💼 For Supervisors - How to Approve Orders

### Where to Find Pending Orders:
1. Go to **Supervisor Dashboard**
2. Look for **"📱 Online Orders"** section
3. See the status summary at the top showing:
   - 🔴 **Awaiting Approval** - Orders that need your approval
   - 🔵 **Approved** - Orders you've approved (sent to kitchen)
   - 🟠 **Preparing** - Kitchen is working on these
   - 🟢 **Ready** - Ready for waiter to pick up

### To Approve an Order:

**Step 1:** Look in the red **"⚠️ Awaiting Supervisor Approval"** section

**Step 2:** Review the order:
- Customer name
- Items ordered (with quantities)
- Special instructions (dietary requirements, etc.)
- Total amount

**Step 3:** Click one of two buttons:
- **✅ Approve** - Order goes to kitchen immediately
- **❌ Reject** - Order is cancelled (customer gets notification)

### Why Approve/Reject?
- **Approve** - When you're ready for kitchen to start preparing, or order is valid
- **Reject** - If items are out of stock, kitchen is too busy, or customer has special requests you can't fulfill

### Best Practices:
1. Review orders **immediately** when they appear
2. Don't leave orders waiting too long (customer sees the order is pending)
3. Communicate with kitchen if you're approving a large order
4. If rejecting, consider contacting customer via email to explain
5. During peak hours, you may want to batch-approve multiple orders

---

## 🚀 For Waiters - What You'll See

### Waiter Dashboard Changes:

You'll see online orders in three sections (in this priority order):

#### **Section 1: 🎯 Ready for Pickup (Highest Priority)**
- Orders that are finished and ready
- Click **"Mark Served ✓"** when you deliver to customer
- Customer is waiting for this!

#### **Section 2: 👨‍🍳 Being Prepared (Medium Priority)**
- Orders in the kitchen
- Can't do anything yet, just informational
- Check back later when it moves to "Ready"

#### **Section 3: ⏳ Awaiting Supervisor Approval (Lower Priority)**
- New online orders that supervisor hasn't approved yet
- **You CAN'T approve these** - only supervisor can
- Shows a message: "⏳ Awaiting Supervisor Approval"
- Don't worry about these until supervisor approves them

### Your Tasks:
1. **Check regularly** - Orders may appear suddenly
2. **Priority:** Always check "Ready for Pickup" first
3. **Deliver promptly** - Customers are waiting
4. **Mark as served** - Click button when customer has order
5. **Alert supervisor** - If kitchen is slow, let supervisor know

---

## 👨‍🍳 For Kitchen - What Changes

### Kitchen Sees Orders When:
✅ **ONLY after supervisor has approved them** (Status: VERIFIED)

### Kitchen Will NOT See:
❌ Orders that are still "Pending" (awaiting supervisor approval)

### What Kitchen Needs to Do:
1. Look for approved online orders (marked as "Online Order")
2. Prepare items according to special instructions
3. Mark order as "Ready" when done
4. Place in pickup area with order number visible

### New Responsibility:
- If you see a lot of pending orders from supervisor, it means they're approving them - expect a rush!

---

## 👥 Complete User View

### Supervisor Can:
- ✅ See ALL online orders
- ✅ Approve/Reject pending orders
- ✅ Monitor order progress
- ✅ See which orders are ready for waiter

### Waiter Can:
- ✅ See online orders in their section
- ✅ Mark ready orders as served
- ✅ See special instructions
- ❌ Cannot approve orders
- ❌ Cannot see pending orders that need approval (just shows they're waiting)

### Kitchen Can:
- ✅ See approved orders
- ✅ Check special instructions
- ✅ Mark when ready
- ❌ Cannot see pending orders
- ❌ Cannot approve orders

---

## 🎯 Example Scenario

### Scenario 1: Normal Order Flow

```
12:00 PM - Customer scans QR code and orders:
  - 2x Burger
  - 1x Fries
  - 1x Soda
  
12:00:01 - Order appears on Supervisor & Waiter dashboard as "PENDING"
  
12:00:05 - Supervisor sees notification and clicks "Approve"
  
12:00:10 - Order status changes to "VERIFIED"
         - Order appears in Kitchen
         - Waiter sees it in "Being Prepared" section
         
12:05 - Kitchen starts preparing
       - Status shows "PREPARING"
       
12:15 - Kitchen finishes
       - Status changes to "READY"
       - Waiter sees it in "Ready for Pickup" section
       
12:15:30 - Waiter picks up order, delivers to customer
           - Clicks "Mark Served ✓"
           - Status becomes "SERVED"
           - Customer gets email: "Order Ready for Pickup"
           
12:16 - Customer is happy! 🎉
```

### Scenario 2: Supervisor Rejects Order

```
12:00 - Customer orders 10 Burgers (large order)
        
12:00:05 - Supervisor sees order, checks with kitchen
           Kitchen says "too busy right now"
           Supervisor clicks "Reject"
           
12:00:10 - Order status: "CANCELLED"
           - Order removed from system
           - Customer gets email: "Order Cancelled"
           - Maybe: "We're too busy right now, try again in 15 min"
           
12:15 - Kitchen quieter, customer places order again
        Supervisor approves this time ✓
```

---

## ⚠️ Important Notes

### Timing Matters:
- Don't approve orders if kitchen is slammed
- Coordinate with kitchen on capacity
- Peak hours: You might want 2 supervisors approving

### Communication:
- If rejecting, consider why (out of stock? too busy? special request?)
- Let customer know via email if rejecting
- Kitchen needs to tell supervisor when they're ready for more orders

### Monitoring:
- Keep an eye on "Awaiting Approval" count
- If it grows, approve faster or adjust capacity
- If it's zero, you might be able to accept more online orders

---

## 🔧 Technical Details

### Order Status Flow:
```
pending
  ↓ (Supervisor approves)
verified
  ↓ (Kitchen starts)
preparing
  ↓ (Kitchen finishes)
ready
  ↓ (Waiter delivers)
served
  ✓ (Complete)
```

### Or if Rejected:
```
pending
  ↓ (Supervisor rejects)
cancelled
  ✗ (Order removed)
```

### Database Tracking:
- All online orders have `is_online_order = true`
- Status stored in `status` column
- Supervisor can filter to see all pending orders

---

## 📊 Supervisor Dashboard Counters

Watch these counters to manage flow:

| Counter | What It Means | Action |
|---------|--------------|--------|
| 🔴 Awaiting Approval | Orders need your decision | Review & approve/reject |
| 🔵 Approved | Orders sent to kitchen | Monitor progress |
| 🟠 Preparing | Kitchen is working | Check kitchen pace |
| 🟢 Ready | Waiter should pick up | Verify waiter is on it |

---

## 🚨 Troubleshooting

### Q: Why don't I see online orders in Kitchen?
**A:** Supervisor hasn't approved them yet. Check Supervisor Dashboard.

### Q: Order is stuck in "Awaiting Approval"?
**A:** Supervisor is busy. Check with them or help approve orders.

### Q: Waiter sees order but it's not in Kitchen?
**A:** Status is still "Pending" - supervisor hasn't approved yet.

### Q: Can I approve orders from Waiter dashboard?
**A:** No, only Supervisor can approve. Waiter can only mark as served.

### Q: What if I reject an order by accident?
**A:** Customer gets cancellation email. Contact them to place new order.

---

## ✅ Approval Checklist for Supervisors

Before clicking "Approve":
- [ ] Items are available in kitchen
- [ ] Kitchen has capacity to start now
- [ ] No special requests we can't fulfill
- [ ] Customer name is clear
- [ ] Total amount is correct
- [ ] Check for any special instructions

---

## 📞 Quick Reference

**Supervisor:** Approves/Rejects pending orders
**Waiter:** Delivers ready orders
**Kitchen:** Prepares approved orders
**Customer:** Places order → Gets notification when ready

---

**The Key Difference:** Online orders now need Supervisor approval before going to kitchen. This prevents kitchen overload and ensures orders are verified.

**Good luck!** 🎉
