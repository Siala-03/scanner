import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET customer analytics
router.get('/customers', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { segment, limit = '50' } = req.query;

    let query = `
      SELECT
        customer_identifier,
        total_orders,
        total_spent,
        avg_order_value,
        last_order_date,
        first_order_date,
        favorite_items,
        order_frequency_days,
        customer_segment,
        CASE
          WHEN last_order_date < NOW() - INTERVAL '30 days' THEN 'at_risk'
          WHEN total_spent > 50000 THEN 'vip'  -- $500+
          WHEN total_orders > 10 THEN 'regular'
          ELSE 'new'
        END as calculated_segment
      FROM customer_analytics
      WHERE restaurant_id = $1
    `;

    const params: any[] = [req.restaurantId];
    const conditions: string[] = [];

    if (segment && segment !== 'all') {
      conditions.push('customer_segment = $' + (params.length + 1));
      params.push(segment);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY total_spent DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit as string));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// GET staff performance analytics
router.get('/staff-performance', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, staff_id } = req.query;

    let query = `
      SELECT
        spa.*,
        s.name as staff_name,
        s.role as staff_role
      FROM staff_performance_analytics spa
      JOIN staff s ON spa.staff_id = s.id
      WHERE spa.restaurant_id = $1
    `;

    const params: any[] = [req.restaurantId];
    const conditions: string[] = [];

    if (date_from) {
      conditions.push('spa.date >= $' + (params.length + 1));
      params.push(date_from);
    }

    if (date_to) {
      conditions.push('spa.date <= $' + (params.length + 1));
      params.push(date_to);
    }

    if (staff_id) {
      conditions.push('spa.staff_id = $' + (params.length + 1));
      params.push(staff_id);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY spa.date DESC, spa.efficiency_score DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching staff performance analytics:', error);
    res.status(500).json({ error: 'Failed to fetch staff performance analytics' });
  }
});

// GET operational metrics
router.get('/operational', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, metric_type } = req.query;

    let query = 'SELECT * FROM operational_metrics WHERE restaurant_id = $1';
    const params: any[] = [req.restaurantId];
    const conditions: string[] = [];

    if (date_from) {
      conditions.push('date >= $' + (params.length + 1));
      params.push(date_from);
    }

    if (date_to) {
      conditions.push('date <= $' + (params.length + 1));
      params.push(date_to);
    }

    if (metric_type) {
      conditions.push('metric_type = $' + (params.length + 1));
      params.push(metric_type);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date DESC, metric_type';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching operational metrics:', error);
    res.status(500).json({ error: 'Failed to fetch operational metrics' });
  }
});

// GET predictive analytics
router.get('/predictive', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prediction_type } = req.query;

    let query = 'SELECT * FROM predictive_analytics WHERE restaurant_id = $1';
    const params: any[] = [req.restaurantId];

    if (prediction_type) {
      query += ' AND prediction_type = $2';
      params.push(prediction_type);
    }

    query += ' ORDER BY prediction_date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching predictive analytics:', error);
    res.status(500).json({ error: 'Failed to fetch predictive analytics' });
  }
});

// POST update operational metrics (called by background job)
router.post('/operational/batch', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { metrics } = req.body;

    if (!Array.isArray(metrics)) {
      throw new HttpError(400, 'Metrics must be an array');
    }

    const values = metrics.map(m => `('${m.id || 'metric_' + Date.now()}', '${req.restaurantId}', '${m.date}', '${m.metric_type}', '${m.metric_name}', ${m.metric_value}, ${m.target_value || 'NULL'}, '${m.unit || 'count'}', NOW())`);

    await pool.query(`
      INSERT INTO operational_metrics (id, restaurant_id, date, metric_type, metric_name, metric_value, target_value, unit, created_at)
      VALUES ${values.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        target_value = EXCLUDED.target_value,
        updated_at = NOW()
    `);

    res.json({ success: true, count: metrics.length });
  } catch (error) {
    console.error('Error updating operational metrics:', error);
    res.status(500).json({ error: 'Failed to update operational metrics' });
  }
});

// GET analytics alerts
router.get('/alerts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM analytics_alerts WHERE restaurant_id = $1 AND is_active = true ORDER BY severity DESC, created_at DESC',
      [req.restaurantId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching analytics alerts:', error);
    res.status(500).json({ error: 'Failed to fetch analytics alerts' });
  }
});

export const analyticsRouter = router;