# 🚀 Quick Start: Dummy Data for Testing

## One-Minute Setup

### 1️⃣ Create Test Data
```bash
cd backend
npm run seed-dummy-data
```
✅ This adds test data to ALL active restaurants in the system

### 2️⃣ Test Your Features
Go test expenses, waste, inventory, orders, and KPIs!

### 3️⃣ Delete Test Data
```bash
npm run clean-dummy-data
```
✅ This removes ALL test data across all restaurants

---

## 📊 What Gets Created?

For **each restaurant**:
- 5 test expenses (utilities, supplies, ingredients, etc.)
- 5 test waste entries (with different reasons)
- 5 test inventory movements
- 3 test orders (with order items)

**All marked with `TEST_DATA_` prefix for easy identification**

---

## 🎯 Testing Workflows

### Test Expense Management
```
1. npm run seed-dummy-data
2. Go to Manager → Expense Approval
3. Filter, approve, reject test expenses
4. Check categories and movements
5. npm run clean-dummy-data
```

### Test Waste Tracking
```
1. npm run seed-dummy-data
2. Go to Inventory → Waste Tab
3. View test entries with different reasons
4. Test filters and analysis
5. npm run clean-dummy-data
```

### Test Orders & KPIs
```
1. npm run seed-dummy-data
2. Go to Orders → View orders with items
3. Check analytics and KPI calculations
4. Test report generation
5. npm run clean-dummy-data
```

---

## ✨ Features

✅ **Multi-tenant Ready**: Creates isolated test data per restaurant
✅ **Easy Cleanup**: One command deletes everything
✅ **Safe to Run Multiple Times**: No duplicates, just creates more data
✅ **Realistic Data**: Random dates, amounts, statuses
✅ **Comprehensive**: Tests expenses, waste, inventory, orders

---

## 📋 All Commands

```bash
# Create dummy data
npm run seed-dummy-data

# Delete all dummy data
npm run clean-dummy-data

# (Original commands still available)
npm run seed-inventory     # Seed menu item inventory
npm run migrate            # Run database migrations
```

---

## 🔍 Identify Test Data

Look for these markers:
- IDs starting with: `TEST_DATA_`
- Vendor names with: `TEST_DATA_` prefix
- Notes/descriptions with: `[TEST]` tag

---

## ⚡ Pro Tips

💡 **Run multiple times for more data**: Each run creates fresh test data
💡 **Safe for development**: Won't affect production restaurants
💡 **Per-restaurant isolation**: Each gets its own test data set
💡 **Customize it**: Edit the .mjs files to adjust amounts, quantities, types

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| "No restaurants found" | Ensure `restaurants` table has active records |
| "Skipped waste seeding" | Create menu items first |
| Permission errors | Check DB connection in `.env` |
| Cleanup deletes nothing | All test data already removed |

---

**Ready to test? Run: `npm run seed-dummy-data`** 🎉
