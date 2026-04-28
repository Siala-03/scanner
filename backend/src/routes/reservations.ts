import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { rowsToCamelCase, toCamelCase } from '../utils/camelCase.js';
import { notifyReservationConfirmed } from '../services/notificationService.js';

const router = Router();

function reservationId(): string {
  return `rsv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// GET reservations for a restaurant (manager/supervisor/waiter)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const { date, status } = req.query;
    const params: unknown[] = [restaurantId];
    const conditions: string[] = ['restaurant_id = $1'];

    if (date) {
      params.push(date as string);
      conditions.push(`reservation_date = $${params.length}`);
    }
    if (status) {
      params.push(status as string);
      conditions.push(`status = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT * FROM reservations WHERE ${conditions.join(' AND ')} ORDER BY reservation_date ASC, reservation_time ASC`,
      params
    );
    res.json(rowsToCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

// GET availability for a date (public)
router.get('/availability', async (req: Request, res: Response) => {
  try {
    const { restaurantId, date } = req.query;
    if (!restaurantId || !date) {
      return res.status(400).json({ error: 'restaurantId and date are required' });
    }

    const result = await pool.query(
      `SELECT table_number, reservation_time, duration_minutes, party_size, status
       FROM reservations
       WHERE restaurant_id = $1 AND reservation_date = $2 AND status NOT IN ('cancelled', 'no_show')
       ORDER BY reservation_time ASC`,
      [restaurantId, date]
    );
    res.json(rowsToCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// POST create reservation (public — customers can book directly)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      restaurantId, customerName, customerPhone, customerEmail,
      partySize, reservationDate, reservationTime, durationMinutes, tableNumber, notes
    } = req.body;

    if (!restaurantId || !customerName || !customerPhone || !partySize || !reservationDate || !reservationTime) {
      return res.status(400).json({
        error: 'restaurantId, customerName, customerPhone, partySize, reservationDate, reservationTime are required'
      });
    }

    const id = reservationId();
    const result = await pool.query(
      `INSERT INTO reservations
         (id, restaurant_id, table_number, customer_name, customer_phone, customer_email,
          party_size, reservation_date, reservation_time, duration_minutes, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, restaurantId, tableNumber || null, customerName, customerPhone, customerEmail || null,
       partySize, reservationDate, reservationTime, durationMinutes || 90, notes || null]
    );

    res.status(201).json(toCamelCase(result.rows[0]));
  } catch (err) {
    console.error('Error creating reservation:', err);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

// PUT update reservation status or assign table (manager/waiter)
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    const { id } = req.params;
    const { status, tableNumber, notes } = req.body;

    const result = await pool.query(
      `UPDATE reservations SET
         status = COALESCE($1, status),
         table_number = COALESCE($2, table_number),
         notes = COALESCE($3, notes),
         updated_at = now()
       WHERE id = $4 AND restaurant_id = $5
       RETURNING *`,
      [status || null, tableNumber ?? null, notes ?? null, id, restaurantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = toCamelCase(result.rows[0]);

    // Send SMS when manager confirms a reservation
    if (status === 'confirmed') {
      notifyReservationConfirmed(
        reservation.customerPhone,
        reservation.customerName,
        reservation.reservationDate,
        reservation.reservationTime,
        reservation.tableNumber
      ).catch(() => {});
    }

    res.json(reservation);
  } catch (err) {
    console.error('Error updating reservation:', err);
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

// DELETE cancel reservation (manager)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE reservations SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
      [id, restaurantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json({ message: 'Reservation cancelled' });
  } catch (err) {
    console.error('Error cancelling reservation:', err);
    res.status(500).json({ error: 'Failed to cancel reservation' });
  }
});

export { router as reservationsRouter };
