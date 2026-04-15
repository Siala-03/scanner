import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { toCamelCase } from '../utils/camelCase.js';

const router = Router();

// GET /api/loyalty/customers - Get all customers (staff only)
router.get('/customers', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const result = await pool.query(`
      SELECT id, phone, email, name, total_points, total_spent, join_date, last_visit, visit_count
      FROM customers
      WHERE restaurant_id = $1
      ORDER BY last_visit DESC NULLS LAST, join_date DESC
    `, [restaurantId]);

    res.json(toCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/loyalty/customers - Create or find customer
router.post('/customers', async (req, res) => {
  const { phone, email, name, restaurantId } = req.body;

  if (!phone && !email) {
    return res.status(400).json({ error: 'Phone or email is required' });
  }
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  try {
    // Try to find existing customer
    let customer;
    if (phone) {
      const result = await pool.query(
        'SELECT * FROM customers WHERE phone = $1 AND restaurant_id = $2',
        [phone, restaurantId]
      );
      customer = toCamelCase(result.rows[0]);
    }

    if (!customer && email) {
      const result = await pool.query(
        'SELECT * FROM customers WHERE email = $1 AND restaurant_id = $2',
        [email, restaurantId]
      );
      customer = toCamelCase(result.rows[0]);
    }

    // Create new customer if not found
    if (!customer) {
      const customerId = `cust-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const result = await pool.query(`
        INSERT INTO customers (id, phone, email, name, restaurant_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [customerId, phone, email, name, restaurantId]);
      customer = toCamelCase(result.rows[0]);
    }

    res.json(customer);
  } catch (error) {
    console.error('Error creating/finding customer:', error);
    res.status(500).json({ error: 'Failed to create/find customer' });
  }
});

// GET /api/loyalty/customers/:id - Get customer details with transactions
// Accessible from customer-facing UI (no staff auth required); restaurantId comes from query param
router.get('/customers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const restaurantId = (req.query.restaurantId as string) || (req as AuthenticatedRequest).restaurantId;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

  try {
    // Get customer
    const customerResult = await pool.query(`
      SELECT id, phone, email, name, total_points, total_spent, join_date, last_visit, visit_count
      FROM customers
      WHERE id = $1 AND restaurant_id = $2
    `, [id, restaurantId]);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    // Get recent transactions
    const transactionsResult = await pool.query(`
      SELECT id, order_id, transaction_type, points, description, created_at
      FROM loyalty_transactions
      WHERE customer_id = $1 AND restaurant_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `, [id, restaurantId]);

    // Get available rewards
    const rewardsResult = await pool.query(`
      SELECT id, name, description, points_required, reward_type, discount_percentage, free_item_id
      FROM rewards
      WHERE is_active = true AND restaurant_id = $1 AND points_required <= $2
      ORDER BY points_required ASC
    `, [restaurantId, customer.total_points]);

    res.json({
      customer: toCamelCase(customer),
      recentTransactions: toCamelCase(transactionsResult.rows),
      availableRewards: toCamelCase(rewardsResult.rows)
    });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// POST /api/loyalty/points/earn - Award points to customer
router.post('/points/earn', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { customerId, orderId, points, description } = req.body;
  const restaurantId = req.restaurantId;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

  if (!customerId || !points || points <= 0) {
    return res.status(400).json({ error: 'Customer ID and positive points required' });
  }

  try {
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert transaction
      const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await client.query(`
        INSERT INTO loyalty_transactions (id, customer_id, order_id, transaction_type, points, description, restaurant_id)
        VALUES ($1, $2, $3, 'earned', $4, $5, $6)
      `, [transactionId, customerId, orderId, points, description, restaurantId]);

      // Update customer points and visit info
      await client.query(`
        UPDATE customers
        SET
          total_points = total_points + $1,
          last_visit = now(),
          visit_count = visit_count + 1,
          updated_at = now()
        WHERE id = $2 AND restaurant_id = $3
      `, [points, customerId, restaurantId]);

      await client.query('COMMIT');

      res.json({ success: true, transactionId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error awarding points:', error);
    res.status(500).json({ error: 'Failed to award points' });
  }
});

// POST /api/loyalty/rewards/redeem - Redeem a reward
router.post('/rewards/redeem', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { customerId, rewardId, orderId } = req.body;

  if (!customerId || !rewardId) {
    return res.status(400).json({ error: 'Customer ID and reward ID required' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get reward details
      const restaurantId = req.restaurantId;
      if (!restaurantId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'restaurantId is required' }); }
      const rewardResult = await client.query(`
        SELECT * FROM rewards
        WHERE id = $1 AND restaurant_id = $2 AND is_active = true
      `, [rewardId, restaurantId]);

      if (rewardResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Reward not found or inactive' });
      }

      const reward = rewardResult.rows[0];

      // Check customer points
      const customerResult = await client.query(`
        SELECT total_points FROM customers
        WHERE id = $1 AND restaurant_id = $2
      `, [customerId, restaurantId]);

      if (customerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer not found' });
      }

      const customer = customerResult.rows[0];
      if (customer.total_points < reward.points_required) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient points' });
      }

      // Create redemption record
      const redemptionId = `red-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await client.query(`
        INSERT INTO reward_redemptions (id, customer_id, reward_id, order_id, points_used, restaurant_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [redemptionId, customerId, rewardId, orderId, reward.points_required, restaurantId]);

      // Deduct points
      await client.query(`
        UPDATE customers
        SET total_points = total_points - $1, updated_at = now()
        WHERE id = $2 AND restaurant_id = $3
      `, [reward.points_required, customerId, restaurantId]);

      // Record transaction
      const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await client.query(`
        INSERT INTO loyalty_transactions (id, customer_id, order_id, transaction_type, points, description, restaurant_id)
        VALUES ($1, $2, $3, 'redeemed', $4, $5, $6)
      `, [transactionId, customerId, orderId, -reward.points_required, `Redeemed: ${reward.name}`, restaurantId]);

      await client.query('COMMIT');

      res.json({
        success: true,
        redemptionId,
        reward,
        remainingPoints: customer.total_points - reward.points_required
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error redeeming reward:', error);
    res.status(500).json({ error: 'Failed to redeem reward' });
  }
});

// GET /api/loyalty/rewards - Get all active rewards
router.get('/rewards', async (req, res) => {
  const restaurantId = req.query.restaurantId as string;
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required' });
  }
  try {
    const result = await pool.query(`
      SELECT id, name, description, points_required, reward_type, discount_percentage, free_item_id
      FROM rewards
      WHERE is_active = true AND restaurant_id = $1
      ORDER BY points_required ASC
    `, [restaurantId]);

    res.json(toCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching rewards:', error);
    res.status(500).json({ error: 'Failed to fetch rewards' });
  }
});

// POST /api/loyalty/rewards - Create new reward (staff only)
router.post('/rewards', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { name, description, pointsRequired, rewardType, discountPercentage, freeItemId } = req.body;

  if (!name || !pointsRequired || !rewardType) {
    return res.status(400).json({ error: 'Name, points required, and reward type are required' });
  }

  try {
    const rewardId = `reward-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const result = await pool.query(`
      INSERT INTO rewards (id, name, description, points_required, reward_type, discount_percentage, free_item_id, restaurant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [rewardId, name, description, pointsRequired, rewardType, discountPercentage, freeItemId, req.restaurantId]);

    res.json(toCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating reward:', error);
    res.status(500).json({ error: 'Failed to create reward' });
  }
});

export const loyaltyRouter = router;