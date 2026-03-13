import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';

const router = Router();

// GET all purchase orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM purchase_orders';
    const params: unknown[] = [];

    if (status && status !== 'all') {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

// GET single purchase order
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Purchase order not found');
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching purchase order:', error);
      res.status(500).json({ error: 'Failed to fetch purchase order' });
    }
  }
});

// POST create new purchase order
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      supplier_id,
      supplier_name,
      items = [],
      expected_delivery,
      notes,
      created_by
    } = req.body;

    const id = `po_${Date.now().toString(36)}`;
    const total_cost = items.reduce((sum: number, item: { totalCost: number }) => sum + (item.totalCost || 0), 0);
    
    const result = await pool.query(
      `INSERT INTO purchase_orders 
        (id, supplier_id, supplier_name, status, items, total_cost, expected_delivery, notes, created_by)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, supplier_id, supplier_name, JSON.stringify(items), total_cost, expected_delivery, notes, created_by]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

// PUT update purchase order
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, items, expected_delivery, notes } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (items !== undefined) {
      const total_cost = items.reduce((sum: number, item: { totalCost: number }) => sum + (item.totalCost || 0), 0);
      updates.push(`items = $${paramIndex++}`);
      values.push(JSON.stringify(items));
      updates.push(`total_cost = $${paramIndex++}`);
      values.push(total_cost);
    }
    if (expected_delivery !== undefined) {
      updates.push(`expected_delivery = $${paramIndex++}`);
      values.push(expected_delivery);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());
    values.push(id);

    const result = await pool.query(
      `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Purchase order not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating purchase order:', error);
      res.status(500).json({ error: 'Failed to update purchase order' });
    }
  }
});

// POST receive purchase order (update stock)
router.post('/:id/receive', async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { received_items, received_by } = req.body;

    // Get PO
    const poResult = await client.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    if (poResult.rows.length === 0) {
      throw new HttpError(404, 'Purchase order not found');
    }

    const po = poResult.rows[0];
    const items = po.items;

    // Update inventory for each item
    for (const receivedItem of received_items) {
      const { menu_item_id, received_qty } = receivedItem;
      
      // Get current stock
      const invResult = await client.query(
        'SELECT stock FROM inventory_records WHERE menu_item_id = $1',
        [menu_item_id]
      );

      const stockBefore = invResult.rows.length > 0 ? invResult.rows[0].stock : 0;
      const newStock = stockBefore + received_qty;

      // Update inventory
      if (invResult.rows.length > 0) {
        await client.query(
          'UPDATE inventory_records SET stock = $1, updated_at = $2 WHERE menu_item_id = $3',
          [newStock, new Date().toISOString(), menu_item_id]
        );
      } else {
        await client.query(
          `INSERT INTO inventory_records (id, menu_item_id, stock) VALUES ($1, $2, $3)`,
          [`inv_${Date.now().toString(36)}`, menu_item_id, received_qty]
        );
      }

      // Record movement
      const movementId = `mov_${Date.now().toString(36)}`;
      await client.query(
        `INSERT INTO stock_movements 
          (id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, reference, performed_by)
         VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8)`,
        [movementId, menu_item_id, menu_item_id, received_qty, stockBefore, newStock, id, received_by]
      );
    }

    // Update PO status
    const allReceived = received_items.every((item: { menu_item_id: string; received_qty: number }) => 
      items.some((oi: { menuItemId: string; orderedQty: number }) => 
        oi.menuItemId === item.menu_item_id && oi.orderedQty === item.received_qty
      )
    );

    const newStatus = allReceived ? 'received' : 'partial';

    await client.query(
      `UPDATE purchase_orders SET status = $1, received_at = $2, updated_at = $3 WHERE id = $4`,
      [newStatus, new Date().toISOString(), new Date().toISOString(), id]
    );

    await client.query('COMMIT');

    // Fetch updated PO
    const updatedPO = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    res.json(updatedPO.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error receiving purchase order:', error);
      res.status(500).json({ error: 'Failed to receive purchase order' });
    }
  } finally {
    client.release();
  }
});

// DELETE purchase order
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
});

export const purchaseOrdersRouter = router;
