import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { rowsToCamelCase, toCamelCase } from '../utils/camelCase.js';

const router = Router();

function reviewId(): string {
  return `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// GET /api/reviews?rating=5&limit=50
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const { rating, waiterId, limit = '100' } = req.query;
    const params: unknown[] = [restaurantId];
    const conditions = ['r.restaurant_id = $1'];

    if (rating)   { params.push(Number(rating));  conditions.push(`r.rating = $${params.length}`); }
    if (waiterId) { params.push(waiterId);         conditions.push(`r.waiter_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT r.*, st.name AS waiter_name
       FROM reviews r
       LEFT JOIN staff st ON st.id = r.waiter_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, Number(limit)]
    );
    res.json(rowsToCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/stats
router.get('/stats', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const [totals, distribution] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total,
                ROUND(AVG(rating)::numeric, 1) AS avg_rating,
                COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS this_month
         FROM reviews WHERE restaurant_id = $1`,
        [restaurantId]
      ),
      pool.query(
        `SELECT rating, COUNT(*) AS count
         FROM reviews WHERE restaurant_id = $1
         GROUP BY rating ORDER BY rating DESC`,
        [restaurantId]
      ),
    ]);

    const row = totals.rows[0];
    res.json({
      total: Number(row.total),
      avgRating: row.avg_rating ? Number(row.avg_rating) : null,
      thisMonth: Number(row.this_month),
      distribution: distribution.rows.map((r) => ({ rating: Number(r.rating), count: Number(r.count) })),
    });
  } catch (err) {
    console.error('Error fetching review stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// POST /api/reviews  (public — submitted by customers)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, tableNumber, rating, comment, customerName, waiterId } = req.body;
    if (!restaurantId || !rating) {
      return res.status(400).json({ error: 'restaurantId and rating are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const id = reviewId();
    const result = await pool.query(
      `INSERT INTO reviews (id, restaurant_id, order_id, table_number, rating, comment, customer_name, waiter_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, restaurantId, orderId || null, tableNumber || null, rating, comment || null, customerName || null, waiterId || null]
    );
    res.status(201).json(toCamelCase(result.rows[0]));
  } catch (err) {
    console.error('Error creating review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

export { router as reviewsRouter };
