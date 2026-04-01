// Practical example: Update inventory for Amstel
// This script shows how to find a menu item and update its inventory

import { pool } from './src/db.js';
import { updateInventoryRecord } from './src/api/inventory.js';

async function findMenuItemByName(name) {
  const result = await pool.query(
    'SELECT id, name, category FROM menu WHERE name ILIKE $1',
    [`%${name}%`]
  );
  return result.rows;
}

async function updateAmstelStock() {
  try {
    // Step 1: Find the Amstel menu item
    console.log('Searching for Amstel menu item...');
    const menuItems = await findMenuItemByName('amstel');
    
    if (menuItems.length === 0) {
      console.log('No menu items found matching "amstel"');
      return;
    }
    
    console.log('Found menu items:', menuItems);
    
    // Step 2: Update inventory for the first matching item
    const menuItem = menuItems[0];
    console.log(`Updating inventory for: ${menuItem.name} (ID: ${menuItem.id})`);
    
    const result = await updateInventoryRecord(menuItem.id, {
      stock: 50,
      lowStockThreshold: 10,
      reorderPoint: 15,
      reorderQty: 100,
      unitCost: 2.50,
      location: 'Bar Storage'
    });
    
    console.log('✓ Inventory updated successfully!');
    console.log('Updated record:', result);
    
  } catch (error) {
    console.error('✗ Failed to update inventory:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the update
updateAmstelStock();
