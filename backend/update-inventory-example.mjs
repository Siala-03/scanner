// Example script to update inventory for a menu item
// This demonstrates how to use the inventory API to update stock levels

import { updateInventoryRecord } from '../src/api/inventory.js';

// Example: Update inventory for "amstel" (you'll need to replace with actual menu item ID)
async function updateAmstelInventory() {
  try {
    // Replace 'amstel-id' with the actual menu item ID for Amstel
    const menuItemId = 'amstel-id'; // e.g., 'item_abc123'
    
    // Update the inventory record
    const result = await updateInventoryRecord(menuItemId, {
      stock: 50,                    // Set stock to 50 units
      lowStockThreshold: 10,        // Alert when stock falls below 10
      reorderPoint: 15,             // Reorder when stock reaches 15
      reorderQty: 100,              // Order 100 units when reordering
      unitCost: 2.50,               // Cost per unit
      location: 'Bar Storage'       // Storage location
    });
    
    console.log('Inventory updated successfully:', result);
  } catch (error) {
    console.error('Failed to update inventory:', error);
  }
}

// Example: Update only the stock level
async function updateStockOnly(menuItemId, newStock) {
  try {
    const result = await updateInventoryRecord(menuItemId, {
      stock: newStock
    });
    
    console.log('Stock updated successfully:', result);
  } catch (error) {
    console.error('Failed to update stock:', error);
  }
}

// Example: Update multiple fields at once
async function updateMultipleFields(menuItemId, updates) {
  try {
    const result = await updateInventoryRecord(menuItemId, updates);
    
    console.log('Inventory updated successfully:', result);
  } catch (error) {
    console.error('Failed to update inventory:', error);
  }
}

// To use these functions:
// 1. Find the menu item ID for Amstel from your database
// 2. Call the function with the correct ID
// 
// Example usage:
// updateStockOnly('amstel-menu-item-id', 75);
// 
// Or update multiple fields:
// updateMultipleFields('amstel-menu-item-id', {
//   stock: 75,
//   lowStockThreshold: 15,
//   unitCost: 2.75
// });

console.log('Inventory update examples loaded. See functions above for usage.');
