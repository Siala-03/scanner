import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Middleware to check if user is superadmin
const requireSuperadmin = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (req.staffRole !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
};

// GET all restaurants (superadmin only)
router.get('/', authenticate, requireSuperadmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, address, phone, email, timezone, currency, is_active, subscription_status, created_at FROM restaurants ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    res.status(500).json({ error: 'Failed to fetch restaurants' });
  }
});

// GET single restaurant
router.get('/:restaurantId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // Superadmin can see all, managers only their own
    if (req.staffRole !== 'superadmin' && req.restaurantId !== restaurantId) {
      throw new HttpError(403, 'Access denied');
    }

    const result = await pool.query(
      'SELECT id, name, address, phone, email, timezone, currency, is_active, subscription_status, created_at FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Restaurant not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching restaurant:', error);
      res.status(500).json({ error: 'Failed to fetch restaurant' });
    }
  }
});

// POST create new restaurant (superadmin only)
router.post('/', authenticate, requireSuperadmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      address,
      phone,
      email,
      timezone = 'UTC',
      currency = 'USD',
      managerName,
      managerEmail,
      managerPhone,
      managerUsername,
      managerPassword
    } = req.body;

    if (!managerName || !managerEmail || !managerUsername || !managerPassword) {
      throw new HttpError(400, 'Manager details are required');
    }

    const restaurantId = `restaurant_${Date.now().toString(36)}`;
    const managerId = `manager_${Date.now().toString(36)}`;

    await pool.query('BEGIN');

    try {
      // Create restaurant
      const restaurantResult = await pool.query(
        `INSERT INTO restaurants
          (id, name, address, phone, email, timezone, currency, is_active, subscription_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'trial')
         RETURNING id, name, address, phone, email, timezone, currency, is_active, subscription_status, created_at`,
        [restaurantId, name, address, phone, email, timezone, currency]
      );

      // Create manager account
      const hash = await bcrypt.hash(managerPassword, 10);

      await pool.query(
        `INSERT INTO staff
          (id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)`,
        [managerId, managerName, 'manager', managerEmail, managerPhone, true, '{}', '{}', restaurantId]
      );

      await pool.query(
        `INSERT INTO staff_credentials (staff_id, username, password_hash, restaurant_id)
         VALUES ($1, $2, $3, $4)`,
        [managerId, managerUsername, hash, restaurantId]
      );

      await pool.query('COMMIT');

      res.status(201).json({
        restaurant: restaurantResult.rows[0],
        manager: {
          id: managerId,
          name: managerName,
          email: managerEmail,
          username: managerUsername,
          role: 'manager'
        }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error creating restaurant:', error);
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create restaurant' });
    }
  }
});

// PUT update restaurant
router.put('/:restaurantId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // Superadmin can update all, managers only their own
    if (req.staffRole !== 'superadmin' && req.restaurantId !== restaurantId) {
      throw new HttpError(403, 'Access denied');
    }

    const {
      name,
      address,
      phone,
      email,
      timezone,
      currency,
      is_active,
      subscription_status
    } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(address);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(timezone);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${paramIndex++}`);
      values.push(currency);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (subscription_status !== undefined) {
      updates.push(`subscription_status = $${paramIndex++}`);
      values.push(subscription_status);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());
    values.push(restaurantId);

    const result = await pool.query(
      `UPDATE restaurants SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, address, phone, email, timezone, currency, is_active, subscription_status, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Restaurant not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating restaurant:', error);
      res.status(500).json({ error: 'Failed to update restaurant' });
    }
  }
});

// DELETE restaurant (superadmin only, with cascade)
router.delete('/:restaurantId', authenticate, requireSuperadmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // Prevent deleting the default restaurant
    if (restaurantId === 'default_restaurant') {
      throw new HttpError(400, 'Cannot delete default restaurant');
    }

    await pool.query('DELETE FROM restaurants WHERE id = $1', [restaurantId]);
    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error deleting restaurant:', error);
      res.status(500).json({ error: 'Failed to delete restaurant' });
    }
  }
});

export const restaurantsRouter = router;