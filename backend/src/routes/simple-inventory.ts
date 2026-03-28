import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET all inventory items with menu item names
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId || 'default_restaurant';
    
    const result = await pool.query(`
      SELECT 
        ir.menu_item_id,
        COALESCE(m.name, ir.menu_item_id) as menu_item_name,
        ir.stock,
        ir.low_stock_threshold,
        ir.unit_cost,
        m.category,
        ir.updated_at
      FROM inventory_records ir
      LEFT JOIN menu_items m ON m.id = ir.menu_item_id
      WHERE ir.restaurant_id = $1
      ORDER BY m.name ASC
    `, [restaurantId]);
    
    res.json(result.rows.map(row => ({
      menuItemId: row.menu_item_id,
      menuItemName: row.menu_item_name,
      stock: row.stock,
      lowStockThreshold: row.low_stock_threshold,
      unitCost: row.unit_cost,
      category: row.category,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// PUT update inventory record
router.put('/:menuItemId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { stock, low_stock_threshold } = req.body;
    const restaurantId = req.restaurantId || 'default_restaurant';
    
    // Use UPSERT to create or update
    const result = await pool.query(`
      INSERT INTO inventory_records (id, menu_item_id, stock, low_stock_threshold, restaurant_id, created_at, updated_at)
      VALUES ($4, $3, $1, $2, $5, NOW(), NOW())
      ON CONFLICT (menu_item_id, restaurant_id)
      DO UPDATE SET 
        stock = COALESCE($1, EXCLUDED.stock),
        low_stock_threshold = COALESCE($2, EXCLUDED.low_stock_threshold),
        updated_at = NOW()
      RETURNING *
    `, [stock, low_stock_threshold, menuItemId, `inv_${menuItemId}`, restaurantId]);
    
    if (result.rows.length === 0) {
      res.status(500).json({ error: 'Failed to update inventory record' });
      return;
    }
    
    const row = result.rows[0];
    res.json({
      menuItemId: row.menu_item_id,
      stock: row.stock,
      lowStockThreshold: row.low_stock_threshold,
      unitCost: row.unit_cost,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

// PATCH adjust stock
router.patch('/:menuItemId/adjust', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId } = req.params;
    const { adjustment, reason, performed_by } = req.body;
    const restaurantId = req.restaurantId || 'default_restaurant';
    
    // Get current stock (or create record if doesn't exist)
    let current = await pool.query(
      'SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2',
      [menuItemId, restaurantId]
    );
    
    if (current.rows.length === 0) {
      // Create inventory record if it doesn't exist
      await pool.query(`
        INSERT INTO inventory_records (id, menu_item_id, stock, low_stock_threshold, restaurant_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (menu_item_id, restaurant_id) DO NOTHING
      `, [`inv_${menuItemId}`, menuItemId, 0, 5, restaurantId]);
      
      current = await pool.query(
        'SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2',
        [menuItemId, restaurantId]
      );
    }
    
    const stockBefore = current.rows[0].stock || 0;
    const newStock = Math.max(0, stockBefore + adjustment);
    
    // Update stock
    const result = await pool.query(`
      UPDATE inventory_records 
      SET stock = $1, updated_at = NOW()
      WHERE menu_item_id = $2 AND restaurant_id = $3
      RETURNING *
    `, [newStock, menuItemId, restaurantId]);
    
    const row = result.rows[0];
    res.json({
      menuItemId: row.menu_item_id,
      stock: row.stock,
      lowStockThreshold: row.low_stock_threshold,
      unitCost: row.unit_cost,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// POST create new inventory record
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { menuItemId, stock = 0, lowStockThreshold = 5, unitCost = 0 } = req.body;
    const restaurantId = req.restaurantId || 'default_restaurant';
    
    if (!menuItemId) {
      res.status(400).json({ error: 'menuItemId is required' });
      return;
    }
    
    const result = await pool.query(`
      INSERT INTO inventory_records (id, menu_item_id, stock, low_stock_threshold, unit_cost, restaurant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (menu_item_id, restaurant_id) DO UPDATE
      SET 
        stock = COALESCE($3, EXCLUDED.stock),
        low_stock_threshold = COALESCE($4, EXCLUDED.low_stock_threshold),
        unit_cost = COALESCE($5, EXCLUDED.unit_cost),
        updated_at = NOW()
      RETURNING *
    `, [`inv_${menuItemId}`, menuItemId, stock, lowStockThreshold, unitCost, restaurantId]);
    
    const row = result.rows[0];
    res.status(201).json({
      menuItemId: row.menu_item_id,
      stock: row.stock,
      lowStockThreshold: row.low_stock_threshold,
      unitCost: row.unit_cost,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error('Error creating inventory record:', error);
    res.status(500).json({ error: 'Failed to create inventory record' });
  }
});

export default router;
