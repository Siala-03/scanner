import { Router, Response } from 'express';
import { pool } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { rowsToCamelCase, toCamelCase } from '../utils/camelCase.js';

const router = Router();

function scheduleId(): string {
  return `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// GET /api/schedules?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const { startDate, endDate, staffId } = req.query;
    const params: unknown[] = [restaurantId];
    const conditions = ['s.restaurant_id = $1'];

    if (startDate) { params.push(startDate); conditions.push(`s.shift_date >= $${params.length}`); }
    if (endDate)   { params.push(endDate);   conditions.push(`s.shift_date <= $${params.length}`); }
    if (staffId)   { params.push(staffId);   conditions.push(`s.staff_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT s.*, st.name AS staff_name, st.role AS staff_role
       FROM staff_schedules s
       LEFT JOIN staff st ON st.id = s.staff_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.shift_date ASC, s.start_time ASC`,
      params
    );
    res.json(rowsToCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// POST /api/schedules
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const { staffId, shiftDate, startTime, endTime, role, notes } = req.body;
    if (!staffId || !shiftDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'staffId, shiftDate, startTime, endTime are required' });
    }

    const id = scheduleId();
    const result = await pool.query(
      `INSERT INTO staff_schedules (id, restaurant_id, staff_id, shift_date, start_time, end_time, role, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, restaurantId, staffId, shiftDate, startTime, endTime, role || null, notes || null]
    );

    // Join staff name
    const row = result.rows[0];
    const staff = await pool.query('SELECT name, role FROM staff WHERE id = $1', [staffId]);
    row.staff_name = staff.rows[0]?.name;
    row.staff_role = staff.rows[0]?.role;

    res.status(201).json(toCamelCase(row));
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PUT /api/schedules/:id
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startTime, endTime, role, notes } = req.body;
    const result = await pool.query(
      `UPDATE staff_schedules
       SET start_time = COALESCE($1, start_time),
           end_time   = COALESCE($2, end_time),
           role       = COALESCE($3, role),
           notes      = COALESCE($4, notes)
       WHERE id = $5
       RETURNING *`,
      [startTime || null, endTime || null, role || null, notes ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Schedule not found' });
    res.json(toCamelCase(result.rows[0]));
  } catch (err) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE /api/schedules/:id
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM staff_schedules WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

export { router as schedulesRouter };
