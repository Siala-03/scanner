import { pool } from '../db.js';
import { emitInventoryUpdate } from '../socket.js';

export interface RecipeIngredient {
  id: string;
  restaurantId: string;
  menuItemId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unitOfMeasure: string;
  yieldPercentage: number;
  isOptional: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeRequirement {
  menuItemId: string;
  menuItemName: string;
  ingredients: {
    inventoryItemId: string;
    inventoryItemName: string;
    quantityNeeded: number;
    quantityAvailable: number;
    unitOfMeasure: string;
    canFulfill: boolean;
  }[];
  canFulfillAll: boolean;
  maxServings: number;
}

// Get all recipe ingredients for a menu item
export async function getRecipeIngredients(
  menuItemId: string,
  restaurantId: string
): Promise<RecipeIngredient[]> {
  const result = await pool.query(`
    SELECT 
      ri.id,
      ri.restaurant_id,
      ri.menu_item_id,
      ri.inventory_item_id,
      ii.name as inventory_item_name,
      ri.quantity,
      ri.unit_of_measure,
      ri.yield_percentage,
      ri.is_optional,
      ri.created_at,
      ri.updated_at
    FROM recipe_ingredients ri
    LEFT JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.menu_item_id = $1 AND ri.restaurant_id = $2
    ORDER BY ri.created_at ASC
  `, [menuItemId, restaurantId]);

  return result.rows.map(row => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    menuItemId: row.menu_item_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: row.inventory_item_name || '',
    quantity: row.quantity,
    unitOfMeasure: row.unit_of_measure,
    yieldPercentage: row.yield_percentage,
    isOptional: row.is_optional,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// Add ingredient to recipe
export async function addRecipeIngredient(
  menuItemId: string,
  restaurantId: string,
  inventoryItemId: string,
  quantity: number,
  unitOfMeasure: string,
  yieldPercentage: number = 100,
  isOptional: boolean = false
): Promise<RecipeIngredient> {
  const id = `recipe_ing_${Date.now().toString(36)}`;
  
  const result = await pool.query(`
    INSERT INTO recipe_ingredients
      (id, restaurant_id, menu_item_id, inventory_item_id, quantity, unit_of_measure, yield_percentage, is_optional)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [id, restaurantId, menuItemId, inventoryItemId, quantity, unitOfMeasure, yieldPercentage, isOptional]);

  const row = result.rows[0];

  // Get inventory item name
  const itemResult = await pool.query(`
    SELECT name FROM inventory_items WHERE id = $1
  `, [inventoryItemId]);

  emitInventoryUpdate({ type: 'recipe_change', menuItemId });

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    menuItemId: row.menu_item_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: itemResult.rows[0]?.name || '',
    quantity: row.quantity,
    unitOfMeasure: row.unit_of_measure,
    yieldPercentage: row.yield_percentage,
    isOptional: row.is_optional,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Update recipe ingredient
export async function updateRecipeIngredient(
  ingredientId: string,
  restaurantId: string,
  updates: Partial<{
    quantity: number;
    unitOfMeasure: string;
    yieldPercentage: number;
    isOptional: boolean;
  }>
): Promise<RecipeIngredient | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.quantity !== undefined) {
    setClauses.push(`quantity = $${paramIndex++}`);
    values.push(updates.quantity);
  }
  if (updates.unitOfMeasure !== undefined) {
    setClauses.push(`unit_of_measure = $${paramIndex++}`);
    values.push(updates.unitOfMeasure);
  }
  if (updates.yieldPercentage !== undefined) {
    setClauses.push(`yield_percentage = $${paramIndex++}`);
    values.push(updates.yieldPercentage);
  }
  if (updates.isOptional !== undefined) {
    setClauses.push(`is_optional = $${paramIndex++}`);
    values.push(updates.isOptional);
  }

  if (setClauses.length === 0) {
    const result = await pool.query(`
      SELECT 
        ri.*,
        ii.name as inventory_item_name
      FROM recipe_ingredients ri
      LEFT JOIN inventory_items ii ON ii.id = ri.inventory_item_id
      WHERE ri.id = $1 AND ri.restaurant_id = $2
    `, [ingredientId, restaurantId]);
    
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      restaurantId: row.restaurant_id,
      menuItemId: row.menu_item_id,
      inventoryItemId: row.inventory_item_id,
      inventoryItemName: row.inventory_item_name,
      quantity: row.quantity,
      unitOfMeasure: row.unit_of_measure,
      yieldPercentage: row.yield_percentage,
      isOptional: row.is_optional,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(ingredientId);
  values.push(restaurantId);

  const result = await pool.query(`
    UPDATE recipe_ingredients
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex++} AND restaurant_id = $${paramIndex}
    RETURNING *
  `, values);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Get inventory item name
  const itemResult = await pool.query(`
    SELECT name FROM inventory_items WHERE id = $1
  `, [row.inventory_item_id]);

  emitInventoryUpdate({ type: 'recipe_change', menuItemId: row.menu_item_id });

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    menuItemId: row.menu_item_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: itemResult.rows[0]?.name || '',
    quantity: row.quantity,
    unitOfMeasure: row.unit_of_measure,
    yieldPercentage: row.yield_percentage,
    isOptional: row.is_optional,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Delete recipe ingredient
export async function deleteRecipeIngredient(
  ingredientId: string,
  restaurantId: string
): Promise<boolean> {
  const getResult = await pool.query(`
    SELECT menu_item_id FROM recipe_ingredients 
    WHERE id = $1 AND restaurant_id = $2
  `, [ingredientId, restaurantId]);

  const result = await pool.query(`
    DELETE FROM recipe_ingredients
    WHERE id = $1 AND restaurant_id = $2
    RETURNING *
  `, [ingredientId, restaurantId]);

  if (result.rows.length > 0 && getResult.rows.length > 0) {
    emitInventoryUpdate({ type: 'recipe_change', menuItemId: getResult.rows[0].menu_item_id });
    return true;
  }
  return false;
}

// Check stock requirements for menu item order
export async function checkStockRequirements(
  menuItemId: string,
  restaurantId: string,
  quantity: number = 1,
  locationId?: string
): Promise<RecipeRequirement> {
  // Get menu item
  const menuResult = await pool.query(`
    SELECT name FROM menu_items WHERE id = $1
  `, [menuItemId]);

  if (menuResult.rows.length === 0) {
    throw new Error('Menu item not found');
  }

  const menuItemName = menuResult.rows[0].name;

  // Get recipe ingredients
  const ingredientsResult = await pool.query(`
    SELECT 
      ri.id,
      ri.inventory_item_id,
      ii.name as inventory_item_name,
      ii.unit_of_measure,
      ri.quantity,
      ri.yield_percentage
    FROM recipe_ingredients ri
    LEFT JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.menu_item_id = $1 AND ri.restaurant_id = $2
    ORDER BY ri.created_at ASC
  `, [menuItemId, restaurantId]);

  // Get available stock for each ingredient
  const ingredients = [];
  let canFulfillAll = true;
  let maxServings = Infinity;

  for (const ingredient of ingredientsResult.rows) {
    // Calculate base quantity needed
    const baseQuantityNeeded = ingredient.quantity * quantity;
    const adjustedQuantityNeeded = (baseQuantityNeeded * ingredient.yield_percentage) / 100;

    // Get available stock
    let quantityAvailable = 0;
    
    if (locationId) {
      // Get from specific location
      const stockResult = await pool.query(`
        SELECT COALESCE(SUM(quantity), 0) as qty
        FROM inventory_stock
        WHERE inventory_item_id = $1 AND location_id = $2 AND restaurant_id = $3
      `, [ingredient.inventory_item_id, locationId, restaurantId]);
      quantityAvailable = stockResult.rows[0]?.qty || 0;
    } else {
      // Get from all locations
      const stockResult = await pool.query(`
        SELECT COALESCE(SUM(quantity), 0) as qty
        FROM inventory_stock
        WHERE inventory_item_id = $1 AND restaurant_id = $2
      `, [ingredient.inventory_item_id, restaurantId]);
      quantityAvailable = stockResult.rows[0]?.qty || 0;
    }

    const canFulfill = quantityAvailable >= adjustedQuantityNeeded;
    
    if (!canFulfill && !ingredient.isOptional) {
      canFulfillAll = false;
    }

    // Calculate max servings from this ingredient
    if (!ingredient.isOptional && adjustedQuantityNeeded > 0) {
      const servingsFromIngredient = Math.floor(quantityAvailable / (ingredient.quantity * ingredient.yield_percentage / 100));
      maxServings = Math.min(maxServings, servingsFromIngredient);
    }

    ingredients.push({
      inventoryItemId: ingredient.inventory_item_id,
      inventoryItemName: ingredient.inventory_item_name,
      quantityNeeded: adjustedQuantityNeeded,
      quantityAvailable,
      unitOfMeasure: ingredient.unit_of_measure,
      canFulfill,
    });
  }

  if (maxServings === Infinity) {
    maxServings = quantity;
  }

  return {
    menuItemId,
    menuItemName,
    ingredients,
    canFulfillAll,
    maxServings,
  };
}

// Auto-deduct stock when order is created (optional - can be called from order service)
export async function deductStockForRecipe(
  menuItemId: string,
  restaurantId: string,
  quantity: number = 1,
  locationId: string,
  performedBy: string,
  orderNumber?: string
): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get recipe ingredients
    const ingredientsResult = await client.query(`
      SELECT 
        ri.inventory_item_id,
        ri.quantity,
        ri.yield_percentage
      FROM recipe_ingredients ri
      WHERE ri.menu_item_id = $1 AND ri.restaurant_id = $2
    `, [menuItemId, restaurantId]);

    // Deduct each ingredient
    for (const ingredient of ingredientsResult.rows) {
      const quantityToDeduct = (ingredient.quantity * quantity * ingredient.yield_percentage) / 100;

      // Get current stock with lock
      const stockResult = await client.query(`
        SELECT * FROM inventory_stock
        WHERE inventory_item_id = $1 AND location_id = $2
        FOR UPDATE
      `, [ingredient.inventory_item_id, locationId]);

      if (stockResult.rows.length === 0) {
        throw new Error(`Stock not found for item ${ingredient.inventory_item_id}`);
      }

      const stock = stockResult.rows[0];
      const newQuantity = Math.max(0, stock.quantity - quantityToDeduct);

      // Update stock
      await client.query(`
        UPDATE inventory_stock
        SET quantity = $1, updated_at = NOW()
        WHERE inventory_item_id = $2 AND location_id = $3
      `, [newQuantity, ingredient.inventory_item_id, locationId]);

      // Record movement
      const movementId = `mov_${Date.now().toString(36)}`;
      await client.query(`
        INSERT INTO stock_movements_enhanced
          (id, restaurant_id, inventory_item_id, from_location_id,
           movement_type, quantity, quantity_before, quantity_after, performed_by, notes)
        VALUES ($1, $2, $3, $4, 'order', $5, $6, $7, $8, $9)
      `, [
        movementId,
        restaurantId,
        ingredient.inventory_item_id,
        locationId,
        quantityToDeduct,
        stock.quantity,
        newQuantity,
        performedBy,
        `Stock deduction for ${menuItemId}${orderNumber ? ` (Order ${orderNumber})` : ''}`,
      ]);

      // Get item name for alerts
      const itemResult = await client.query(`
        SELECT name FROM inventory_items WHERE id = $1
      `, [ingredient.inventory_item_id]);

      const itemName = itemResult.rows[0]?.name || ingredient.inventory_item_id;

      // Check for low stock alert
      if (newQuantity <= stock.min_level && newQuantity > 0) {
        const alertId = `alert_${Date.now().toString(36)}`;
        await client.query(`
          INSERT INTO inventory_alerts
            (id, restaurant_id, alert_type, inventory_item_id, location_id,
             threshold_value, current_value, message, is_resolved)
          VALUES ($1, $2, 'low_stock', $3, $4, $5, $6, $7, false)
        `, [
          alertId,
          restaurantId,
          ingredient.inventory_item_id,
          locationId,
          stock.min_level,
          newQuantity,
          `${itemName} is running low (${newQuantity} remaining)`,
        ]);
      } else if (newQuantity <= 0) {
        const alertId = `alert_${Date.now().toString(36)}`;
        await client.query(`
          INSERT INTO inventory_alerts
            (id, restaurant_id, alert_type, inventory_item_id, location_id,
             threshold_value, current_value, message, is_resolved)
          VALUES ($1, $2, 'out_of_stock', $3, $4, $5, $6, $7, false)
        `, [
          alertId,
          restaurantId,
          ingredient.inventory_item_id,
          locationId,
          0,
          newQuantity,
          `${itemName} is out of stock`,
        ]);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
