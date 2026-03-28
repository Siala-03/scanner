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

// Create new inventory item
export async function createInventoryItem(
  restaurantId: string,
  name: string,
  category: string,
  unitOfMeasure: string,
  sku?: string,
  subCategory?: string
): Promise<UnifiedInventoryItem> {
  const id = `item_${Date.now().toString(36)}`;
  
  const result = await pool.query(`
    INSERT INTO inventory_items
      (id, restaurant_id, name, sku, category, sub_category, unit_of_measure)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [id, restaurantId, name, sku, category, subCategory, unitOfMeasure]);

  const row = result.rows[0];
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
  };
}

// Update inventory item
export async function updateInventoryItem(
  itemId: string,
  restaurantId: string,
  updates: Partial<{
    name: string;
    sku: string;
    category: string;
    subCategory: string;
    unitOfMeasure: string;
    isTracked: boolean;
    isActive: boolean;
  }>
): Promise<UnifiedInventoryItem | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.sku !== undefined) {
    setClauses.push(`sku = $${paramIndex++}`);
    values.push(updates.sku);
  }
  if (updates.category !== undefined) {
    setClauses.push(`category = $${paramIndex++}`);
    values.push(updates.category);
  }
  if (updates.subCategory !== undefined) {
    setClauses.push(`sub_category = $${paramIndex++}`);
    values.push(updates.subCategory);
  }
  if (updates.unitOfMeasure !== undefined) {
    setClauses.push(`unit_of_measure = $${paramIndex++}`);
    values.push(updates.unitOfMeasure);
  }
  if (updates.isTracked !== undefined) {
    setClauses.push(`is_tracked = $${paramIndex++}`);
    values.push(updates.isTracked);
  }
  if (updates.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(updates.isActive);
  }

  if (setClauses.length === 0) {
    return getInventoryItemById(itemId, restaurantId);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(itemId);
  values.push(restaurantId);

  const result = await pool.query(`
    UPDATE inventory_items
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex++} AND restaurant_id = $${paramIndex}
    RETURNING *
  `, values);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
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
  };
}

// Delete inventory item (soft delete)
export async function deleteInventoryItem(
  itemId: string,
  restaurantId: string
): Promise<boolean> {
  const result = await pool.query(`
    UPDATE inventory_items
    SET is_active = false, updated_at = NOW()
    WHERE id = $1 AND restaurant_id = $2
    RETURNING id
  `, [itemId, restaurantId]);

  return result.rows.length > 0;
}

// Initialize stock for item at location
export async function initializeStockAtLocation(
  itemId: string,
  locationId: string,
  restaurantId: string,
  initialQuantity: number = 0,
  minLevel: number = 0,
  maxLevel: number = 0,
  reorderPoint: number = 0,
  reorderQty: number = 0,
  safetyStock: number = 0
): Promise<StockByLocation> {
  const id = `stock_${Date.now().toString(36)}`;
  
  const result = await pool.query(`
    INSERT INTO inventory_stock
      (id, restaurant_id, inventory_item_id, location_id, quantity,
       min_level, max_level, reorder_point, reorder_qty, safety_stock)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (inventory_item_id, location_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      min_level = EXCLUDED.min_level,
      max_level = EXCLUDED.max_level,
      reorder_point = EXCLUDED.reorder_point,
      reorder_qty = EXCLUDED.reorder_qty,
      safety_stock = EXCLUDED.safety_stock,
      updated_at = NOW()
    RETURNING *
  `, [id, restaurantId, itemId, locationId, initialQuantity, minLevel, maxLevel, reorderPoint, reorderQty, safetyStock]);

  const row = result.rows[0];
  
  // Get location name
  const locationResult = await pool.query(`
    SELECT name FROM inventory_locations WHERE id = $1
  `, [locationId]);

  return {
    locationId: row.location_id,
    locationName: locationResult.rows[0]?.name || '',
    quantity: row.quantity,
    reservedQty: row.reserved_qty,
    minLevel: row.min_level,
    maxLevel: row.max_level,
    reorderPoint: row.reorder_point,
    reorderQty: row.reorder_qty,
    safetyStock: row.safety_stock,
  };
}
