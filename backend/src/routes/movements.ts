import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET all stock movements
router.get('/', async (req: Request, res: Response) => {
  try {
    const { menu_item_id, type, from_date, to_date, limit } = req.query;

    let query = 'SELECT * FROM stock_movements';
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (menu_item_id) {
      conditions.push(`menu_item_id = $${paramIndex++}`);
      params.push(menu_item_id);
    }
    if (type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(type);
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
    console.error('Error fetching movements:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// GET single movement
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM stock_movements WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching movement:', error);
    res.status(500).json({ error: 'Failed to fetch stock movement' });
  }
});

// POST create new movement (usually done internally by other operations)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      menu_item_id,
      menu_item_name,
      type,
      qty,
      stock_before,
      balance_after,
      unit_cost,
      total_value,
      reference,
      performed_by,
      notes
    } = req.body;

    const id = `mov_${Date.now().toString(36)}`;
    
    const result = await pool.query(
      `INSERT INTO stock_movements 
        (id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, unit_cost, total_value, reference, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [id, menu_item_id, menu_item_name, type, qty, stock_before, balance_after, unit_cost, total_value, reference, performed_by, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating movement:', error);
    res.status(500).json({ error: 'Failed to create stock movement' });
  }
});

// GET movement summary/analytics
router.get('/summary/overview', async (_req: Request, res: Response) => {
  try {
    // Total movements in last 30 days
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total, SUM(ABS(qty)) as total_qty 
       FROM stock_movements 
       WHERE timestamp >= NOW() - INTERVAL '30 days'`
    );

    // Movements by type
    const byTypeResult = await pool.query(
      `SELECT type, COUNT(*) as count, SUM(ABS(qty)) as total_qty, SUM(ABS(total_value)) as total_value
       FROM stock_movements 
       WHERE timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY type`
    );

    // Recent movements
    const recentResult = await pool.query(
      `SELECT * FROM stock_movements ORDER BY timestamp DESC LIMIT 10`
    );

    res.json({
      totals: totalResult.rows[0],
      byType: byTypeResult.rows,
      recent: recentResult.rows
    });
  } catch (error) {
    console.error('Error fetching movement summary:', error);
    res.status(500).json({ error: 'Failed to fetch movement summary' });
  }
});

export const movementsRouter = router;
