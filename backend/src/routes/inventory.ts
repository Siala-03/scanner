import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { emitInventoryUpdate, emitStockMovement } from '../socket.js';

const router = Router();

// GET all inventory records
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM inventory_records ORDER BY menu_item_id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET single inventory record
router.get('/:menuItemId', async (req: Request, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const result = await pool.query(
      'SELECT * FROM inventory_records WHERE menu_item_id = $1',
      [menuItemId]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Inventory record not found');
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching inventory record:', error);
      res.status(500).json({ error: 'Failed to fetch inventory record' });
    }
  }
});

// POST create new inventory record
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      menu_item_id,
      stock = 0,
      low_stock_threshold = 5,
      reorder_point = 10,
      reorder_qty = 20,
      unit_cost = 0,
      supplier_id,
      location
    } = req.body;

    const id = `inv_${Date.now().toString(36)}`;
    
    const result = await pool.query(
      `INSERT INTO inventory_records 
        (id, menu_item_id, stock, low_stock_threshold, reorder_point, reorder_qty, unit_cost, supplier_id, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, menu_item_id, stock, low_stock_threshold, reorder_point, reorder_qty, unit_cost, supplier_id, location]
    );
    
    emitInventoryUpdate({ type: 'create', record: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating inventory record:', error);
    res.status(500).json({ error: 'Failed to create inventory record' });
  }
});

// PUT update inventory record
router.put('/:menuItemId', async (req: Request, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const {
      stock,
      low_stock_threshold,
      reorder_point,
      reorder_qty,
      unit_cost,
      supplier_id,
      location
    } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (stock !== undefined) {
      updates.push(`stock = $${paramIndex++}`);
      values.push(stock);
    }
    if (low_stock_threshold !== undefined) {
      updates.push(`low_stock_threshold = $${paramIndex++}`);
      values.push(low_stock_threshold);
    }
    if (reorder_point !== undefined) {
      updates.push(`reorder_point = $${paramIndex++}`);
      values.push(reorder_point);
    }
    if (reorder_qty !== undefined) {
      updates.push(`reorder_qty = $${paramIndex++}`);
      values.push(reorder_qty);
    }
    if (unit_cost !== undefined) {
      updates.push(`unit_cost = $${paramIndex++}`);
      values.push(unit_cost);
    }
    if (supplier_id !== undefined) {
      updates.push(`supplier_id = $${paramIndex++}`);
      values.push(supplier_id);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(location);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());
    values.push(menuItemId);

    const result = await pool.query(
      `UPDATE inventory_records SET ${updates.join(', ')} 
       WHERE menu_item_id = $${paramIndex} 
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Inventory record not found');
    }

    emitInventoryUpdate({ type: 'update', record: result.rows[0] });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating inventory record:', error);
      res.status(500).json({ error: 'Failed to update inventory record' });
    }
  }
});

// PATCH adjust stock (for manual adjustments)
router.patch('/:menuItemId/adjust', async (req: Request, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { adjustment, reason, performed_by } = req.body;

    // Get current stock
    const current = await pool.query(
      'SELECT stock FROM inventory_records WHERE menu_item_id = $1',
      [menuItemId]
    );

    if (current.rows.length === 0) {
      throw new HttpError(404, 'Inventory record not found');
    }

    const stockBefore = current.rows[0].stock;
    const newStock = stockBefore + adjustment;

    // Update stock
    const result = await pool.query(
      `UPDATE inventory_records 
       SET stock = $1, updated_at = $2 
       WHERE menu_item_id = $3 
       RETURNING *`,
      [newStock, new Date().toISOString(), menuItemId]
    );

    // Record movement
    const movementId = `mov_${Date.now().toString(36)}`;
    await pool.query(
      `INSERT INTO stock_movements 
        (id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, performed_by, notes)
       VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, $7, $8)`,
      [movementId, menuItemId, menuItemId, adjustment, stockBefore, newStock, performed_by, reason]
    );

    emitInventoryUpdate({ type: 'update', record: result.rows[0] });
    emitStockMovement({ type: 'create', movement: { menuItemId, adjustment, stockBefore, balanceAfter: newStock } });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error adjusting stock:', error);
      res.status(500).json({ error: 'Failed to adjust stock' });
    }
  }
});

// DELETE inventory record
router.delete('/:menuItemId', async (req: Request, res: Response) => {
  try {
    const { menuItemId } = req.params;
    await pool.query(
      'DELETE FROM inventory_records WHERE menu_item_id = $1',
      [menuItemId]
    );
    emitInventoryUpdate({ type: 'delete', menuItemId });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting inventory record:', error);
    res.status(500).json({ error: 'Failed to delete inventory record' });
  }
});

// GET low stock items
router.get('/alerts/low-stock', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory_records 
       WHERE stock <= low_stock_threshold 
       ORDER BY stock ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

export const inventoryRouter = router;
