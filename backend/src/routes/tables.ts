import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { emitWaiterCall } from '../socket.js';
import { toCamelCase } from '../utils/camelCase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

export const tablesRouter = Router();

// GET all tables
tablesRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId || 'default_restaurant';
    const result = await pool.query('SELECT * FROM tables WHERE restaurant_id = $1 ORDER BY table_number', [restaurantId]);
    res.json(toCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching tables:', err);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// POST create new table
tablesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { table_number, name, capacity, location } = req.body;
    
    // Check if table number already exists
    const existing = await pool.query(
      'SELECT id FROM tables WHERE table_number = $1',
      [table_number]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Table number already exists' });
    }
    
    const id = `table_${Date.now().toString(36)}`;
    const result = await pool.query(
      `INSERT INTO tables (id, table_number, name, capacity, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, table_number, name || `Table ${table_number}`, capacity || 4, location || 'Main']
    );
    
    res.status(201).json(toCamelCase(result.rows[0]));
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).json({ error: 'Failed to create table' });
  }
});

// DELETE remove table
tablesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tables WHERE id = $1', [id]);
    res.json({ message: 'Table deleted' });
  } catch (err) {
    console.error('Error deleting table:', err);
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

// POST call waiter for a table
tablesRouter.post('/call-waiter', async (req: Request, res: Response) => {
  try {
    const { tableNumber } = req.body;
    
    if (!tableNumber) {
      return res.status(400).json({ error: 'Table number is required' });
    }
    
    // Emit socket event to all waiters on duty
    emitWaiterCall({
      tableNumber,
      timestamp: new Date()
    });
    
    res.json({ success: true, message: `Waiter called for table ${tableNumber}` });
  } catch (err) {
    console.error('Error calling waiter:', err);
    res.status(500).json({ error: 'Failed to call waiter' });
  }
});
