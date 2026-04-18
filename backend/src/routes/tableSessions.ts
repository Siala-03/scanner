import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

export const tableSessionsRouter = Router();

const PENDING_CLOSE_MINUTES_DEFAULT = 10;

function makeSessionId(restaurantId: string, tableNumber: number): string {
  return `sess-${restaurantId}-${tableNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTableNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function closeExpiredSessions(client: any, restaurantId: string) {
  await client.query(
    `UPDATE table_service_sessions
     SET status = 'closed',
         closed_at = COALESCE(closed_at, NOW()),
         updated_at = NOW()
     WHERE restaurant_id = $1
       AND status = 'pending_close'
       AND pending_close_at IS NOT NULL
       AND pending_close_at <= NOW()`,
    [restaurantId]
  );
}

async function fetchLatestSession(client: any, restaurantId: string, tableNumber: number) {
  const result = await client.query(
    `SELECT *
     FROM table_service_sessions
     WHERE restaurant_id = $1 AND table_number = $2
     ORDER BY started_at DESC
     LIMIT 1`,
    [restaurantId, tableNumber]
  );
  return result.rows[0] ?? null;
}

tableSessionsRouter.get('/current', async (req: Request, res: Response) => {
  const restaurantId = String(req.query.restaurantId || '').trim();
  const tableNumber = parseTableNumber(req.query.tableNumber);

  if (!restaurantId || tableNumber == null) {
    return res.status(400).json({ error: 'restaurantId and tableNumber are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await closeExpiredSessions(client, restaurantId);
    const latest = await fetchLatestSession(client, restaurantId, tableNumber);
    await client.query('COMMIT');

    if (!latest || latest.status === 'closed') {
      return res.json({ session: null });
    }

    return res.json({ session: latest });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fetching table session:', error);
    return res.status(500).json({ error: 'Failed to fetch table session' });
  } finally {
    client.release();
  }
});

tableSessionsRouter.post('/activity', async (req: Request, res: Response) => {
  const restaurantId = String(req.body?.restaurantId || '').trim();
  const tableNumber = parseTableNumber(req.body?.tableNumber);

  if (!restaurantId || tableNumber == null) {
    return res.status(400).json({ error: 'restaurantId and tableNumber are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await closeExpiredSessions(client, restaurantId);
    const latest = await fetchLatestSession(client, restaurantId, tableNumber);

    let session;
    if (!latest || latest.status === 'closed') {
      const created = await client.query(
        `INSERT INTO table_service_sessions
          (id, restaurant_id, table_number, status, started_at, last_activity_at, updated_at)
         VALUES ($1, $2, $3, 'active', NOW(), NOW(), NOW())
         RETURNING *`,
        [makeSessionId(restaurantId, tableNumber), restaurantId, tableNumber]
      );
      session = created.rows[0];
    } else {
      const updated = await client.query(
        `UPDATE table_service_sessions
         SET status = 'active',
             last_activity_at = NOW(),
             pending_close_at = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [latest.id]
      );
      session = updated.rows[0];
    }

    await client.query('COMMIT');
    return res.json({ session });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording table session activity:', error);
    return res.status(500).json({ error: 'Failed to update table session activity' });
  } finally {
    client.release();
  }
});

tableSessionsRouter.post('/receipt-printed', async (req: Request, res: Response) => {
  const restaurantId = String(req.body?.restaurantId || '').trim();
  const tableNumber = parseTableNumber(req.body?.tableNumber);
  const pendingCloseMinutesRaw = Number(req.body?.pendingCloseMinutes ?? PENDING_CLOSE_MINUTES_DEFAULT);
  const pendingCloseMinutes =
    Number.isFinite(pendingCloseMinutesRaw) && pendingCloseMinutesRaw > 0
      ? Math.floor(pendingCloseMinutesRaw)
      : PENDING_CLOSE_MINUTES_DEFAULT;

  if (!restaurantId || tableNumber == null) {
    return res.status(400).json({ error: 'restaurantId and tableNumber are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await closeExpiredSessions(client, restaurantId);
    const latest = await fetchLatestSession(client, restaurantId, tableNumber);

    let sessionId = latest?.id;
    if (!latest || latest.status === 'closed') {
      const created = await client.query(
        `INSERT INTO table_service_sessions
          (id, restaurant_id, table_number, status, started_at, last_activity_at, updated_at)
         VALUES ($1, $2, $3, 'active', NOW(), NOW(), NOW())
         RETURNING id`,
        [makeSessionId(restaurantId, tableNumber), restaurantId, tableNumber]
      );
      sessionId = created.rows[0].id;
    }

    const updated = await client.query(
      `UPDATE table_service_sessions
       SET status = 'pending_close',
           receipt_printed_at = NOW(),
           pending_close_at = NOW() + make_interval(mins => $2),
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sessionId, pendingCloseMinutes]
    );

    await client.query('COMMIT');
    return res.json({ session: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error setting table session pending close:', error);
    return res.status(500).json({ error: 'Failed to set pending close for table session' });
  } finally {
    client.release();
  }
});
