import { pool } from './src/db.ts';

async function seedInventory() {
  try {
    // Get all menu items
    const menuResult = await pool.query('SELECT id, name, price FROM menu_items');
    console.log(`Found ${menuResult.rows.length} menu items`);

    for (const item of menuResult.rows) {
      const unitCost = item.price > 20000 ? 1000 : item.price > 10000 ? 500 : 200;
      
      await pool.query(`
        INSERT INTO inventory_records (id, menu_item_id, stock, low_stock_threshold, reorder_point, reorder_qty, unit_cost, restaurant_id, created_at, updated_at)
        VALUES ($1, $2, 100, 10, 20, 50, $3, 'default_restaurant', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id
      `, [`inv_${item.id}`, item.id, unitCost]);
      
      console.log(`Seeded inventory for: ${item.name} (${item.id})`);
    }

    console.log('Inventory seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding inventory:', error);
    process.exit(1);
  }
}

seedInventory();
