import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { emitMenuUpdate } from '../socket.js';

export const menuRouter = Router();

// GET all menu items
menuRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM menu_items ORDER BY category, name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST import/replace menu items
menuRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid menu items' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing menu items
      await client.query('DELETE FROM menu_items');
      
      // Insert new items
      for (const item of items) {
        await client.query(
          `INSERT INTO menu_items (id, name, description, price, category, emoji, prep_time, is_available, is_popular)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            item.id,
            item.name,
            item.description || '',
            item.price,
            item.category,
            item.emoji || '🍽️',
            item.prepTime || 15,
            item.isAvailable !== false,
            item.isPopular || false
          ]
        );
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Menu updated successfully', count: items.length });
      
      // Notify all connected clients about menu update
      emitMenuUpdate({ type: 'change', message: 'Menu updated' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error saving menu:', err);
    res.status(500).json({ error: 'Failed to save menu' });
  }
});

// DELETE reset to default (clear menu)
menuRouter.delete('/', async (_req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM menu_items');
    res.json({ message: 'Menu cleared' });
    
    // Notify all connected clients about menu update
    emitMenuUpdate({ type: 'change', message: 'Menu reset to default' });
  } catch (err) {
    console.error('Error clearing menu:', err);
    res.status(500).json({ error: 'Failed to clear menu' });
  }
});
