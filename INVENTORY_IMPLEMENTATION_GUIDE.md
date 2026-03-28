# Servv Inventory Management - Implementation Guide

## Quick Start: Critical Improvements

This guide provides practical, copy-paste ready code for implementing the most critical inventory management improvements.

---

## 1. Unified Inventory Service

### Backend: `backend/src/services/unifiedInventoryService.ts`

```typescript
import { pool } from '../db.js';
import { emitInventoryUpdate, emitStockMovement, emitInventoryAlert } from '../socket.js';

export interface UnifiedInventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  sku?: string;
  category: string;
  subCategory?: string;
  unitOfMeasure: string;
  unitConversion: number;
  isTracked: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockByLocation {
  locationId: string;
  locationName: string;
  quantity: number;
  reservedQty: number;
  minLevel: number;
  maxLevel: number;
  reorderPoint: number;
  reorderQty: number;
  safetyStock: number;
}

export interface InventoryItemWithStock extends UnifiedInventoryItem {
  stockByLocation: StockByLocation[];
  totalStock: number;
  totalValue: number;
  linkedMenuItems: {
    menuItemId: string;
    menuItemName: string;
    quantityPerServing: number;
    unitOfMeasure: string;
  }[];
  activeAlerts: {
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }[];
}

// Get all inventory items with stock information
export async function getAllInventoryItems(restaurantId: string): Promise<InventoryItemWithStock[]> {
  const result = await pool.query(`
    SELECT 
      ii.*,
      COALESCE(
        json_agg(
          json_build_object(
            'locationId', ist.location_id,
            'locationName', il.name,
            'quantity', ist.quantity,
            'reservedQty', ist.reserved_qty,
            'minLevel', ist.min_level,
            'maxLevel', ist.max_level,
            'reorderPoint', ist.reorder_point,
            'reorderQty', ist.reorder_qty,
            'safetyStock', ist.safety_stock
          )
        ) FILTER (WHERE ist.id IS NOT NULL),
        '[]'
      ) as stock_by_location,
      COALESCE(SUM(ist.quantity), 0) as total_stock,
      COALESCE(SUM(ist.quantity * COALESCE(
        (SELECT unit_price FROM supplier_prices 
         WHERE inventory_item_id = ii.id AND is_current = true 
         ORDER BY effective_from DESC LIMIT 1),
        0
      )), 0) as total_value
    FROM inventory_items ii
    LEFT JOIN inventory_stock ist ON ist.inventory_item_id = ii.id
    LEFT JOIN inventory_locations il ON il.id = ist.location_id
    WHERE ii.restaurant_id = $1 AND ii.is_active = true
    GROUP BY ii.id
    ORDER BY ii.name
  `, [restaurantId]);

  return result.rows.map(row => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    subCategory: row.sub_category,
    unitOfMeasure: row.unit_of_measure,
    unitConversion: row.unit_conversion,
    isTracked: row.is_tracked,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stockByLocation: row.stock_by_location,
    totalStock: row.total_stock,
    totalValue: row.total_value,
    linkedMenuItems: [],
    activeAlerts: [],
  }));
}

// Get inventory item by ID with full details
export async function getInventoryItemById(
  itemId: string,
  restaurantId: string
): Promise<InventoryItemWithStock | null> {
  const result = await pool.query(`
    SELECT 
      ii.*,
      COALESCE(
        json_agg(
          json_build_object(
            'locationId', ist.location_id,
            'locationName', il.name,
            'quantity', ist.quantity,
            'reservedQty', ist.reserved_qty,
            'minLevel', ist.min_level,
            'maxLevel', ist.max_level,
            'reorderPoint', ist.reorder_point,
            'reorderQty', ist.reorder_qty,
            'safetyStock', ist.safety_stock
          )
        ) FILTER (WHERE ist.id IS NOT NULL),
        '[]'
      ) as stock_by_location,
      COALESCE(SUM(ist.quantity), 0) as total_stock
    FROM inventory_items ii
    LEFT JOIN inventory_stock ist ON ist.inventory_item_id = ii.id
    LEFT JOIN inventory_locations il ON il.id = ist.location_id
    WHERE ii.id = $1 AND ii.restaurant_id = $2
    GROUP BY ii.id
  `, [itemId, restaurantId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Get linked menu items
  const menuItems = await pool.query(`
    SELECT 
      ri.menu_item_id,
      m.name as menu_item_name,
      ri.quantity as quantity_per_serving,
      ri.unit_of_measure
    FROM recipe_ingredients ri
    LEFT JOIN menu m ON m.id = ri.menu_item_id
    WHERE ri.inventory_item_id = $1
  `, [itemId]);

  // Get active alerts
  const alerts = await pool.query(`
    SELECT 
      alert_type as type,
      message,
      CASE 
        WHEN alert_type IN ('out_of_stock', 'expired') THEN 'critical'
        WHEN alert_type IN ('low_stock', 'expiring_soon') THEN 'high'
        WHEN alert_type = 'below_par' THEN 'medium'
        ELSE 'low'
      END as severity
    FROM inventory_alerts
    WHERE inventory_item_id = $1 AND is_resolved = false
    ORDER BY created_at DESC
  `, [itemId]);

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    subCategory: row.sub_category,
    unitOfMeasure: row.unit_of_measure,
    unitConversion: row.unit_conversion,
    isTracked: row.is_tracked,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stockByLocation: row.stock_by_location,
    totalStock: row.total_stock,
    totalValue: 0,
    linkedMenuItems: menuItems.rows,
    activeAlerts: alerts.rows,
  };
}

// Adjust stock at a specific location
export async function adjustStockAtLocation(
  itemId: string,
  locationId: string,
  adjustment: number,
  reason: string,
  performedBy: string,
  restaurantId: string
): Promise<StockByLocation> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get current stock with lock
    const stockResult = await client.query(`
      SELECT * FROM inventory_stock
      WHERE inventory_item_id = $1 AND location_id = $2
      FOR UPDATE
    `, [itemId, locationId]);

    if (stockResult.rows.length === 0) {
      throw new Error('Stock record not found for this item and location');
    }

    const stockBefore = stockResult.rows[0].quantity;
    const newStock = Math.max(0, stockBefore + adjustment);

    // Update stock
    await client.query(`
      UPDATE inventory_stock
      SET quantity = $1, updated_at = NOW()
      WHERE inventory_item_id = $2 AND location_id = $3
    `, [newStock, itemId, locationId]);

    // Record movement
    const movementId = `mov_${Date.now().toString(36)}`;
    await client.query(`
      INSERT INTO stock_movements_enhanced
        (id, restaurant_id, inventory_item_id, from_location_id, to_location_id,
         movement_type, quantity, quantity_before, quantity_after, performed_by, notes)
      VALUES ($1, $2, $3, $4, $5, 'adjustment', $6, $7, $8, $9, $10)
    `, [
      movementId,
      restaurantId,
      itemId,
      adjustment < 0 ? locationId : null,
      adjustment > 0 ? locationId : null,
      adjustment,
      stockBefore,
      newStock,
      performedBy,
      reason,
    ]);

    // Check for alerts
    const itemResult = await client.query(`
      SELECT name FROM inventory_items WHERE id = $1
    `, [itemId]);

    const itemName = itemResult.rows[0]?.name || itemId;

    if (newStock <= 0) {
      await createAlert(client, restaurantId, 'out_of_stock', itemId, itemName, locationId, 0, newStock);
    } else if (newStock <= stockResult.rows[0].min_level) {
      await createAlert(client, restaurantId, 'low_stock', itemId, itemName, locationId, stockResult.rows[0].min_level, newStock);
    }

    await client.query('COMMIT');

    // Emit updates
    emitInventoryUpdate({ type: 'update', itemId, locationId, quantity: newStock });
    emitStockMovement({
      type: 'create',
      movement: {
        itemId,
        locationId,
        type: 'adjustment',
        qty: adjustment,
        stockBefore,
        balanceAfter: newStock,
        performedBy,
        notes: reason,
      },
    });

    return {
      locationId,
      locationName: '',
      quantity: newStock,
      reservedQty: stockResult.rows[0].reserved_qty,
      minLevel: stockResult.rows[0].min_level,
      maxLevel: stockResult.rows[0].max_level,
      reorderPoint: stockResult.rows[0].reorder_point,
      reorderQty: stockResult.rows[0].reorder_qty,
      safetyStock: stockResult.rows[0].safety_stock,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to create alerts
async function createAlert(
  client: any,
  restaurantId: string,
  alertType: string,
  itemId: string,
  itemName: string,
  locationId: string,
  threshold: number,
  currentValue: number
) {
  const alertId = `alert_${Date.now().toString(36)}`;
  await client.query(`
    INSERT INTO inventory_alerts
      (id, restaurant_id, alert_type, inventory_item_id, location_id,
       threshold_value, current_value, message)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    alertId,
    restaurantId,
    alertType,
    itemId,
    locationId,
    threshold,
    currentValue,
    `${itemName} is ${alertType.replace('_', ' ')} (${currentValue} ${alertType === 'out_of_stock' ? 'units' : `<= ${threshold}`})`,
  ]);

  emitInventoryAlert({
    type: alertType,
    itemId,
    itemName,
    locationId,
    stock: currentValue,
    threshold,
  });
}

// Get stock at specific location
export async function getStockAtLocation(
  itemId: string,
  locationId: string
): Promise<StockByLocation | null> {
  const result = await pool.query(`
    SELECT 
      ist.*,
      il.name as location_name
    FROM inventory_stock ist
    LEFT JOIN inventory_locations il ON il.id = ist.location_id
    WHERE ist.inventory_item_id = $1 AND ist.location_id = $2
  `, [itemId, locationId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    locationId: row.location_id,
    locationName: row.location_name,
    quantity: row.quantity,
    reservedQty: row.reserved_qty,
    minLevel: row.min_level,
    maxLevel: row.max_level,
    reorderPoint: row.reorder_point,
    reorderQty: row.reorder_qty,
    safetyStock: row.safety_stock,
  };
}

// Get low stock items across all locations
export async function getLowStockItems(restaurantId: string): Promise<InventoryItemWithStock[]> {
  const result = await pool.query(`
    SELECT DISTINCT
      ii.*,
      ist.location_id,
      il.name as location_name,
      ist.quantity,
      ist.min_level
    FROM inventory_items ii
    JOIN inventory_stock ist ON ist.inventory_item_id = ii.id
    JOIN inventory_locations il ON il.id = ist.location_id
    WHERE ii.restaurant_id = $1 
      AND ii.is_active = true
      AND ist.quantity <= ist.min_level
    ORDER BY ii.name
  `, [restaurantId]);

  // Group by item
  const itemsMap = new Map<string, InventoryItemWithStock>();
  
  for (const row of result.rows) {
    if (!itemsMap.has(row.id)) {
      itemsMap.set(row.id, {
        id: row.id,
        restaurantId: row.restaurant_id,
        name: row.name,
        sku: row.sku,
        category: row.category,
        subCategory: row.sub_category,
        unitOfMeasure: row.unit_of_measure,
        unitConversion: row.unit_conversion,
        isTracked: row.is_tracked,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        stockByLocation: [],
        totalStock: 0,
        totalValue: 0,
        linkedMenuItems: [],
        activeAlerts: [],
      });
    }

    const item = itemsMap.get(row.id)!;
    item.stockByLocation.push({
      locationId: row.location_id,
      locationName: row.location_name,
      quantity: row.quantity,
      reservedQty: 0,
      minLevel: row.min_level,
      maxLevel: 0,
      reorderPoint: 0,
      reorderQty: 0,
      safetyStock: 0,
    });
    item.totalStock += row.quantity;
  }

  return Array.from(itemsMap.values());
}
```

---

## 2. Location Management Routes

### Backend: `backend/src/routes/locations.ts`

```typescript
import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET all locations
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        il.*,
        COUNT(DISTINCT ist.inventory_item_id) as total_items,
        COALESCE(SUM(ist.quantity), 0) as total_stock,
        COUNT(DISTINCT CASE WHEN ist.quantity <= ist.min_level THEN ist.inventory_item_id END) as low_stock_items
      FROM inventory_locations il
      LEFT JOIN inventory_stock ist ON ist.location_id = il.id
      WHERE il.restaurant_id = $1 AND il.is_active = true
      GROUP BY il.id
      ORDER BY il.name
    `, [req.restaurantId]);

    res.json(result.rows.map(row => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: row.name,
      type: row.type,
      description: row.description,
      isActive: row.is_active,
      capacity: row.capacity,
      temperatureRange: row.temperature_range,
      totalItems: parseInt(row.total_items),
      totalStock: parseFloat(row.total_stock),
      lowStockItems: parseInt(row.low_stock_items),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET single location
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        il.*,
        COUNT(DISTINCT ist.inventory_item_id) as total_items,
        COALESCE(SUM(ist.quantity), 0) as total_stock
      FROM inventory_locations il
      LEFT JOIN inventory_stock ist ON ist.location_id = il.id
      WHERE il.id = $1 AND il.restaurant_id = $2
      GROUP BY il.id
    `, [id, req.restaurantId]);

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Location not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: row.name,
      type: row.type,
      description: row.description,
      isActive: row.is_active,
      capacity: row.capacity,
      temperatureRange: row.temperature_range,
      totalItems: parseInt(row.total_items),
      totalStock: parseFloat(row.total_stock),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching location:', error);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  }
});

// POST create location
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, type, description, capacity, temperatureRange } = req.body;
    const id = `loc_${Date.now().toString(36)}`;

    const result = await pool.query(`
      INSERT INTO inventory_locations
        (id, restaurant_id, name, type, description, capacity, temperature_range)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, req.restaurantId, name, type, description, capacity, temperatureRange]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// PUT update location
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, description, capacity, temperatureRange, isActive } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (type !== undefined) { updates.push(`type = $${paramIndex++}`); values.push(type); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
    if (capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); values.push(capacity); }
    if (temperatureRange !== undefined) { updates.push(`temperature_range = $${paramIndex++}`); values.push(temperatureRange); }
    if (isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(isActive); }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    values.push(req.restaurantId);

    const result = await pool.query(`
      UPDATE inventory_locations 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND restaurant_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Location not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating location:', error);
      res.status(500).json({ error: 'Failed to update location' });
    }
  }
});

// DELETE location (soft delete)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if location has stock
    const stockCheck = await pool.query(`
      SELECT COUNT(*) as count FROM inventory_stock WHERE location_id = $1 AND quantity > 0
    `, [id]);

    if (parseInt(stockCheck.rows[0].count) > 0) {
      throw new HttpError(400, 'Cannot delete location with stock. Transfer stock first.');
    }

    await pool.query(`
      UPDATE inventory_locations 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND restaurant_id = $2
    `, [id, req.restaurantId]);

    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting location:', error);
      res.status(500).json({ error: 'Failed to delete location' });
    }
  }
});

// GET stock at location
router.get('/:id/stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        ist.*,
        ii.name as item_name,
        ii.category,
        ii.unit_of_measure
      FROM inventory_stock ist
      JOIN inventory_items ii ON ii.id = ist.inventory_item_id
      WHERE ist.location_id = $1 AND ii.restaurant_id = $2
      ORDER BY ii.name
    `, [id, req.restaurantId]);

    res.json(result.rows.map(row => ({
      itemId: row.inventory_item_id,
      itemName: row.item_name,
      category: row.category,
      unitOfMeasure: row.unit_of_measure,
      quantity: row.quantity,
      reservedQty: row.reserved_qty,
      minLevel: row.min_level,
      maxLevel: row.max_level,
      reorderPoint: row.reorder_point,
      reorderQty: row.reorder_qty,
      safetyStock: row.safety_stock,
    })));
  } catch (error) {
    console.error('Error fetching location stock:', error);
    res.status(500).json({ error: 'Failed to fetch location stock' });
  }
});

export const locationsRouter = router;
```

---

## 3. Recipe Management Service

### Backend: `backend/src/services/recipeService.ts`

```typescript
import { pool } from '../db.js';

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

// Get recipe for a menu item
export async function getRecipeForMenuItem(
  menuItemId: string,
  restaurantId: string
): Promise<RecipeIngredient[]> {
  const result = await pool.query(`
    SELECT 
      ri.*,
      ii.name as inventory_item_name
    FROM recipe_ingredients ri
    JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.menu_item_id = $1 AND ri.restaurant_id = $2
    ORDER BY ii.name
  `, [menuItemId, restaurantId]);

  return result.rows.map(row => ({
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
  }));
}

// Create or update recipe ingredient
export async function upsertRecipeIngredient(
  menuItemId: string,
  inventoryItemId: string,
  quantity: number,
  unitOfMeasure: string,
  yieldPercentage: number,
  isOptional: boolean,
  restaurantId: string
): Promise<RecipeIngredient> {
  const result = await pool.query(`
    INSERT INTO recipe_ingredients
      (id, restaurant_id, menu_item_id, inventory_item_id, quantity, unit_of_measure, yield_percentage, is_optional)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (restaurant_id, menu_item_id, inventory_item_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit_of_measure = EXCLUDED.unit_of_measure,
      yield_percentage = EXCLUDED.yield_percentage,
      is_optional = EXCLUDED.is_optional,
      updated_at = NOW()
    RETURNING *
  `, [
    `recipe_${Date.now().toString(36)}`,
    restaurantId,
    menuItemId,
    inventoryItemId,
    quantity,
    unitOfMeasure,
    yieldPercentage,
    isOptional,
  ]);

  const row = result.rows[0];
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    menuItemId: row.menu_item_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: '',
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
  menuItemId: string,
  inventoryItemId: string,
  restaurantId: string
): Promise<void> {
  await pool.query(`
    DELETE FROM recipe_ingredients
    WHERE menu_item_id = $1 AND inventory_item_id = $2 AND restaurant_id = $3
  `, [menuItemId, inventoryItemId, restaurantId]);
}

// Calculate stock requirements for a menu item
export async function calculateStockRequirements(
  menuItemId: string,
  quantity: number,
  restaurantId: string
): Promise<RecipeRequirement> {
  // Get menu item name
  const menuResult = await pool.query(`
    SELECT name FROM menu WHERE id = $1 AND restaurant_id = $2
  `, [menuItemId, restaurantId]);

  const menuItemName = menuResult.rows[0]?.name || menuItemId;

  // Get recipe ingredients
  const ingredients = await getRecipeForMenuItem(menuItemId, restaurantId);

  // Get available stock for each ingredient
  const ingredientRequirements = await Promise.all(
    ingredients.map(async (ingredient) => {
      const stockResult = await pool.query(`
        SELECT COALESCE(SUM(quantity), 0) as total_available
        FROM inventory_stock
        WHERE inventory_item_id = $1
      `, [ingredient.inventoryItemId]);

      const quantityAvailable = parseFloat(stockResult.rows[0]?.total_available || 0);
      const quantityNeeded = ingredient.quantity * quantity;

      return {
        inventoryItemId: ingredient.inventoryItemId,
        inventoryItemName: ingredient.inventoryItemName,
        quantityNeeded,
        quantityAvailable,
        unitOfMeasure: ingredient.unitOfMeasure,
        canFulfill: quantityAvailable >= quantityNeeded,
      };
    })
  );

  // Calculate max servings possible
  const maxServings = Math.min(
    ...ingredientRequirements.map((ing) =>
      ing.quantityNeeded > 0
        ? Math.floor(ing.quantityAvailable / (ing.quantityNeeded / quantity))
        : Infinity
    )
  );

  return {
    menuItemId,
    menuItemName,
    ingredients: ingredientRequirements,
    canFulfillAll: ingredientRequirements.every((ing) => ing.canFulfill),
    maxServings: isFinite(maxServings) ? maxServings : 0,
  };
}

// Deduct stock based on recipe
export async function deductStockForRecipe(
  menuItemId: string,
  quantity: number,
  performedBy: string,
  orderNumber: string,
  restaurantId: string
): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get recipe ingredients
    const ingredients = await getRecipeForMenuItem(menuItemId, restaurantId);

    for (const ingredient of ingredients) {
      if (ingredient.isOptional) continue;

      // Get stock with lock
      const stockResult = await client.query(`
        SELECT id, quantity, min_level
        FROM inventory_stock
        WHERE inventory_item_id = $1
        ORDER BY quantity DESC
        LIMIT 1
        FOR UPDATE
      `, [ingredient.inventoryItemId]);

      if (stockResult.rows.length === 0) {
        throw new Error(`No stock found for ingredient: ${ingredient.inventoryItemName}`);
      }

      const stock = stockResult.rows[0];
      const quantityNeeded = ingredient.quantity * quantity;
      const newStock = Math.max(0, stock.quantity - quantityNeeded);

      // Update stock
      await client.query(`
        UPDATE inventory_stock
        SET quantity = $1, updated_at = NOW()
        WHERE id = $2
      `, [newStock, stock.id]);

      // Record movement
      const movementId = `mov_${Date.now().toString(36)}`;
      await client.query(`
        INSERT INTO stock_movements_enhanced
          (id, restaurant_id, inventory_item_id, movement_type, quantity, 
           quantity_before, quantity_after, reference_id, reference_type, performed_by, notes)
        VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7, 'order', $8, $9)
      `, [
        movementId,
        restaurantId,
        ingredient.inventoryItemId,
        -quantityNeeded,
        stock.quantity,
        newStock,
        orderNumber,
        performedBy,
        `Recipe deduction for ${orderNumber}`,
      ]);

      // Check for low stock alert
      if (newStock <= stock.min_level) {
        const alertId = `alert_${Date.now().toString(36)}`;
        await client.query(`
          INSERT INTO inventory_alerts
            (id, restaurant_id, alert_type, inventory_item_id, threshold_value, current_value, message)
          VALUES ($1, $2, 'low_stock', $3, $4, $5, $6)
        `, [
          alertId,
          restaurantId,
          ingredient.inventoryItemId,
          stock.min_level,
          newStock,
          `${ingredient.inventoryItemName} is low on stock (${newStock} <= ${stock.min_level})`,
        ]);
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Get all recipes
export async function getAllRecipes(restaurantId: string): Promise<Map<string, RecipeIngredient[]>> {
  const result = await pool.query(`
    SELECT 
      ri.*,
      ii.name as inventory_item_name,
      m.name as menu_item_name
    FROM recipe_ingredients ri
    JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    JOIN menu m ON m.id = ri.menu_item_id
    WHERE ri.restaurant_id = $1
    ORDER BY m.name, ii.name
  `, [restaurantId]);

  const recipesMap = new Map<string, RecipeIngredient[]>();

  for (const row of result.rows) {
    if (!recipesMap.has(row.menu_item_id)) {
      recipesMap.set(row.menu_item_id, []);
    }

    recipesMap.get(row.menu_item_id)!.push({
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
    });
  }

  return recipesMap;
}
```

---

## 4. Updated Frontend Types

### File: `src/types/inventory.ts` (Add these types)

```typescript
// Add to existing file

export interface InventoryLocation {
  id: string;
  restaurantId: string;
  name: string;
  type: 'warehouse' | 'walk_in' | 'dry_store' | 'bar' | 'kitchen' | 'cold_room' | 'freezer' | 'display' | 'other';
  description?: string;
  isActive: boolean;
  capacity?: number;
  temperatureRange?: string;
  totalItems: number;
  totalStock: number;
  lowStockItems: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockByLocation {
  locationId: string;
  locationName: string;
  quantity: number;
  reservedQty: number;
  minLevel: number;
  maxLevel: number;
  reorderPoint: number;
  reorderQty: number;
  safetyStock: number;
}

export interface UnifiedInventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  sku?: string;
  category: string;
  subCategory?: string;
  unitOfMeasure: string;
  unitConversion: number;
  isTracked: boolean;
  isActive: boolean;
  stockByLocation: StockByLocation[];
  totalStock: number;
  totalValue: number;
  linkedMenuItems: {
    menuItemId: string;
    menuItemName: string;
    quantityPerServing: number;
    unitOfMeasure: string;
  }[];
  activeAlerts: {
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }[];
  createdAt: string;
  updatedAt: string;
}

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

export interface InventoryLot {
  id: string;
  restaurantId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  locationName: string;
  lotNumber?: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  receivedDate: string;
  expiryDate?: string;
  supplierId?: string;
  supplierName?: string;
  purchaseOrderId?: string;
  isExpired: boolean;
  daysUntilExpiry?: number;
  isFullyConsumed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CycleCount {
  id: string;
  restaurantId: string;
  locationId?: string;
  locationName?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate: string;
  completedDate?: string;
  countedBy?: string;
  varianceNotes?: string;
  totalItems: number;
  countedItems: number;
  varianceItems: number;
  totalVarianceValue: number;
  items: CycleCountItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CycleCountItem {
  id: string;
  cycleCountId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  systemQty: number;
  countedQty?: number;
  variance?: number;
  varianceReason?: string;
  countedBy?: string;
  countedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface InventoryAlert {
  id: string;
  restaurantId: string;
  alertType: 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired' | 'below_par' | 'overstock' | 'count_variance' | 'price_change';
  inventoryItemId?: string;
  inventoryItemName?: string;
  locationId?: string;
  locationName?: string;
  thresholdValue?: number;
  currentValue?: number;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}
```

---

## 5. Database Migration

### File: `backend/migrations/016_unify_inventory.sql`

```sql
-- ============================================
-- UNIFY INVENTORY SYSTEM
-- Link inventory_records to inventory_items
-- ============================================

-- Add inventory_item_id to inventory_records
ALTER TABLE inventory_records 
ADD COLUMN IF NOT EXISTS inventory_item_id text REFERENCES inventory_items(id);

CREATE INDEX IF NOT EXISTS idx_inventory_records_item 
ON inventory_records(inventory_item_id);

-- Add location_id to inventory_records
ALTER TABLE inventory_records 
ADD COLUMN IF NOT EXISTS location_id text REFERENCES inventory_locations(id);

CREATE INDEX IF NOT EXISTS idx_inventory_records_location 
ON inventory_records(location_id);

-- Create inventory_stock table if not exists (from migration 015)
CREATE TABLE IF NOT EXISTS inventory_stock (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    location_id text NOT NULL REFERENCES inventory_locations(id),
    quantity numeric NOT NULL DEFAULT 0,
    reserved_qty numeric NOT NULL DEFAULT 0,
    min_level numeric NOT NULL DEFAULT 0,
    max_level numeric NOT NULL DEFAULT 0,
    reorder_point numeric NOT NULL DEFAULT 0,
    reorder_qty numeric NOT NULL DEFAULT 0,
    safety_stock numeric NOT NULL DEFAULT 0,
    last_counted_at timestamptz,
    last_counted_qty numeric,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(inventory_item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_item ON inventory_stock(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_location ON inventory_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_below_min ON inventory_stock(quantity, min_level) 
    WHERE quantity <= min_level;

-- Migrate existing inventory_records to inventory_items
INSERT INTO inventory_items (id, restaurant_id, name, category, unit_of_measure)
SELECT 
  'item_' || menu_item_id,
  COALESCE(restaurant_id, 'default_restaurant'),
  COALESCE((SELECT name FROM menu WHERE id = menu_item_id), menu_item_id),
  'Uncategorized',
  'unit'
FROM inventory_records
WHERE inventory_item_id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Link inventory_records to inventory_items
UPDATE inventory_records 
SET inventory_item_id = 'item_' || menu_item_id
WHERE inventory_item_id IS NULL;

-- Create default location for each restaurant
INSERT INTO inventory_locations (id, restaurant_id, name, type, description)
SELECT 
  'loc_default_' || id,
  id,
  'Main Storage',
  'warehouse',
  'Default storage location'
FROM restaurants
ON CONFLICT (id) DO NOTHING;

-- Assign default location to inventory_records
UPDATE inventory_records 
SET location_id = 'loc_default_' || restaurant_id
WHERE location_id IS NULL;

-- Migrate inventory_records to inventory_stock
INSERT INTO inventory_stock (id, restaurant_id, inventory_item_id, location_id, quantity, min_level, reorder_point, reorder_qty)
SELECT 
  'stock_' || id,
  COALESCE(restaurant_id, 'default_restaurant'),
  inventory_item_id,
  location_id,
  stock,
  low_stock_threshold,
  reorder_point,
  reorder_qty
FROM inventory_records
WHERE inventory_item_id IS NOT NULL AND location_id IS NOT NULL
ON CONFLICT (inventory_item_id, location_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  min_level = EXCLUDED.min_level,
  reorder_point = EXCLUDED.reorder_point,
  reorder_qty = EXCLUDED.reorder_qty,
  updated_at = NOW();

-- Add unique constraint to recipe_ingredients if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'recipe_ingredients_unique'
  ) THEN
    ALTER TABLE recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_unique 
    UNIQUE(restaurant_id, menu_item_id, inventory_item_id);
  END IF;
END $$;

-- Create inventory_alerts table if not exists
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    alert_type text NOT NULL CHECK (alert_type IN (
        'low_stock', 'out_of_stock', 'expiring_soon', 'expired', 
        'below_par', 'overstock', 'count_variance', 'price_change'
    )),
    inventory_item_id text REFERENCES inventory_items(id),
    location_id text REFERENCES inventory_locations(id),
    threshold_value numeric,
    current_value numeric,
    is_resolved boolean NOT NULL DEFAULT false,
    resolved_by text,
    resolved_at timestamptz,
    message text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_restaurant ON inventory_alerts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON inventory_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON inventory_alerts(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_alerts_item ON inventory_alerts(inventory_item_id);
```

---

## 6. Register New Routes

### Update `backend/src/index.ts`

```typescript
// Add this import
import { locationsRouter } from './routes/locations.js';

// Add this route registration
app.use('/api/locations', locationsRouter);
```

---

## Testing the Implementation

### 1. Run the migration
```bash
cd backend
npm run migrate
```

### 2. Test location endpoints
```bash
# Get all locations
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/locations

# Create a location
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bar Fridge","type":"bar","temperatureRange":"2-4°C"}' \
  http://localhost:3000/api/locations
```

### 3. Test unified inventory
```bash
# Get all inventory items
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/inventory

# Get stock at location
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/locations/LOCATION_ID/stock
```

---

## Next Steps

After implementing these core improvements:

1. **Add lot tracking** - Implement FIFO/FEFO management
2. **Add cycle counts** - Enable scheduled inventory counting
3. **Enhance analytics** - Add stock valuation and turnover reports
4. **Add alert management** - Create UI for managing alerts
5. **Add recipe UI** - Create interface for managing recipes

Refer to the full improvement plan in `INVENTORY_MANAGEMENT_IMPROVEMENT_PLAN.md` for complete details.
