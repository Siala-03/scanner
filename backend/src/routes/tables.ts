import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { emitWaiterCall } from '../socket.js';
import { toCamelCase } from '../utils/camelCase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

export const tablesRouter = Router();

// GET all tables
tablesRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.query.restaurantId as string || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    
    // Superadmin can view any restaurant's tables, others only their own
    if (req.staffRole !== 'superadmin' && req.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Not authorized to view these tables' });
    }
    
    const result = await pool.query(
      'SELECT * FROM tables WHERE restaurant_id = $1 ORDER BY table_number',
      [restaurantId]
    );
    res.json(toCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching tables:', err);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// POST create new table
tablesRouter.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { table_number, name, capacity, location } = req.body;
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    
    // Check if table number already exists for this restaurant
    const existing = await pool.query(
      'SELECT id FROM tables WHERE table_number = $1 AND restaurant_id = $2',
      [table_number, restaurantId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Table number already exists for this restaurant' });
    }
    
    const id = `table_${Date.now().toString(36)}`;
    const result = await pool.query(
      `INSERT INTO tables (id, table_number, name, capacity, location, restaurant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, table_number, name || `Table ${table_number}`, capacity || 4, location || 'Main', restaurantId]
    );
    
    res.status(201).json(toCamelCase(result.rows[0]));
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).json({ error: 'Failed to create table' });
  }
});

// DELETE remove table
tablesRouter.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get the table to check its restaurant
    const tableResult = await pool.query('SELECT restaurant_id FROM tables WHERE id = $1', [id]);
    
    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    const tableRestaurantId = tableResult.rows[0].restaurant_id;
    
    // Verify user has permission to delete this table
    // Superadmin can delete any, others can only delete from their restaurant
    if (req.staffRole !== 'superadmin' && req.restaurantId !== tableRestaurantId) {
      return res.status(403).json({ error: 'Not authorized to delete this table' });
    }
    
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
