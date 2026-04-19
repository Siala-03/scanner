import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

type KPIPeriod = 'daily' | 'weekly' | 'monthly';
type KPIMetric = 'orders_served' | 'revenue' | 'rating' | 'tables_served' | 'prep_time';

const router = Router();

// GET /api/kpis - Get all KPIs for the restaurant (manager only)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can view KPIs');
    }

    const result = await pool.query(
      'SELECT * FROM kpis WHERE restaurant_id = $1 ORDER BY created_at DESC',
      [req.restaurantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    throw error;
  }
});

// POST /api/kpis - Create a new KPI (manager only)
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can create KPIs');
    }

    const { staffRole, name, description, metric, targetValue, period, assignedStaffIds } = req.body;

    if (!staffRole || !name || !metric || !targetValue || !period) {
      throw new HttpError(400, 'Missing required fields');
    }

    const validMetrics: KPIMetric[] = ['orders_served', 'revenue', 'rating', 'tables_served', 'prep_time'];
    if (!validMetrics.includes(metric)) {
      throw new HttpError(400, 'Invalid metric');
    }

    const validPeriods: KPIPeriod[] = ['daily', 'weekly', 'monthly'];
    if (!validPeriods.includes(period)) {
      throw new HttpError(400, 'Invalid period');
    }

    const result = await pool.query(
      `INSERT INTO kpis (restaurant_id, staff_role, name, description, metric, target_value, period, created_by, assigned_staff_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.restaurantId, staffRole, name, description || '', metric, targetValue, period, req.staffId, assignedStaffIds || []]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating KPI:', error);
    throw error;
  }
});

// GET /api/kpis/staff - Get KPIs for current staff member
router.get('/staff', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT k.*, skp.current_value, skp.period_start, skp.period_end, skp.achieved
       FROM kpis k
       LEFT JOIN staff_kpi_progress skp ON k.id = skp.kpi_id AND skp.staff_id = $1
       WHERE k.restaurant_id = $2 AND k.staff_role = $3
         AND (COALESCE(array_length(k.assigned_staff_ids, 1), 0) = 0 OR $1 = ANY(k.assigned_staff_ids))
       ORDER BY k.created_at DESC`,
      [req.staffId, req.restaurantId, req.staffRole]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching staff KPIs:', error);
    throw error;
  }
});

// PUT /api/kpis/progress/:kpiId - Update KPI progress (system/internal use, but for now allow staff to update)
router.put('/progress/:kpiId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { kpiId } = req.params;
    const { currentValue } = req.body;

    if (typeof currentValue !== 'number') {
      throw new HttpError(400, 'Invalid current value');
    }

    // Get KPI details
    const kpiResult = await pool.query('SELECT * FROM kpis WHERE id = $1 AND restaurant_id = $2', [kpiId, req.restaurantId]);
    if (kpiResult.rows.length === 0) {
      throw new HttpError(404, 'KPI not found');
    }

    const kpi = kpiResult.rows[0];

    // Calculate period dates
    const now = new Date();
    let periodStart = new Date(now);
    let periodEnd = new Date(now);

    switch (kpi.period) {
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        periodStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 7);
        break;
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
    }

    // Upsert progress
    const progressResult = await pool.query(
      `INSERT INTO staff_kpi_progress (staff_id, kpi_id, current_value, period_start, period_end, achieved)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (staff_id, kpi_id, period_start)
       DO UPDATE SET current_value = EXCLUDED.current_value, achieved = EXCLUDED.current_value >= (SELECT target_value FROM kpis WHERE id = EXCLUDED.kpi_id), updated_at = NOW()
       RETURNING *`,
      [req.userId, kpiId, currentValue, periodStart, periodEnd, currentValue >= kpi.target_value]
    );

    res.json(progressResult.rows[0]);
  } catch (error) {
    console.error('Error updating KPI progress:', error);
    throw error;
  }
});

// POST /api/kpis/assign - Assign KPI to staff (manager only)
router.post('/assign', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can assign KPIs');
    }

    const { staffId, kpiId } = req.body;

    if (!staffId || !kpiId) {
      throw new HttpError(400, 'Missing required fields: staffId, kpiId');
    }

    // Check if KPI exists and belongs to this restaurant
    const kpiResult = await pool.query(
      'SELECT * FROM kpis WHERE id = $1 AND restaurant_id = $2',
      [kpiId, req.restaurantId]
    );

    if (kpiResult.rows.length === 0) {
      throw new HttpError(404, 'KPI not found or access denied');
    }

    // Check if staff exists and belongs to this restaurant
    const staffResult = await pool.query(
      'SELECT * FROM staff WHERE id = $1 AND restaurant_id = $2',
      [staffId, req.restaurantId]
    );

    if (staffResult.rows.length === 0) {
      throw new HttpError(404, 'Staff member not found or access denied');
    }

    // Update KPI to include this staff member
    const result = await pool.query(
      `UPDATE kpis 
       SET assigned_staff_ids = array_append(COALESCE(assigned_staff_ids, '{}'), $1)
       WHERE id = $2 AND restaurant_id = $3
       RETURNING *`,
      [staffId, kpiId, req.restaurantId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error assigning KPI:', error);
    throw error;
  }
});

// DELETE /api/kpis/unassign - Unassign KPI from staff (manager only)
router.delete('/unassign', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can unassign KPIs');
    }

    const { staffId, kpiId } = req.body;

    if (!staffId || !kpiId) {
      throw new HttpError(400, 'Missing required fields: staffId, kpiId');
    }

    // Check if KPI exists and belongs to this restaurant
    const kpiResult = await pool.query(
      'SELECT * FROM kpis WHERE id = $1 AND restaurant_id = $2',
      [kpiId, req.restaurantId]
    );

    if (kpiResult.rows.length === 0) {
      throw new HttpError(404, 'KPI not found or access denied');
    }

    // Update KPI to remove this staff member
    const result = await pool.query(
      `UPDATE kpis 
       SET assigned_staff_ids = array_remove(COALESCE(assigned_staff_ids, '{}'), $1)
       WHERE id = $2 AND restaurant_id = $3
       RETURNING *`,
      [staffId, kpiId, req.restaurantId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error unassigning KPI:', error);
    throw error;
  }
});

// DELETE /api/kpis/:id - Delete a KPI (manager only)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can delete KPIs');
    }

    const { id } = req.params;
    const kpiId = parseInt(id, 10);

    if (isNaN(kpiId)) {
      throw new HttpError(400, 'Invalid KPI ID');
    }

    // Start transaction
    await client.query('BEGIN');

    // First check if KPI exists and belongs to this restaurant
    const checkResult = await client.query(
      'SELECT id FROM kpis WHERE id = $1 AND restaurant_id = $2',
      [kpiId, req.restaurantId]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new HttpError(404, 'KPI not found or access denied');
    }

    // Delete progress records first
    await client.query('DELETE FROM staff_kpi_progress WHERE kpi_id = $1', [kpiId]);
    
    // Then delete the KPI
    await client.query('DELETE FROM kpis WHERE id = $1', [kpiId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting KPI:', error);
    throw error;
  } finally {
    client.release();
  }
});

export default router;