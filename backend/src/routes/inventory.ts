import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { 
  getAllInventoryItems, 
  getInventoryItemById, 
  adjustStockAtLocation,
  getLowStockItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  initializeStockAtLocation
} from '../services/unifiedInventoryService.js';
import { emitInventoryUpdate } from '../socket.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET all inventory items with stock information
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await getAllInventoryItems(req.restaurantId!);
    res.json(result);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET single inventory item by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await getInventoryItemById(id, req.restaurantId!);
    if (!result) {
      throw new HttpError(404, 'Inventory item not found');
    }
    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching inventory item:', error);
      res.status(500).json({ error: 'Failed to fetch inventory item' });
    }
  }
});

// POST create new inventory item
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, category, unitOfMeasure, sku, subCategory } = req.body;
    
    if (!name || !category || !unitOfMeasure) {
      throw new HttpError(400, 'Name, category, and unitOfMeasure are required');
    }

    const result = await createInventoryItem(
      req.restaurantId!,
      name,
      category,
      unitOfMeasure,
      sku,
      subCategory
    );
    
    emitInventoryUpdate({ type: 'create', item: result });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating inventory item:', error);
      res.status(500).json({ error: 'Failed to create inventory item' });
    }
  }
});

// PUT update inventory item
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const restaurantId = req.restaurantId || 'default_restaurant';

    // Check if this is a simple inventory record first
    const simple = await pool.query(`
      SELECT * FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2
    `, [id, restaurantId]);

    if (simple.rows.length > 0) {
      // Update simple inventory record with snake_case support
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCount = 1;

      // Map both camelCase and snake_case inputs
      const stock = updates.stock ?? updates.stock;
      const lowStockThreshold = updates.low_stock_threshold ?? updates.lowStockThreshold;
      const reorderPoint = updates.reorder_point ?? updates.reorderPoint;
      const reorderQty = updates.reorder_qty ?? updates.reorderQty;
      const unitCost = updates.unit_cost ?? updates.unitCost;
      const location = updates.location;

      if (updates.stock !== undefined) {
        updateFields.push(`stock = $${paramCount}`);
        updateValues.push(updates.stock);
        paramCount++;
      }
      if (updates.low_stock_threshold !== undefined || updates.lowStockThreshold !== undefined) {
        updateFields.push(`low_stock_threshold = $${paramCount}`);
        updateValues.push(lowStockThreshold);
        paramCount++;
      }
      if (updates.reorder_point !== undefined || updates.reorderPoint !== undefined) {
        updateFields.push(`reorder_point = $${paramCount}`);
        updateValues.push(reorderPoint);
        paramCount++;
      }
      if (updates.reorder_qty !== undefined || updates.reorderQty !== undefined) {
        updateFields.push(`reorder_qty = $${paramCount}`);
        updateValues.push(reorderQty);
        paramCount++;
      }
      if (updates.unit_cost !== undefined || updates.unitCost !== undefined) {
        updateFields.push(`unit_cost = $${paramCount}`);
        updateValues.push(unitCost);
        paramCount++;
      }
      if (updates.location !== undefined) {
        updateFields.push(`location = $${paramCount}`);
        updateValues.push(location);
        paramCount++;
      }

      if (updateFields.length === 0) {
        // No updates to make - return normalized response
        return res.json({
          menuItemId: simple.rows[0].menu_item_id,
          stock: simple.rows[0].stock,
          lowStockThreshold: simple.rows[0].low_stock_threshold,
          reorderPoint: simple.rows[0].reorder_point,
          reorderQty: simple.rows[0].reorder_qty,
          unitCost: simple.rows[0].unit_cost,
          location: simple.rows[0].location,
          updatedAt: simple.rows[0].updated_at,
        });
      }

      updateFields.push('updated_at = NOW()');
      updateValues.push(id, restaurantId);

      const result = await pool.query(`
        UPDATE inventory_records
        SET ${updateFields.join(', ')}
        WHERE menu_item_id = $${paramCount} AND restaurant_id = $${paramCount + 1}
        RETURNING *
      `, updateValues);

      const row = result.rows[0];
      return res.json({
        menuItemId: row.menu_item_id,
        stock: row.stock,
        lowStockThreshold: row.low_stock_threshold,
        reorderPoint: row.reorder_point,
        reorderQty: row.reorder_qty,
        unitCost: row.unit_cost,
        location: row.location,
        updatedAt: row.updated_at,
      });
    }

    // Fall back to enterprise service
    const result = await updateInventoryItem(id, restaurantId, updates);
    if (!result) {
      throw new HttpError(404, 'Inventory item not found');
    }

    emitInventoryUpdate({ type: 'update', item: result });
    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating inventory item:', error);
      res.status(500).json({ error: 'Failed to update inventory item' });
    }
  }
});

// DELETE inventory item (soft delete)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const success = await deleteInventoryItem(id, req.restaurantId!);
    
    if (!success) {
      throw new HttpError(404, 'Inventory item not found');
    }

    emitInventoryUpdate({ type: 'delete', itemId: id });
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting inventory item:', error);
      res.status(500).json({ error: 'Failed to delete inventory item' });
    }
  }
});

// PATCH adjust stock at location
router.patch('/:id/adjust', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { locationId = 'default', adjustment, reason, performedBy } = req.body;
    const restaurantId = req.restaurantId || 'default_restaurant';
    
    if (adjustment === undefined) {
      throw new HttpError(400, 'adjustment is required');
    }

    // For 'default' location, use simple inventory records table for backward compatibility
    if (locationId === 'default') {
      let current = await pool.query(
        'SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2',
        [id, restaurantId]
      );
      
      if (current.rows.length === 0) {
        // Create record if doesn't exist
        await pool.query(`
          INSERT INTO inventory_records (id, menu_item_id, stock, low_stock_threshold, restaurant_id, created_at, updated_at)
          VALUES ($1, $2, 0, 5, $3, NOW(), NOW())
          ON CONFLICT (menu_item_id, restaurant_id) DO NOTHING
        `, [`inv_${id}`, id, restaurantId]);
        
        // Fetch the created/existing record
        current = await pool.query(
          'SELECT stock, low_stock_threshold FROM inventory_records WHERE menu_item_id = $1 AND restaurant_id = $2',
          [id, restaurantId]
        );
      }
      
      const stockBefore = current.rows[0]?.stock ?? 0;
      const newStock = Math.max(0, stockBefore + adjustment);
      
      const result = await pool.query(`
        UPDATE inventory_records 
        SET stock = $1, updated_at = NOW()
        WHERE menu_item_id = $2 AND restaurant_id = $3
        RETURNING *
      `, [newStock, id, restaurantId]);
      
      const row = result.rows[0];
      return res.json({
        menuItemId: row.menu_item_id,
        stock: row.stock,
        lowStockThreshold: row.low_stock_threshold,
        unitCost: row.unit_cost,
        updatedAt: row.updated_at,
      });
    }

    // For enterprise locations, use the enterprise service
    const result = await adjustStockAtLocation(
      id,
      locationId,
      adjustment,
      reason ?? 'Manual adjustment',
      performedBy ?? req.userId ?? 'system',
      restaurantId
    );
    
    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error adjusting stock:', error);
      res.status(500).json({ error: 'Failed to adjust stock' });
    }
  }
});

// POST initialize stock at location
router.post('/:id/stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      locationId, 
      initialQuantity = 0, 
      minLevel = 0, 
      maxLevel = 0, 
      reorderPoint = 0, 
      reorderQty = 0, 
      safetyStock = 0 
    } = req.body;
    
    if (!locationId) {
      throw new HttpError(400, 'locationId is required');
    }

    const result = await initializeStockAtLocation(
      id,
      locationId,
      req.restaurantId!,
      initialQuantity,
      minLevel,
      maxLevel,
      reorderPoint,
      reorderQty,
      safetyStock
    );
    
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error initializing stock:', error);
      res.status(500).json({ error: 'Failed to initialize stock' });
    }
  }
});

// GET low stock items
router.get('/alerts/low-stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await getLowStockItems(req.restaurantId!);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

export const inventoryRouter = router;
 