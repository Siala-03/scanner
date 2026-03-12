import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET all waste entries
router.get('/', async (req: Request, res: Response) => {
  try {
    const { menu_item_id, reason, from_date, to_date, limit = 100 } = req.query;

    let query = 'SELECT * FROM waste_entries';
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (menu_item_id) {
      conditions.push(`menu_item_id = $${paramIndex++}`);
      params.push(menu_item_id);
    }
    if (reason) {
      conditions.push(`reason = $${paramIndex++}`);
      params.push(reason);
    }
    if (from_date) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(to_date);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching waste entries:', error);
    res.status(500).json({ error: 'Failed to fetch waste entries' });
  }
});

// GET single waste entry
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM waste_entries WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waste entry not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching waste entry:', error);
    res.status(500).json({ error: 'Failed to fetch waste entry' });
  }
});

// POST record waste
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      menu_item_id,
      menu_item_name,
      qty,
      unit_cost,
      reason,
      reported_by,
      recorded_by,
      notes
    } = req.body;

    const id = `waste_${Date.now().toString(36)}`;
    const total_cost = qty * unit_cost;

    // Get current stock
    const invResult = await client.query(
      'SELECT stock FROM inventory_records WHERE menu_item_id = $1',
      [menu_item_id]
    );

    const stockBefore = invResult.rows.length > 0 ? invResult.rows[0].stock : 0;
    const newStock = Math.max(0, stockBefore - qty);

    // Insert waste entry
    const result = await client.query(
      `INSERT INTO waste_entries 
        (id, menu_item_id, menu_item_name, qty, unit_cost, total_cost, reason, reported_by, recorded_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, menu_item_id, menu_item_name, qty, unit_cost, total_cost, reason, reported_by, recorded_by, notes]
    );

    // Update inventory stock
    if (invResult.rows.length > 0) {
      await client.query(
        'UPDATE inventory_records SET stock = $1, updated_at = $2 WHERE menu_item_id = $3',
        [newStock, new Date().toISOString(), menu_item_id]
      );
    }

    // Record movement
    const movementId = `mov_${Date.now().toString(36)}`;
    await client.query(
      `INSERT INTO stock_movements 
        (id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, unit_cost, total_value, performed_by, notes)
       VALUES ($1, $2, $3, 'waste', $4, $5, $6, $7, $8, $9, $10)`,
      [movementId, menu_item_id, menu_item_name, -qty, stockBefore, newStock, unit_cost, -total_cost, recorded_by, notes]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording waste:', error);
    res.status(500).json({ error: 'Failed to record waste' });
  } finally {
    client.release();
  }
});

// GET waste summary/analytics
router.get('/summary/overview', async (_req: Request, res: Response) => {
  try {
    // Total waste in last 30 days
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total_entries, SUM(qty) as total_qty, SUM(total_cost) as total_cost
       FROM waste_entries 
       WHERE timestamp >= NOW() - INTERVAL '30 days'`
    );

    // Waste by reason
    const byReasonResult = await pool.query(
      `SELECT reason, COUNT(*) as count, SUM(qty) as total_qty, SUM(total_cost) as total_cost
       FROM waste_entries 
       WHERE timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY reason
       ORDER BY total_cost DESC`
    );

    // Top waste items
    const topItemsResult = await pool.query(
      `SELECT menu_item_id, menu_item_name, SUM(qty) as total_qty, SUM(total_cost) as total_cost
       FROM waste_entries 
       WHERE timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY menu_item_id, menu_item_name
       ORDER BY total_cost DESC
       LIMIT 5`
    );

    // Most common reason
    const topReasonResult = await pool.query(
      `SELECT reason, COUNT(*) as count
       FROM waste_entries 
       WHERE timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY reason
       ORDER BY count DESC
       LIMIT 1`
    );

    res.json({
      totals: totalResult.rows[0],
      byReason: byReasonResult.rows,
      topItems: topItemsResult.rows,
      topReason: topReasonResult.rows[0]?.reason || null
    });
  } catch (error) {
    console.error('Error fetching waste summary:', error);
    res.status(500).json({ error: 'Failed to fetch waste summary' });
  }
});

export const wasteRouter = router;
