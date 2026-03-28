import { Router, Request, Response } from 'express';
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

    const result = await updateInventoryItem(id, req.restaurantId!, updates);
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
    const { locationId, adjustment, reason, performedBy } = req.body;
    
    if (!locationId || adjustment === undefined) {
      throw new HttpError(400, 'locationId and adjustment are required');
    }

    const result = await adjustStockAtLocation(
      id,
      locationId,
      adjustment,
      reason ?? 'Manual adjustment',
      performedBy ?? req.userId ?? 'system',
      req.restaurantId!
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
