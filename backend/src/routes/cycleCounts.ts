import { Router, Response } from 'express';
import { HttpError } from '../http.js';
import {
  createCycleCount,
  getCycleCount,
  listCycleCount,
  recordCycleCount,
  completeCycleCount,
  cancelCycleCount,
} from '../services/cycleCountService.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET list cycle counts
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.query;
    const cycles = await listCycleCount(req.restaurantId!, status as string | undefined);
    res.json(cycles);
  } catch (error) {
    console.error('Error fetching cycle counts:', error);
    res.status(500).json({ error: 'Failed to fetch cycle counts' });
  }
});

// POST create new cycle count
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { scheduledDate, locationId } = req.body;

    if (!scheduledDate) {
      throw new HttpError(400, 'scheduledDate is required');
    }

    const cycle = await createCycleCount(req.restaurantId!, scheduledDate, locationId);
    res.status(201).json(cycle);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error creating cycle count:', error);
      res.status(500).json({ error: 'Failed to create cycle count' });
    }
  }
});

// GET cycle count by ID
router.get('/:cycleCountId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cycleCountId } = req.params;
    const result = await getCycleCount(cycleCountId, req.restaurantId!);

    if (!result) {
      throw new HttpError(404, 'Cycle count not found');
    }

    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching cycle count:', error);
      res.status(500).json({ error: 'Failed to fetch cycle count' });
    }
  }
});

// PATCH record count for item
router.patch('/:cycleCountId/items/:itemId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { countedQty, varianceReason } = req.body;

    if (countedQty === undefined) {
      throw new HttpError(400, 'countedQty is required');
    }

    const item = await recordCycleCount(
      req.params.itemId,
      countedQty,
      req.userId || 'system',
      varianceReason
    );

    if (!item) {
      throw new HttpError(404, 'Cycle count item not found');
    }

    res.json(item);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error recording count:', error);
      res.status(500).json({ error: 'Failed to record count' });
    }
  }
});

// POST complete cycle count
router.post('/:cycleCountId/complete', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cycleCountId } = req.params;
    const { varianceNotes } = req.body;

    const cycle = await completeCycleCount(
      cycleCountId,
      req.restaurantId!,
      req.userId || 'system',
      varianceNotes
    );

    res.json(cycle);
  } catch (error) {
    console.error('Error completing cycle count:', error);
    res.status(500).json({ error: 'Failed to complete cycle count' });
  }
});

// POST cancel cycle count
router.post('/:cycleCountId/cancel', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cycleCountId } = req.params;

    const cycle = await cancelCycleCount(cycleCountId, req.restaurantId!);

    if (!cycle) {
      throw new HttpError(404, 'Cycle count not found');
    }

    res.json(cycle);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error cancelling cycle count:', error);
      res.status(500).json({ error: 'Failed to cancel cycle count' });
    }
  }
});

export const cycleCountRouter = router;
