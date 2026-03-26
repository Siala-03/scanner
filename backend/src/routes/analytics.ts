import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET comprehensive revenue analytics
router.get('/revenue', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = 'month', date_from, date_to, group_by = 'day' } = req.query;

    let dateFilter = '';
    const params: any[] = [req.restaurantId];

    if (date_from && date_to) {
      dateFilter = 'AND o.created_at >= $2 AND o.created_at <= $3';
      params.push(date_from, date_to);
    } else {
      // Default to last 30 days
      dateFilter = 'AND o.created_at >= NOW() - INTERVAL \'30 days\'';
    }

    let groupByClause = '';
    let selectFields = '';

    switch (group_by) {
      case 'hour':
        groupByClause = 'DATE_TRUNC(\'hour\', o.created_at)';
        selectFields = 'DATE_TRUNC(\'hour\', o.created_at) as period, EXTRACT(hour FROM o.created_at) as hour';
        break;
      case 'day':
        groupByClause = 'DATE(o.created_at)';
        selectFields = 'DATE(o.created_at) as period';
        break;
      case 'week':
        groupByClause = 'DATE_TRUNC(\'week\', o.created_at)';
        selectFields = 'DATE_TRUNC(\'week\', o.created_at) as period';
        break;
      case 'month':
        groupByClause = 'DATE_TRUNC(\'month\', o.created_at)';
        selectFields = 'DATE_TRUNC(\'month\', o.created_at) as period';
        break;
      default:
        groupByClause = 'DATE(o.created_at)';
        selectFields = 'DATE(o.created_at) as period';
    }

    const query = `
      SELECT
        ${selectFields},
        COUNT(DISTINCT o.id) as total_orders,
        SUM(o.total) as total_revenue,
        AVG(o.total) as avg_order_value,
        COUNT(DISTINCT CASE WHEN o.customer_id IS NOT NULL THEN o.customer_id END) as unique_customers,
        SUM(CASE WHEN o.status = 'served' THEN 1 ELSE 0 END) as completed_orders,
        AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) as avg_prep_time_minutes
      FROM orders o
      WHERE o.restaurant_id = $1 ${dateFilter}
      GROUP BY ${groupByClause}
      ORDER BY period DESC
    `;

    const result = await pool.query(query, params);

    // Calculate growth rates and trends
    const data = result.rows.map((row, index, arr) => {
      const prev = arr[index + 1]; // Previous period (array is DESC ordered)
      const revenueGrowth = prev ? ((row.total_revenue - prev.total_revenue) / prev.total_revenue * 100) : 0;
      const orderGrowth = prev ? ((row.total_orders - prev.total_orders) / prev.total_orders * 100) : 0;

      return {
        ...row,
        revenue_growth: Math.round(revenueGrowth * 100) / 100,
        order_growth: Math.round(orderGrowth * 100) / 100,
        period: row.period.toISOString().split('T')[0],
        hour: row.hour || null
      };
    });

    res.json(data);
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// GET customer insights and segmentation
router.get('/customer-insights', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { segment, min_orders = '1' } = req.query;

    // First, ensure customer analytics are up to date
    await pool.query(`
      INSERT INTO customer_analytics (
        id, restaurant_id, customer_identifier, total_orders, total_spent,
        avg_order_value, last_order_date, first_order_date, favorite_items,
        order_frequency_days, customer_segment
      )
      SELECT
        COALESCE(c.id, 'anon_' || ROW_NUMBER() OVER (ORDER BY SUM(o.total) DESC)) as id,
        $1 as restaurant_id,
        COALESCE(c.phone, c.email, 'anonymous') as customer_identifier,
        COUNT(o.id) as total_orders,
        SUM(o.total) as total_spent,
        ROUND(AVG(o.total)) as avg_order_value,
        MAX(o.created_at) as last_order_date,
        MIN(o.created_at) as first_order_date,
        (
          SELECT jsonb_agg(jsonb_build_object('item', mi.name, 'count', COUNT(*)))
          FROM order_items oi
          JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE oi.order_id = o.id
          GROUP BY mi.name
          ORDER BY COUNT(*) DESC
          LIMIT 3
        ) as favorite_items,
        CASE
          WHEN COUNT(o.id) > 1 THEN
            EXTRACT(day FROM (MAX(o.created_at) - MIN(o.created_at))) / NULLIF(COUNT(o.id) - 1, 0)
          ELSE NULL
        END as order_frequency_days,
        CASE
          WHEN SUM(o.total) > 100000 THEN 'vip'  -- $1000+
          WHEN COUNT(o.id) > 20 THEN 'regular'
          WHEN MAX(o.created_at) < NOW() - INTERVAL '60 days' THEN 'at_risk'
          ELSE 'new'
        END as customer_segment
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.restaurant_id = $1 AND o.status = 'served'
      GROUP BY c.id, c.phone, c.email
      HAVING COUNT(o.id) >= $2
      ON CONFLICT (id) DO UPDATE SET
        total_orders = EXCLUDED.total_orders,
        total_spent = EXCLUDED.total_spent,
        avg_order_value = EXCLUDED.avg_order_value,
        last_order_date = EXCLUDED.last_order_date,
        favorite_items = EXCLUDED.favorite_items,
        order_frequency_days = EXCLUDED.order_frequency_days,
        customer_segment = EXCLUDED.customer_segment,
        updated_at = NOW()
    `, [req.restaurantId, parseInt(min_orders as string)]);

    // Now fetch the analytics
    let query = `
      SELECT
        *,
        CASE
          WHEN total_spent > 0 THEN ROUND(total_spent::numeric / total_orders, 2)
          ELSE 0
        END as lifetime_value,
        CASE
          WHEN first_order_date IS NOT NULL THEN
            EXTRACT(day FROM (NOW() - first_order_date))
          ELSE 0
        END as customer_age_days
      FROM customer_analytics
      WHERE restaurant_id = $1
    `;

    const params: any[] = [req.restaurantId];

    if (segment && segment !== 'all') {
      query += ' AND customer_segment = $2';
      params.push(segment);
    }

    query += ' ORDER BY total_spent DESC LIMIT 100';

    const result = await pool.query(query, params);

    // Calculate segment distribution
    const segmentQuery = `
      SELECT
        customer_segment,
        COUNT(*) as count,
        SUM(total_spent) as total_revenue,
        AVG(total_spent) as avg_spent,
        AVG(total_orders) as avg_orders
      FROM customer_analytics
      WHERE restaurant_id = $1
      GROUP BY customer_segment
      ORDER BY total_revenue DESC
    `;

    const segmentResult = await pool.query(segmentQuery, [req.restaurantId]);

    res.json({
      customers: result.rows,
      segments: segmentResult.rows,
      summary: {
        total_customers: result.rows.length,
        total_revenue: result.rows.reduce((sum, c) => sum + parseInt(c.total_spent), 0),
        avg_lifetime_value: result.rows.length > 0 ?
          result.rows.reduce((sum, c) => sum + parseInt(c.total_spent), 0) / result.rows.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching customer insights:', error);
    res.status(500).json({ error: 'Failed to fetch customer insights' });
  }
});

// GET operational efficiency metrics
router.get('/operational-efficiency', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query;

    let dateFilter = '';
    const params: any[] = [req.restaurantId];

    if (date_from && date_to) {
      dateFilter = 'AND o.created_at >= $2 AND o.created_at <= $3';
      params.push(date_from, date_to);
    } else {
      dateFilter = 'AND o.created_at >= NOW() - INTERVAL \'30 days\'';
    }

    // Order processing times
    const processingQuery = `
      SELECT
        DATE(o.created_at) as date,
        AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) as avg_prep_time,
        MIN(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) as min_prep_time,
        MAX(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) as max_prep_time,
        COUNT(*) as total_orders
      FROM orders o
      WHERE o.restaurant_id = $1 ${dateFilter} AND o.status = 'served'
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
    `;

    // Table utilization
    const tableQuery = `
      SELECT
        DATE(o.created_at) as date,
        COUNT(DISTINCT o.table_number) as tables_used,
        AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/3600) as avg_table_occupation_hours,
        COUNT(*) as total_orders
      FROM orders o
      WHERE o.restaurant_id = $1 ${dateFilter}
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
    `;

    // Staff performance
    const staffQuery = `
      SELECT
        s.name as staff_name,
        s.role,
        COUNT(o.id) as orders_served,
        SUM(o.total) as revenue_generated,
        AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) as avg_service_time
      FROM staff s
      LEFT JOIN orders o ON s.id = o.created_by AND o.restaurant_id = $1 ${dateFilter}
      WHERE s.restaurant_id = $1
      GROUP BY s.id, s.name, s.role
      ORDER BY revenue_generated DESC
    `;

    const [processingResult, tableResult, staffResult] = await Promise.all([
      pool.query(processingQuery, params),
      pool.query(tableQuery, params),
      pool.query(staffQuery, params)
    ]);

    res.json({
      processing_times: processingResult.rows,
      table_utilization: tableResult.rows,
      staff_performance: staffResult.rows,
      kpis: {
        avg_prep_time: processingResult.rows.reduce((sum, row) => sum + parseFloat(row.avg_prep_time), 0) / processingResult.rows.length,
        total_tables_used: tableResult.rows.reduce((sum, row) => sum + parseInt(row.tables_used), 0),
        top_performer: staffResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching operational efficiency:', error);
    res.status(500).json({ error: 'Failed to fetch operational efficiency metrics' });
  }
});

// GET predictive insights
router.get('/predictive-insights', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;

    // Generate demand forecast based on historical data
    const demandQuery = `
      SELECT
        EXTRACT(dow FROM created_at) as day_of_week,
        EXTRACT(hour FROM created_at) as hour,
        COUNT(*) as order_count,
        AVG(total) as avg_revenue
      FROM orders
      WHERE restaurant_id = $1
        AND created_at >= NOW() - INTERVAL '90 days'
        AND status = 'served'
      GROUP BY EXTRACT(dow FROM created_at), EXTRACT(hour FROM created_at)
      ORDER BY day_of_week, hour
    `;

    const demandResult = await pool.query(demandQuery, [restaurantId]);

    // Calculate peak hours and busy periods
    const peakHours = demandResult.rows
      .filter(row => parseInt(row.order_count) > 5) // Threshold for "busy"
      .sort((a, b) => parseInt(b.order_count) - parseInt(a.order_count))
      .slice(0, 10);

    // Revenue forecasting (simple linear trend)
    const revenueQuery = `
      SELECT
        DATE(created_at) as date,
        SUM(total) as daily_revenue,
        COUNT(*) as daily_orders
      FROM orders
      WHERE restaurant_id = $1
        AND created_at >= NOW() - INTERVAL '60 days'
        AND status = 'served'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const revenueResult = await pool.query(revenueQuery, [restaurantId]);

    // Simple linear regression for forecasting
    const revenueData = revenueResult.rows.map((row, index) => ({
      day: index,
      revenue: parseInt(row.daily_revenue),
      orders: parseInt(row.daily_orders)
    }));

    const n = revenueData.length;
    const sumX = revenueData.reduce((sum, d) => sum + d.day, 0);
    const sumY = revenueData.reduce((sum, d) => sum + d.revenue, 0);
    const sumXY = revenueData.reduce((sum, d) => sum + d.day * d.revenue, 0);
    const sumXX = revenueData.reduce((sum, d) => sum + d.day * d.day, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Forecast next 7 days
    const forecast = [];
    for (let i = 0; i < 7; i++) {
      const predictedRevenue = slope * (n + i) + intercept;
      forecast.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        predicted_revenue: Math.max(0, Math.round(predictedRevenue)),
        confidence: Math.max(0.1, 1 - (i * 0.1)) // Decreasing confidence
      });
    }

    res.json({
      demand_patterns: {
        peak_hours: peakHours,
        busy_periods: demandResult.rows.filter(row => parseInt(row.order_count) > 3)
      },
      revenue_forecast: {
        historical: revenueResult.rows,
        forecast: forecast,
        trend: {
          slope: Math.round(slope * 100) / 100,
          direction: slope > 0 ? 'increasing' : 'decreasing'
        }
      },
      recommendations: {
        staffing: peakHours.length > 0 ? 'Consider additional staff during peak hours' : 'Staffing levels appear adequate',
        inventory: 'Monitor inventory levels during forecasted high-demand periods',
        marketing: slope > 0 ? 'Continue current marketing strategies' : 'Consider promotional campaigns to boost revenue'
      }
    });
  } catch (error) {
    console.error('Error generating predictive insights:', error);
    res.status(500).json({ error: 'Failed to generate predictive insights' });
  }
});

// GET comprehensive dashboard data
router.get('/dashboard', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;

    // Today's metrics
    const todayQuery = `
      SELECT
        COUNT(*) as total_orders,
        SUM(total) as total_revenue,
        AVG(total) as avg_order_value,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM orders
      WHERE restaurant_id = $1
        AND DATE(created_at) = CURRENT_DATE
        AND status = 'served'
    `;

    // Yesterday comparison
    const yesterdayQuery = `
      SELECT
        COUNT(*) as total_orders,
        SUM(total) as total_revenue,
        AVG(total) as avg_order_value,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM orders
      WHERE restaurant_id = $1
        AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'
        AND status = 'served'
    `;

    // Weekly trend
    const weeklyQuery = `
      SELECT
        DATE(created_at) as date,
        SUM(total) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE restaurant_id = $1
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND status = 'served'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    // Top items
    const topItemsQuery = `
      SELECT
        mi.name,
        mi.category,
        COUNT(oi.id) as order_count,
        SUM(oi.total_price) as revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.restaurant_id = $1
        AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND o.status = 'served'
      GROUP BY mi.id, mi.name, mi.category
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // Customer segments
    const segmentsQuery = `
      SELECT
        CASE
          WHEN c.total_spent > 100000 THEN 'VIP'
          WHEN c.total_orders > 20 THEN 'Regular'
          WHEN c.last_order_date < NOW() - INTERVAL '60 days' THEN 'At Risk'
          ELSE 'New'
        END as segment,
        COUNT(*) as count
      FROM customer_analytics c
      WHERE c.restaurant_id = $1
      GROUP BY segment
    `;

    const [todayResult, yesterdayResult, weeklyResult, topItemsResult, segmentsResult] = await Promise.all([
      pool.query(todayQuery, [restaurantId]),
      pool.query(yesterdayQuery, [restaurantId]),
      pool.query(weeklyQuery, [restaurantId]),
      pool.query(topItemsQuery, [restaurantId]),
      pool.query(segmentsQuery, [restaurantId])
    ]);

    const today = todayResult.rows[0] || { total_orders: 0, total_revenue: 0, avg_order_value: 0, unique_customers: 0 };
    const yesterday = yesterdayResult.rows[0] || { total_orders: 0, total_revenue: 0, avg_order_value: 0, unique_customers: 0 };

    const revenueChange = yesterday.total_revenue > 0 ?
      ((today.total_revenue - yesterday.total_revenue) / yesterday.total_revenue * 100) : 0;
    const ordersChange = yesterday.total_orders > 0 ?
      ((today.total_orders - yesterday.total_orders) / yesterday.total_orders * 100) : 0;

    res.json({
      today_metrics: {
        ...today,
        revenue_change: Math.round(revenueChange * 100) / 100,
        orders_change: Math.round(ordersChange * 100) / 100
      },
      weekly_trend: weeklyResult.rows,
      top_items: topItemsResult.rows,
      customer_segments: segmentsResult.rows,
      alerts: [], // Could be populated from analytics_alerts table
      recommendations: [
        revenueChange < -10 ? 'Revenue is down significantly. Consider promotions.' : null,
        ordersChange < -10 ? 'Order volume decreased. Check operational issues.' : null,
        today.unique_customers < 10 ? 'Low customer traffic today. Consider marketing campaigns.' : null
      ].filter(Boolean)
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
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