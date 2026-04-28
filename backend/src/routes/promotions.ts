import { Router, Response } from 'express';
import { pool } from '../db.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { rowsToCamelCase, toCamelCase } from '../utils/camelCase.js';

const router = Router();

function promoId(): string {
  return `promo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// GET all promotions for a restaurant (manager/supervisor)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const result = await pool.query(
      'SELECT * FROM promotions WHERE restaurant_id = $1 ORDER BY created_at DESC',
      [restaurantId]
    );
    res.json(rowsToCamelCase(result.rows));
  } catch (err) {
    console.error('Error fetching promotions:', err);
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

// POST validate promo code (public — called from customer cart before placing order)
router.post('/validate', async (req, res: Response) => {
  try {
    const { code, restaurantId, orderSubtotal } = req.body;
    if (!code || !restaurantId) {
      return res.status(400).json({ error: 'code and restaurantId are required' });
    }

    const result = await pool.query(
      `SELECT * FROM promotions
       WHERE restaurant_id = $1 AND LOWER(code) = LOWER($2)
         AND is_active = true AND valid_from <= now() AND valid_until >= now()
         AND (max_uses IS NULL OR uses_count < max_uses)`,
      [restaurantId, code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired promo code' });
    }

    const promo = toCamelCase(result.rows[0]);
    const subtotal = orderSubtotal || 0;

    if (subtotal < promo.minOrderAmount) {
      return res.status(400).json({
        error: `Minimum order amount is ${promo.minOrderAmount} RWF for this promotion`
      });
    }

    let discountAmount = 0;
    if (promo.type === 'percentage') {
      discountAmount = Math.round((subtotal * promo.discountValue) / 100);
    } else {
      discountAmount = Math.min(promo.discountValue, subtotal);
    }

    res.json({ promotion: promo, discountAmount });
  } catch (err) {
    console.error('Error validating promo code:', err);
    res.status(500).json({ error: 'Failed to validate promo code' });
  }
});

// POST create promotion (manager)
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    const { name, code, type, discountValue, minOrderAmount, maxUses, validFrom, validUntil } = req.body;

    if (!name || !code || !type || discountValue == null || !validFrom || !validUntil) {
      return res.status(400).json({ error: 'name, code, type, discountValue, validFrom, validUntil are required' });
    }
    if (!['percentage', 'fixed'].includes(type)) {
      return res.status(400).json({ error: 'type must be percentage or fixed' });
    }

    const id = promoId();
    const result = await pool.query(
      `INSERT INTO promotions (id, restaurant_id, name, code, type, discount_value, min_order_amount, max_uses, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, restaurantId, name, code.toUpperCase(), type, discountValue, minOrderAmount || 0, maxUses || null, validFrom, validUntil]
    );
    res.status(201).json(toCamelCase(result.rows[0]));
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'A promotion with this code already exists' });
    }
    console.error('Error creating promotion:', err);
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

// PUT update promotion (manager)
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    const { id } = req.params;
    const { name, code, type, discountValue, minOrderAmount, maxUses, validFrom, validUntil, isActive } = req.body;

    const result = await pool.query(
      `UPDATE promotions SET
         name = COALESCE($1, name),
         code = COALESCE($2, code),
         type = COALESCE($3, type),
         discount_value = COALESCE($4, discount_value),
         min_order_amount = COALESCE($5, min_order_amount),
         max_uses = COALESCE($6, max_uses),
         valid_from = COALESCE($7, valid_from),
         valid_until = COALESCE($8, valid_until),
         is_active = COALESCE($9, is_active)
       WHERE id = $10 AND restaurant_id = $11
       RETURNING *`,
      [name, code ? code.toUpperCase() : null, type, discountValue, minOrderAmount,
       maxUses !== undefined ? maxUses : null, validFrom, validUntil, isActive, id, restaurantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    res.json(toCamelCase(result.rows[0]));
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'A promotion with this code already exists' });
    }
    console.error('Error updating promotion:', err);
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

// DELETE promotion (manager)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const restaurantId = req.restaurantId;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM promotions WHERE id = $1 AND restaurant_id = $2 RETURNING id',
      [id, restaurantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    res.json({ message: 'Promotion deleted' });
  } catch (err) {
    console.error('Error deleting promotion:', err);
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
});

export { router as promotionsRouter };
