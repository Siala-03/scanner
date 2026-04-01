# Dummy Data Testing Guide

## Overview
Created two scripts to help you test different aspects of the application across all accounts/restaurants:

- **`seed-dummy-data.mjs`** - Creates test data
- **`clean-dummy-data.mjs`** - Deletes all test data

All test data is marked with the prefix `TEST_DATA_` for easy identification and cleanup.

---

## 📋 What Gets Seeded?

The dummy data script creates test data for each active restaurant in the system:

### 1. **Expenses** (5 per restaurant)
- Kitchen supplies, ingredients, software, cleaning, utilities
- Random dates (last 30 days)
- Different payment methods (cash, credit card, bank transfer)
- Mixed payment statuses (pending, paid)
- Amount range: 8,500 - 45,000 RWF

### 2. **Waste Entries** (1 per menu item, up to 5)
- Created from existing menu items
- Various reasons: expired, spoiled, damaged, overproduction, spillage
- Random quantities (1-10)
- Marked as "[TEST] Dummy waste entry"

### 3. **Stock Movements** (1 per inventory record, up to 5)
- Inventory adjustments and movements
- Random fluctuations (-10 to +10)
- Tracks as either adjustment or waste movement

### 4. **Orders** (3 per restaurant)
- Created for existing tables
- 2-3 items per order
- Random statuses: pending, served, completed
- Each with multiple order items

**All data is easily identifiable and deletable via the cleanup script.**

---

## 🚀 How to Use

### Step 1: Navigate to Backend Directory
```bash
cd backend
```

### Step 2: Seed Dummy Data
```bash
npm run seed-dummy-data
```

**Output example:**
```
🌱 Starting dummy data seeding...

✅ Found 3 active restaurants

📍 Seeding data for restaurant: Default Restaurant (default_restaurant)
   • Created 5 test expenses
   • Created 5 test waste entries
   • Created 5 test inventory movements
   • Created 3 test orders with items
   ✓ Completed for Default Restaurant

✨ Dummy data seeding complete!
📝 All test data marked with prefix: "TEST_DATA_"
💡 Run: npm run clean-dummy-data (when ready to delete all test data)
```

### Step 3: Test Your Features
Now you can:
- Test expense filtering and approval workflows
- Test waste tracking and analysis
- Test inventory management and stock movements
- Test order management and KPIs
- Test AI insights with populated data

### Step 4: Clean Up Test Data
```bash
npm run clean-dummy-data
```

**Output example:**
```
🧹 Starting cleanup of test data...

🗑️  Deleted 15 test expenses
🗑️  Deleted 3 test expense categories
🗑️  Deleted 15 test waste entries
🗑️  Deleted 15 test stock movements
🗑️  Deleted 9 test order items
🗑️  Deleted 3 test orders

✨ Cleanup complete!
📊 Total records deleted: 60
```

---

## 🔍 How to Identify Test Data

### In the Database
Test data can be identified by:
- IDs starting with `TEST_DATA_`
- Vendor names with `TEST_DATA_` prefix (expenses)
- Menu item names with `TEST_DATA_` prefix (waste)
- Notes containing `[TEST]` tag

### In the UI
Watch for:
- Expense vendors like `TEST_DATA_ABC Supplies Ltd`
- Menu item names with `[TEST]` prefix in waste logs
- Table names like `[TEST]` in orders

---

## 📊 Testing Workflow Example

### Scenario: Test Expense Approval Workflow
1. **Seed data**: `npm run seed-dummy-data`
2. **Go to Manager Portal** → Expense Approval
3. **See test expenses** with status "pending" or "paid"
4. **Test filtering**: Filter by vendor, date range, amount, status
5. **Test approval**: Approve/reject test expenses
6. **Verify**: Check created expense categories and movements
7. **Clean up**: `npm run clean-dummy-data`

### Scenario: Test Inventory & Waste Analysis
1. **Seed data**: `npm run seed-dummy-data`
2. **Check Inventory Tab**: See test stock movements
3. **Check Waste Tab**: See waste entries with different reasons
4. **Test filtering**: Filter by reason, date, menu item
5. **Test AI Insights**: Ask the AI about waste patterns
6. **Clean up**: `npm run clean-dummy-data`

### Scenario: Test KPI Calculations
1. **Seed data**: `npm run seed-dummy-data`
2. **Check Analytics**: View order metrics, expense summaries
3. **Test Reports**: Generate reports with test data
4. **Verify calculations**: Check totals and averages
5. **Clean up**: `npm run clean-dummy-data`

---

## 🎯 Per-Restaurant Data Distribution

Each active restaurant receives:
- **5 test expenses** - across different categories
- **Up to 5 waste entries** - from existing menu items
- **Up to 5 inventory movements** - from existing inventory
- **3 test orders** - spread across existing tables

This ensures realistic testing across your multi-tenant system.

---

## ⚠️ Important Notes

1. **Data Isolation**: Test data is per-restaurant. Each one gets their own isolated test data set.

2. **Prerequisites**: 
   - Restaurants must be marked as `is_active = true`
   - Menu items must exist before waste/orders can be created
   - Tables must exist before orders can be created

3. **Safe to Run Multiple Times**: 
   - Seeding script can run multiple times safely
   - Creates new records each time (doesn't duplicate)
   - Cleanup will still remove all test records

4. **Backup Before Testing**:
   - Consider backing up sensitive data before heavy testing
   - Test data is marked clearly, but be cautious with production DBs

5. **Manual Cleanup**:
   - If cleanup script fails, manually delete records with ID like `TEST_DATA_%`
   - Or filter by vendor_name/description containing `TEST_DATA_`

---

## 🔧 Customizing Test Data

To modify the dummy data being created:

1. **Edit amount ranges**: Look for `expenseTypes` array in `seed-dummy-data.mjs`
2. **Add more expenses**: Duplicate an expense entry in the loop
3. **Change waste reasons**: Modify the `wasteReasons` array
4. **Adjust quantities**: Change the random ranges (e.g., `Math.random() * 20`)

### Example: Increase test expenses from 5 to 10
```javascript
const expenseTypes = [
  // ... existing 5 ...
  { vendor: 'Security Services', desc: 'Security patrol', amount: 18000 },
  { vendor: 'Maintenance Crew', desc: 'Equipment repairs', amount: 22000 },
  { vendor: 'Laundry Services', desc: 'Linen cleaning', amount: 9500 },
  { vendor: 'Waste Management', desc: 'Garbage collection', amount: 6000 },
];
```

---

## 📞 Troubleshooting

### "No active restaurants found"
- Ensure at least one restaurant is marked as `is_active = true` in the `restaurants` table

### "Skipped waste seeding (no menu items)"
- Menu items must exist before creating waste entries
- Run basic menu seeding first if needed

### "Error: relation does not exist"
- Ensure all migrations have been run: `npm run migrate`

### "Cleanup deletes nothing"
- All test records were already deleted
- Or data wasn't created from the seed script

### "Foreign key constraint violation"
- Some parent records may have been deleted manually
- Clean up any orphaned test records manually from DB

---

## 📝 Summary

| Command | Purpose |
|---------|---------|
| `npm run seed-dummy-data` | Create test data for all restaurants |
| `npm run clean-dummy-data` | Delete all created test data |
| `npm run seed-inventory` | Original inventory seeding (existing) |
| `npm run migrate` | Run database migrations |

Use these scripts to confidently test your application features with realistic data across all accounts!
