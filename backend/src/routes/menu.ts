import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { emitMenuUpdate } from '../socket.js';
import { rowsToCamelCase } from '../utils/camelCase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

export const menuRouter = Router();

// GET all menu items
menuRouter.get('/', async (req: Request, res: Response) => {
  try {
    const restaurantId = (req.query.restaurantId as string) || 'default_restaurant';
    const result = await pool.query(
      'SELECT * FROM menu_items WHERE restaurant_id = $1 AND is_available = true ORDER BY category, name',
      [restaurantId]
    );
    
    // Log for debugging
    console.log(`Fetching menu for restaurant ${restaurantId}: found ${result.rows.length} items`);
    
    // Return empty array if no items, client will use defaults
    if (result.rows.length === 0) {
      console.log('No menu items found, returning empty array (client will use defaults)');
      res.json([]);
      return;
    }
    
    // Transform snake_case to camelCase for frontend compatibility
    const menuItems = rowsToCamelCase(result.rows);
    res.json(menuItems);
  } catch (err) {
    console.error('Error fetching menu:', err);
    // Return empty array on error to allow fallback to defaults
    res.json([]);
  }
});

// POST import/replace menu items
menuRouter.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items } = req.body;
    const restaurantId = req.restaurantId || 'default_restaurant';
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid menu items' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing menu items for this restaurant
      console.log(`Clearing menu items for restaurant ${restaurantId}`);
      await client.query('DELETE FROM menu_items WHERE restaurant_id = $1', [restaurantId]);
      
      // Insert new items
      console.log(`Inserting ${items.length} new menu items for restaurant ${restaurantId}`);
      for (const item of items) {
        await client.query(
          `INSERT INTO menu_items (id, name, description, price, category, emoji, prep_time, is_available, is_popular, restaurant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            item.id,
            item.name,
            item.description || '',
            item.price,
            item.category,
            item.emoji || '🍽️',
            item.prepTime || 15,
            item.isAvailable !== false,  // Default to true if not specified
            item.isPopular || false,
            restaurantId
          ]
        );
      }
      
      await client.query('COMMIT');
      console.log(`Successfully saved ${items.length} menu items for restaurant ${restaurantId}`);
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
menuRouter.delete('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId || 'default_restaurant';
    console.log(`Clearing menu for restaurant ${restaurantId}`);
    await pool.query('DELETE FROM menu_items WHERE restaurant_id = $1', [restaurantId]);
    res.json({ message: 'Menu cleared' });
    
    // Notify all connected clients about menu update
    emitMenuUpdate({ type: 'change', message: 'Menu reset to default' });
  } catch (err) {
    console.error('Error clearing menu:', err);
    res.status(500).json({ error: 'Failed to clear menu' });
  }
});
