import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

export const tablesRouter = Router();

// GET all tables
tablesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM tables ORDER BY table_number');
    res.json(result.rows);
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
    
    res.status(201).json(result.rows[0]);
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
