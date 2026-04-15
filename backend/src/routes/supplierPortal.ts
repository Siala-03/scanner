import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { getIO } from '../socket.js';

export const supplierPortalRouter = Router();

async function resolveSupplierIdentityFromToken(token: string): Promise<{ supplierId: string; userId: string }> {
  const [first, second] = token.split(':');
  if (!first || !second) {
    throw new HttpError(401, 'Invalid token');
  }

  const result = await pool.query(
    `SELECT id, supplier_id
     FROM supplier_users
     WHERE is_active = true
       AND ((id = $1 AND supplier_id = $2) OR (id = $2 AND supplier_id = $1))
     LIMIT 1`,
    [first, second]
  );

  if (result.rows.length === 0) {
    throw new HttpError(401, 'Invalid token');
  }

  return {
    userId: result.rows[0].id,
    supplierId: result.rows[0].supplier_id,
  };
}

function emitToSupplier(supplierId: string, event: string, data: unknown) {
  const io = getIO();
  if (io) {
    io.to(`supplier:${supplierId}`).emit(event, data);
  }
}

function emitToRestaurant(restaurantId: string, event: string, data: unknown) {
  const io = getIO();
  if (io) {
    io.to(`restaurant:${restaurantId}`).emit(event, data);
  }
}

supplierPortalRouter.get('/orders', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization required');
    }

    const token = authHeader.split(' ')[1];
    const { supplierId } = await resolveSupplierIdentityFromToken(token);

    const { status } = req.query;
    let query = `
      SELECT po.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', poh.id,
                   'status', poh.status,
                   'changed_by', poh.changed_by,
                   'changed_by_type', poh.changed_by_type,
                   'notes', poh.notes,
                   'created_at', poh.created_at
                 )
               ) FILTER (WHERE poh.id IS NOT NULL),
               '[]'
             ) as status_history
      FROM purchase_orders po
      LEFT JOIN purchase_order_status_history poh ON po.id = poh.purchase_order_id
      WHERE po.supplier_id = $1
    `;
    const params: unknown[] = [supplierId];

    if (status && status !== 'all') {
      if (status === 'pending') {
        query += ` AND po.status IN ('sent', 'confirmed')`;
      } else if (status === 'active') {
        query += ` AND po.status IN ('confirmed', 'shipped', 'partial')`;
      } else {
        query += ` AND po.status = $${params.length + 1}`;
        params.push(status);
      }
    }

    query += ` GROUP BY po.id ORDER BY po.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching supplier orders:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }
});

supplierPortalRouter.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization required');
    }

    const token = authHeader.split(' ')[1];
    const { supplierId } = await resolveSupplierIdentityFromToken(token);
    const { id } = req.params;

    const result = await pool.query(
      `SELECT po.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', poh.id,
                    'status', poh.status,
                    'changed_by', poh.changed_by,
                    'changed_by_type', poh.changed_by_type,
                    'notes', poh.notes,
                    'created_at', poh.created_at
                  )
                ) FILTER (WHERE poh.id IS NOT NULL),
                '[]'
              ) as status_history
       FROM purchase_orders po
       LEFT JOIN purchase_order_status_history poh ON po.id = poh.purchase_order_id
       WHERE po.id = $1 AND po.supplier_id = $2
       GROUP BY po.id`,
      [id, supplierId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }
});

supplierPortalRouter.post('/orders/:id/confirm', async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization required');
    }

    const token = authHeader.split(' ')[1];
    const { supplierId, userId: supplierUserId } = await resolveSupplierIdentityFromToken(token);
    const { id } = req.params;
    const { notes } = req.body;

    await client.query('BEGIN');

    const poCheck = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND supplier_id = $2',
      [id, supplierId]
    );

    if (poCheck.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const po = poCheck.rows[0];
    if (!['sent', 'draft'].includes(po.status)) {
      throw new HttpError(400, `Cannot confirm order with status: ${po.status}`);
    }

    const newStatus = 'confirmed';
    
    await client.query(
      `UPDATE purchase_orders SET status = $1, updated_at = $2 WHERE id = $3`,
      [newStatus, new Date().toISOString(), id]
    );

    const historyId = `poh_${Date.now().toString(36)}`;
    await client.query(
      `INSERT INTO purchase_order_status_history (id, purchase_order_id, status, changed_by, changed_by_type, notes)
       VALUES ($1, $2, $3, $4, 'supplier', $5)`,
      [historyId, id, newStatus, supplierUserId, notes || null]
    );

    await client.query('COMMIT');

    if (po.restaurant_id) {
      emitToRestaurant(po.restaurant_id, 'purchase-order:status-update', {
        orderId: id,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    const updatedPO = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    res.json(updatedPO.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error confirming order:', error);
      res.status(500).json({ error: 'Failed to confirm order' });
    }
  } finally {
    client.release();
  }
});

supplierPortalRouter.post('/orders/:id/ship', async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization required');
    }

    const token = authHeader.split(' ')[1];
    const { supplierId, userId: supplierUserId } = await resolveSupplierIdentityFromToken(token);
    const { id } = req.params;
    const { carrier, tracking_number, notes } = req.body;

    await client.query('BEGIN');

    const poCheck = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND supplier_id = $2',
      [id, supplierId]
    );

    if (poCheck.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const po = poCheck.rows[0];
    if (po.status !== 'confirmed') {
      throw new HttpError(400, `Cannot ship order with status: ${po.status}`);
    }

    const newStatus = 'shipped';
    const now = new Date().toISOString();
    
    await client.query(
      `UPDATE purchase_orders 
       SET status = $1, shipped_at = $2, shipped_by = $3, carrier = $4, tracking_number = $5, updated_at = $6
       WHERE id = $7`,
      [newStatus, now, supplierUserId, carrier || null, tracking_number || null, now, id]
    );

    const historyId = `poh_${Date.now().toString(36)}`;
    await client.query(
      `INSERT INTO purchase_order_status_history (id, purchase_order_id, status, changed_by, changed_by_type, notes)
       VALUES ($1, $2, $3, $4, 'supplier', $5)`,
      [historyId, id, newStatus, supplierUserId, notes || `Shipped${carrier ? ` via ${carrier}` : ''}${tracking_number ? ` (${tracking_number})` : ''}`]
    );

    await client.query('COMMIT');

    if (po.restaurant_id) {
      emitToRestaurant(po.restaurant_id, 'purchase-order:status-update', {
        orderId: id,
        status: newStatus,
        shippedAt: now,
        carrier,
        trackingNumber: tracking_number,
        updatedAt: now,
      });
    }

    emitToSupplier(supplierId, 'order:shipped', {
      orderId: id,
      shippedAt: now,
    });

    const updatedPO = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    res.json(updatedPO.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error shipping order:', error);
      res.status(500).json({ error: 'Failed to ship order' });
    }
  } finally {
    client.release();
  }
});

supplierPortalRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization required');
    }

    const token = authHeader.split(' ')[1];
    const { supplierId } = await resolveSupplierIdentityFromToken(token);

    const stats = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status IN ('sent', 'confirmed')) as pending_orders,
         COUNT(*) FILTER (WHERE status = 'shipped') as shipped_orders,
         COUNT(*) FILTER (WHERE status = 'received') as completed_orders,
         COUNT(*) FILTER (WHERE status = 'partial') as partial_orders,
         COALESCE(SUM(total_cost) FILTER (WHERE status IN ('sent', 'confirmed', 'shipped', 'partial')), 0) as pending_value,
         COALESCE(SUM(total_cost) FILTER (WHERE status = 'received'), 0) as completed_value
       FROM purchase_orders
       WHERE supplier_id = $1`,
      [supplierId]
    );

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching supplier stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
