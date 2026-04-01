import { pool } from './src/db.ts';

const TEST_TAG = 'TEST_DATA_';

/**
 * Clean Dummy Data
 * Deletes all test data created by seed-dummy-data.mjs
 */

async function cleanDummyData() {
  console.log('🧹 Starting cleanup of test data...\n');
  
  try {
    let totalDeleted = 0;
    
    // Clean expenses and expense categories
    const expenseResult = await pool.query(
      `DELETE FROM expenses 
       WHERE vendor_name LIKE $1 OR description LIKE $1 OR id LIKE $1`,
      [`${TEST_TAG}%`]
    );
    console.log(`🗑️  Deleted ${expenseResult.rowCount} test expenses`);
    totalDeleted += expenseResult.rowCount;
    
    // Clean expense categories
    const catResult = await pool.query(
      `DELETE FROM expense_categories WHERE name LIKE $1 OR id LIKE $1`,
      [`${TEST_TAG}%`]
    );
    console.log(`🗑️  Deleted ${catResult.rowCount} test expense categories`);
    totalDeleted += catResult.rowCount;
    
    // Clean waste entries
    const wasteResult = await pool.query(
      `DELETE FROM waste_entries 
       WHERE id LIKE $1 OR menu_item_name LIKE $1 OR notes LIKE $1`,
      [`${TEST_TAG}%`]
    );
    console.log(`🗑️  Deleted ${wasteResult.rowCount} test waste entries`);
    totalDeleted += wasteResult.rowCount;
    
    // Clean stock movements
    const movResult = await pool.query(
      `DELETE FROM stock_movements 
       WHERE id LIKE $1 OR reference LIKE $1 OR notes LIKE $1`,
      [`${TEST_TAG}%`]
    );
    console.log(`🗑️  Deleted ${movResult.rowCount} test stock movements`);
    totalDeleted += movResult.rowCount;
    
    // Clean order items (must be before orders)
    const orderItemsResult = await pool.query(
      `DELETE FROM order_items WHERE id LIKE $1`,
      [`${TEST_TAG}%`]
    );
    console.log(`🗑️  Deleted ${orderItemsResult.rowCount} test order items`);
    totalDeleted += orderItemsResult.rowCount;
    
    // Clean orders
    const orderResult = await pool.query(
      `DELETE FROM orders 
       WHERE id LIKE $1 OR notes LIKE $1`,
      [`${TEST_TAG}%`]
    );
    console.log(`🗑️  Deleted ${orderResult.rowCount} test orders`);
    totalDeleted += orderResult.rowCount;
    
    console.log(`\n✨ Cleanup complete!`);
    console.log(`📊 Total records deleted: ${totalDeleted}`);
    console.log('\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning up dummy data:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanDummyData();
