import { pool } from './src/db.ts';

const TEST_TAG = 'TEST_DATA_';
const TEST_TIMESTAMP = new Date().toISOString();

/**
 * Seed Dummy Data for Testing
 * Creates test data across all restaurants with TEST_ prefix for easy cleanup
 */

async function seedDummyData() {
  console.log('🌱 Starting dummy data seeding...\n');
  
  try {
    // 1. Get all restaurants
    const restaurantsResult = await pool.query('SELECT id, name FROM restaurants WHERE is_active = true');
    const restaurants = restaurantsResult.rows;
    
    if (restaurants.length === 0) {
      console.warn('⚠️ No active restaurants found');
      return;
    }
    
    console.log(`✅ Found ${restaurants.length} active restaurants\n`);
    
    // 2. Seed data for each restaurant
    for (const restaurant of restaurants) {
      console.log(`📍 Seeding data for restaurant: ${restaurant.name} (${restaurant.id})`);
      
      await seedExpenses(restaurant.id);
      await seedWaste(restaurant.id);
      await seedInventoryAdjustments(restaurant.id);
      await seedOrders(restaurant.id);
      
      console.log(`   ✓ Completed for ${restaurant.name}\n`);
    }
    
    console.log('✨ Dummy data seeding complete!');
    console.log(`📝 All test data marked with prefix: "${TEST_TAG}"`);
    console.log('💡 Run: npm run clean-dummy-data (when ready to delete all test data)\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding dummy data:', error);
    process.exit(1);
  }
}

async function seedExpenses(restaurantId) {
  try {
    // Get or create expense categories
    const categoryResult = await pool.query(
      'SELECT id FROM expense_categories WHERE restaurant_id = $1 LIMIT 1',
      [restaurantId]
    );
    
    let categoryId;
    if (categoryResult.rows.length === 0) {
      // Create test expense category
      categoryId = `${TEST_TAG}cat_${Date.now()}`;
      await pool.query(
        `INSERT INTO expense_categories (id, restaurant_id, name, description, color)
         VALUES ($1, $2, $3, $4, $5)`,
        [categoryId, restaurantId, `${TEST_TAG}Supplies`, 'Test expense category', '#ff6b6b']
      );
    } else {
      categoryId = categoryResult.rows[0].id;
    }
    
    // Get a staff user (create if none)
    const staffResult = await pool.query(
      'SELECT id FROM staff WHERE restaurant_id = $1 AND role IN (\'manager\', \'admin\') LIMIT 1',
      [restaurantId]
    );
    
    let staffId = 'system';
    if (staffResult.rows.length > 0) {
      staffId = staffResult.rows[0].id;
    }
    
    // Create 5 test expenses
    const expenseTypes = [
      { vendor: 'ABC Supplies Ltd', desc: 'Kitchen supplies and utensils', amount: 15000 },
      { vendor: 'Fresh Foods Wholesale', desc: 'Produce and ingredients', amount: 45000 },
      { vendor: 'Tech Services Inc', desc: 'Software maintenance', amount: 8500 },
      { vendor: 'Cleaning Solutions Co', desc: 'Cleaning chemicals and equipment', amount: 12000 },
      { vendor: 'Utilities Provider', desc: 'Monthly electricity and water', amount: 35000 }
    ];
    
    for (const expense of expenseTypes) {
      const id = `${TEST_TAG}exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30)); // Random date in last 30 days
      
      await pool.query(
        `INSERT INTO expenses 
         (id, restaurant_id, category_id, vendor_name, description, amount, currency, 
          expense_date, payment_method, payment_status, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          id,
          restaurantId,
          categoryId,
          `${TEST_TAG}${expense.vendor}`,
          `[TEST] ${expense.desc}`,
          expense.amount,
          'RWF',
          date.toISOString().split('T')[0],
          ['cash', 'credit_card', 'bank_transfer'][Math.floor(Math.random() * 3)],
          ['pending', 'paid'][Math.floor(Math.random() * 2)],
          staffId
        ]
      );
    }
    
    console.log('   • Created 5 test expenses');
  } catch (error) {
    console.error('   ✗ Error seeding expenses:', error.message);
  }
}

async function seedWaste(restaurantId) {
  try {
    // Get menu items for this restaurant
    const itemsResult = await pool.query(
      'SELECT id, name FROM menu_items WHERE restaurant_id = $1 LIMIT 5',
      [restaurantId]
    );
    
    if (itemsResult.rows.length === 0) {
      console.log('   • Skipped waste seeding (no menu items)');
      return;
    }
    
    const menuItems = itemsResult.rows;
    const wasteReasons = ['expired', 'spoiled', 'damaged', 'overproduction', 'spillage'];
    
    for (const item of menuItems) {
      const id = `${TEST_TAG}waste_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));
      
      await pool.query(
        `INSERT INTO waste_entries 
         (id, restaurant_id, menu_item_id, menu_item_name, qty, reason, recorded_by, timestamp, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          restaurantId,
          item.id,
          item.name,
          Math.floor(Math.random() * 10) + 1,
          wasteReasons[Math.floor(Math.random() * wasteReasons.length)],
          'system',
          date.toISOString(),
          `[TEST] Dummy waste entry for testing`
        ]
      );
    }
    
    console.log('   • Created 5 test waste entries');
  } catch (error) {
    console.error('   ✗ Error seeding waste:', error.message);
  }
}

async function seedInventoryAdjustments(restaurantId) {
  try {
    // Get inventory records
    const inventoryResult = await pool.query(
      'SELECT id, menu_item_id, stock FROM inventory_records WHERE restaurant_id = $1 LIMIT 5',
      [restaurantId]
    );
    
    if (inventoryResult.rows.length === 0) {
      console.log('   • Skipped inventory seeding (no records)');
      return;
    }
    
    for (const item of inventoryResult.rows) {
      const id = `${TEST_TAG}mov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const adjustment = Math.floor(Math.random() * 20) - 10; // -10 to +10
      
      await pool.query(
        `INSERT INTO stock_movements 
         (id, restaurant_id, menu_item_id, type, qty, reference, performed_by, timestamp, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          restaurantId,
          item.menu_item_id,
          adjustment > 0 ? 'adjustment' : 'waste',
          Math.abs(adjustment),
          `${TEST_TAG}TEST_ADJ`,
          'system',
          new Date().toISOString(),
          `[TEST] Dummy stock movement for testing`
        ]
      );
    }
    
    console.log('   • Created 5 test inventory movements');
  } catch (error) {
    console.error('   ✗ Error seeding inventory:', error.message);
  }
}

async function seedOrders(restaurantId) {
  try {
    // Get tables
    const tablesResult = await pool.query(
      'SELECT id, table_name FROM tables WHERE restaurant_id = $1 LIMIT 3',
      [restaurantId]
    );
    
    if (tablesResult.rows.length === 0) {
      console.log('   • Skipped orders seeding (no tables)');
      return;
    }
    
    // Get menu items
    const menuResult = await pool.query(
      'SELECT id, price FROM menu_items WHERE restaurant_id = $1 LIMIT 10',
      [restaurantId]
    );
    
    if (menuResult.rows.length === 0) {
      console.log('   • Skipped orders seeding (no menu items)');
      return;
    }
    
    const tables = tablesResult.rows;
    const menuItems = menuResult.rows;
    
    // Create 3 test orders
    for (let i = 0; i < 3; i++) {
      const orderId = `${TEST_TAG}ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const table = tables[i % tables.length];
      
      // Create order
      await pool.query(
        `INSERT INTO orders 
         (id, restaurant_id, table_id, status, total_amount, currency, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          orderId,
          restaurantId,
          table.id,
          ['pending', 'served', 'completed'][Math.floor(Math.random() * 3)],
          50000,
          'RWF',
          `[TEST] Dummy order for testing`
        ]
      );
      
      // Add 2-3 items to order
      const itemCount = Math.floor(Math.random() * 2) + 2;
      for (let j = 0; j < itemCount; j++) {
        const item = menuItems[Math.floor(Math.random() * menuItems.length)];
        const itemId = `${TEST_TAG}oi_${orderId}_${j}`;
        
        await pool.query(
          `INSERT INTO order_items 
           (id, order_id, menu_item_id, quantity, unit_price, total_price, restaurant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            itemId,
            orderId,
            item.id,
            Math.floor(Math.random() * 3) + 1,
            item.price,
            item.price * (Math.floor(Math.random() * 3) + 1),
            restaurantId
          ]
        );
      }
    }
    
    console.log('   • Created 3 test orders with items');
  } catch (error) {
    console.error('   ✗ Error seeding orders:', error.message);
  }
}

// Run the seeding
seedDummyData();
