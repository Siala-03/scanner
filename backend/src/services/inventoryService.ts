import { pool } from '../db.js';
import { emitInventoryUpdate, emitStockMovement, emitInventoryAlert } from '../socket.js';

export interface InventoryRecord {
  id: string;
  menu_item_id: string;
  stock: number;
  low_stock_threshold: number;
  reorder_point: number;
  reorder_qty: number;
  unit_cost: number;
  supplier_id?: string;
  location?: string;
  updated_at?: string;
}

export interface OrderLine {
  menuItemId: string;
  menuItemName?: string;
  quantity: number;
}

export async function getAllInventory(restaurantId: string) {
  const result = await pool.query('SELECT * FROM inventory_records WHERE restaurant_id = $1 ORDER BY menu_item_id', [restaurantId]);
  return result.rows;
}

export async function getInventoryById(menuItemId: string, restaurantId: string) {
  const result = await pool.query('SELECT * FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2', [menuItemId, restaurantId]);
  return result.rows[0] ?? null;
}

export async function getLowStockItems() {
  const result = await pool.query(
    'SELECT * FROM inventory_records WHERE stock <= low_stock_threshold ORDER BY stock ASC'
  );
  return result.rows;
}

export async function setInventoryStock(menuItemId: string, stock: number, performedBy: string, notes = 'manual update') {
  const result = await pool.query(
    'UPDATE inventory_records SET stock = $1, updated_at = $2 WHERE menu_item_id = $3 RETURNING *',
    [stock, new Date().toISOString(), menuItemId]
  );

  const record = result.rows[0];
  if (record) {
    emitInventoryUpdate({ type: 'update', record });
    emitStockMovement({
      type: 'create',
      movement: {
        menuItemId,
        type: 'adjustment',
        qty: 0,
        stockBefore: stock,
        balanceAfter: stock,
        performedBy,
        notes
      }
    });
  }

  return record;
}

export async function adjustStock(menuItemId: string, adjustment: number, reason: string, performedBy: string, restaurantId?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingQuery = restaurantId
      ? 'SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2 FOR UPDATE'
      : 'SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 FOR UPDATE';
    const existingParams = restaurantId ? [menuItemId, restaurantId] : [menuItemId];
    const existing = await client.query(existingQuery, existingParams);
    if (existing.rows.length === 0) {
      throw new Error('Inventory record not found');
    }
    const stockBefore = existing.rows[0].stock ?? 0;
    const threshold = existing.rows[0].low_stock_threshold ?? 0;
    const newStock = Math.max(0, stockBefore + adjustment);

    const updateQuery = restaurantId
      ? 'UPDATE inventory_records SET stock = $1, updated_at = $2 WHERE menu_item_id = $3 AND restaurant_id = $4 RETURNING *'
      : 'UPDATE inventory_records SET stock = $1, updated_at = $2 WHERE menu_item_id = $3 RETURNING *';
    const updateParams = restaurantId
      ? [newStock, new Date().toISOString(), menuItemId, restaurantId]
      : [newStock, new Date().toISOString(), menuItemId];
    const update = await client.query(updateQuery, updateParams);

    const movementId = `mov_${Date.now().toString(36)}`;
    await client.query(
      `INSERT INTO stock_movements
        (id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, performed_by, notes, restaurant_id)
       VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, $7, $8, $9)`,
      [movementId, menuItemId, menuItemId, adjustment, stockBefore, newStock, performedBy, reason, restaurantId || null]
    );

    await client.query('COMMIT');

    const record = update.rows[0];
    emitInventoryUpdate({ type: 'update', record });
    emitStockMovement({ type: 'create', movement: { menuItemId, type: 'adjustment', qty: adjustment, stockBefore, balanceAfter: newStock, performedBy, notes: reason } });
    if (newStock <= threshold) {
      emitInventoryAlert({ type: newStock === 0 ? 'out-of-stock' : 'low-stock', menuItemId, menuItemName: menuItemId, stock: newStock, threshold });
    }
    return record;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function decrementStockForOrderLines(orderLines: OrderLine[], createdBy: string, orderNumber: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const alerts: Array<{ type: 'low-stock' | 'out-of-stock'; menuItemId: string; menuItemName: string; stock: number; threshold: number }> = [];

    for (const line of orderLines) {
      const row = await client.query('SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 FOR UPDATE', [line.menuItemId]);
      if (row.rows.length === 0) continue;

      const stockBefore = row.rows[0].stock ?? 0;
      const threshold = row.rows[0].low_stock_threshold ?? 0;
      const stockAfter = Math.max(0, stockBefore - line.quantity);

      const update = await client.query(
        'UPDATE inventory_records SET stock = $1, updated_at = $2 WHERE menu_item_id = $3 RETURNING *',
        [stockAfter, new Date().toISOString(), line.menuItemId]
      );

      const movementId = `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await client.query(
        `INSERT INTO stock_movements 
          (id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, performed_by, notes)
         VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7, $8)`,
        [movementId, line.menuItemId, line.menuItemName || line.menuItemId, -line.quantity, stockBefore, stockAfter, createdBy, `Sale for ${orderNumber}`]
      );

      emitInventoryUpdate({ type: 'update', menuItemId: line.menuItemId, record: update.rows[0] });
      emitStockMovement({ type: 'create', movement: { menuItemId: line.menuItemId, type: 'sale', qty: -line.quantity, stockBefore, balanceAfter: stockAfter, performedBy: createdBy, notes: `Order ${orderNumber}` } });

      if (stockAfter <= threshold) {
        alerts.push({
          type: stockAfter === 0 ? 'out-of-stock' : 'low-stock',
          menuItemId: line.menuItemId,
          menuItemName: line.menuItemName ?? line.menuItemId,
          stock: stockAfter,
          threshold,
        });
      }
    }

    await client.query('COMMIT');

    for (const alert of alerts) {
      emitInventoryAlert(alert);
    }

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
