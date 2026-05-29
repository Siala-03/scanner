import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET all locations
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        il.*,
        COUNT(DISTINCT ist.inventory_item_id) as total_items,
        COALESCE(SUM(ist.quantity), 0) as total_stock,
        COUNT(DISTINCT CASE WHEN ist.quantity <= ist.min_level THEN ist.inventory_item_id END) as low_stock_items
      FROM inventory_locations il
      LEFT JOIN inventory_stock ist ON ist.location_id = il.id
      WHERE il.restaurant_id = $1 AND il.is_active = true
      GROUP BY il.id
      ORDER BY il.name
    `, [req.restaurantId]);

    res.json(result.rows.map(row => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: row.name,
      type: row.type,
      description: row.description,
      isActive: row.is_active,
      capacity: row.capacity,
      temperatureRange: row.temperature_range,
      totalItems: parseInt(row.total_items),
      totalStock: parseFloat(row.total_stock),
      lowStockItems: parseInt(row.low_stock_items),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error: any) {
    // 42P01 = table does not exist (migrations not yet applied) — return empty list
    if (error?.code === '42P01' || error?.code === '42703') {
      return res.json([]);
    }
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET single location
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        il.*,
        COUNT(DISTINCT ist.inventory_item_id) as total_items,
        COALESCE(SUM(ist.quantity), 0) as total_stock
      FROM inventory_locations il
      LEFT JOIN inventory_stock ist ON ist.location_id = il.id
      WHERE il.id = $1 AND il.restaurant_id = $2
      GROUP BY il.id
    `, [id, req.restaurantId]);

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Location not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: row.name,
      type: row.type,
      description: row.description,
      isActive: row.is_active,
      capacity: row.capacity,
      temperatureRange: row.temperature_range,
      totalItems: parseInt(row.total_items),
      totalStock: parseFloat(row.total_stock),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching location:', error);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  }
});

// POST create location
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, type, description, capacity, temperatureRange } = req.body;
    const id = `loc_${Date.now().toString(36)}`;

    const result = await pool.query(`
      INSERT INTO inventory_locations
        (id, restaurant_id, name, type, description, capacity, temperature_range)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, req.restaurantId, name, type, description, capacity, temperatureRange]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// PUT update location
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, description, capacity, temperatureRange, isActive } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (type !== undefined) { updates.push(`type = $${paramIndex++}`); values.push(type); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
    if (capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); values.push(capacity); }
    if (temperatureRange !== undefined) { updates.push(`temperature_range = $${paramIndex++}`); values.push(temperatureRange); }
    if (isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(isActive); }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    values.push(req.restaurantId);

    const result = await pool.query(`
      UPDATE inventory_locations 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND restaurant_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Location not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating location:', error);
      res.status(500).json({ error: 'Failed to update location' });
    }
  }
});

// DELETE location (soft delete)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if location has stock
    const stockCheck = await pool.query(`
      SELECT COUNT(*) as count FROM inventory_stock WHERE location_id = $1 AND quantity > 0
    `, [id]);

    if (parseInt(stockCheck.rows[0].count) > 0) {
      throw new HttpError(400, 'Cannot delete location with stock. Transfer stock first.');
    }

    await pool.query(`
      UPDATE inventory_locations 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND restaurant_id = $2
    `, [id, req.restaurantId]);

    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting location:', error);
      res.status(500).json({ error: 'Failed to delete location' });
    }
  }
});

// GET stock at location
router.get('/:id/stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        ist.*,
        ii.name as item_name,
        ii.category,
        ii.unit_of_measure
      FROM inventory_stock ist
      JOIN inventory_items ii ON ii.id = ist.inventory_item_id
      WHERE ist.location_id = $1 AND ii.restaurant_id = $2
      ORDER BY ii.name
    `, [id, req.restaurantId]);

    res.json(result.rows.map(row => ({
      itemId: row.inventory_item_id,
      itemName: row.item_name,
      category: row.category,
      unitOfMeasure: row.unit_of_measure,
      quantity: row.quantity,
      reservedQty: row.reserved_qty,
      minLevel: row.min_level,
      maxLevel: row.max_level,
      reorderPoint: row.reorder_point,
      reorderQty: row.reorder_qty,
      safetyStock: row.safety_stock,
    })));
  } catch (error) {
    console.error('Error fetching location stock:', error);
    res.status(500).json({ error: 'Failed to fetch location stock' });
  }
});

// GET location summary
router.get('/:id/summary', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get location details
    const locationResult = await pool.query(`
      SELECT * FROM inventory_locations WHERE id = $1 AND restaurant_id = $2
    `, [id, req.restaurantId]);

    if (locationResult.rows.length === 0) {
      throw new HttpError(404, 'Location not found');
    }

    const location = locationResult.rows[0];

    // Get stock summary
    const stockSummary = await pool.query(`
      SELECT 
        COUNT(DISTINCT ist.inventory_item_id) as total_items,
        COALESCE(SUM(ist.quantity), 0) as total_stock,
        COALESCE(SUM(ist.quantity * COALESCE(
          (SELECT unit_price FROM supplier_prices 
           WHERE inventory_item_id = ist.inventory_item_id AND is_current = true 
           ORDER BY effective_from DESC LIMIT 1),
          0
        )), 0) as total_value,
        COUNT(DISTINCT CASE WHEN ist.quantity <= ist.min_level THEN ist.inventory_item_id END) as low_stock_count,
        COUNT(DISTINCT CASE WHEN ist.quantity = 0 THEN ist.inventory_item_id END) as out_of_stock_count
      FROM inventory_stock ist
      WHERE ist.location_id = $1
    `, [id]);

    const summary = stockSummary.rows[0];

    // Get category breakdown
    const categoryBreakdown = await pool.query(`
      SELECT 
        ii.category,
        COUNT(DISTINCT ist.inventory_item_id) as item_count,
        COALESCE(SUM(ist.quantity), 0) as total_quantity,
        COALESCE(SUM(ist.quantity * COALESCE(
          (SELECT unit_price FROM supplier_prices 
           WHERE inventory_item_id = ist.inventory_item_id AND is_current = true 
           ORDER BY effective_from DESC LIMIT 1),
          0
        )), 0) as total_value
      FROM inventory_stock ist
      JOIN inventory_items ii ON ii.id = ist.inventory_item_id
      WHERE ist.location_id = $1
      GROUP BY ii.category
      ORDER BY total_value DESC
    `, [id]);

    res.json({
      location: {
        id: location.id,
        name: location.name,
        type: location.type,
        description: location.description,
        capacity: location.capacity,
        temperatureRange: location.temperature_range,
      },
      summary: {
        totalItems: parseInt(summary.total_items),
        totalStock: parseFloat(summary.total_stock),
        totalValue: parseFloat(summary.total_value),
        lowStockCount: parseInt(summary.low_stock_count),
        outOfStockCount: parseInt(summary.out_of_stock_count),
      },
      categoryBreakdown: categoryBreakdown.rows.map(row => ({
        category: row.category,
        itemCount: parseInt(row.item_count),
        totalQuantity: parseFloat(row.total_quantity),
        totalValue: parseFloat(row.total_value),
      })),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching location summary:', error);
      res.status(500).json({ error: 'Failed to fetch location summary' });
    }
  }
});

export const locationsRouter = router;
