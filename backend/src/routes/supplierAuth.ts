import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, withClient } from '../db.js';
import { HttpError } from '../http.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';

export const supplierAuthRouter = Router();

const SupplierLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const SupplierSignUpSchema = z.object({
  supplierId: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  phone: z.string().optional(),
});

const ManagerProvisionSchema = z.object({
  supplierId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
});

function generatePassword(length = 12): string {
  // URL-safe generated password, manager can share directly with supplier.
  return crypto.randomBytes(Math.max(8, length)).toString('base64url').slice(0, length);
}

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

supplierAuthRouter.post('/login', async (req: Request, res: Response, next) => {
  try {
    const body = SupplierLoginSchema.parse(req.body);

    const result = await pool.query(
      `SELECT su.*, s.name as supplier_name, s.is_active as supplier_is_active
       FROM supplier_users su
       JOIN suppliers s ON su.supplier_id = s.id
       WHERE su.email = $1`,
      [body.email]
    );

    if (result.rows.length === 0) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const user = result.rows[0];

    if (!user.supplier_is_active) {
      throw new HttpError(403, 'Supplier account is deactivated');
    }

    if (!user.is_active) {
      throw new HttpError(403, 'Account is deactivated');
    }

    const validPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!validPassword) {
      throw new HttpError(401, 'Invalid email or password');
    }

    res.json({
      id: user.id,
      supplierId: user.supplier_id,
      supplierName: user.supplier_name,
      email: user.email,
      name: user.name,
      phone: user.phone,
    });
  } catch (e) {
    next(e);
  }
});

supplierAuthRouter.post('/signup', async (req: Request, res: Response, next) => {
  try {
    SupplierSignUpSchema.parse(req.body);
    throw new HttpError(403, 'Supplier self-signup is disabled. Ask your company manager for portal credentials.');
  } catch (e) {
    next(e);
  }
});

supplierAuthRouter.post('/manager-access', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!['manager', 'superadmin'].includes(req.staffRole || '')) {
      throw new HttpError(403, 'Only managers can provision supplier access');
    }

    const body = ManagerProvisionSchema.parse(req.body);

    const supplierCheck = await pool.query(
      `SELECT id, name, restaurant_id
       FROM suppliers
       WHERE id = $1 AND is_active = true`,
      [body.supplierId]
    );

    if (supplierCheck.rows.length === 0) {
      throw new HttpError(404, 'Supplier not found or inactive');
    }

    const supplier = supplierCheck.rows[0];
    if (req.staffRole !== 'superadmin' && supplier.restaurant_id && req.restaurantId && supplier.restaurant_id !== req.restaurantId) {
      throw new HttpError(403, 'You can only provision suppliers for your company');
    }

    const existingByEmail = await pool.query(
      'SELECT id, supplier_id FROM supplier_users WHERE email = $1 LIMIT 1',
      [body.email]
    );
    if (existingByEmail.rows.length > 0 && existingByEmail.rows[0].supplier_id !== body.supplierId) {
      throw new HttpError(409, 'Email is already used by another supplier account');
    }

    const existingBySupplier = await pool.query(
      `SELECT id FROM supplier_users WHERE supplier_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [body.supplierId]
    );

    const plainPassword = body.password || generatePassword();
    const hash = await bcrypt.hash(plainPassword, 10);
    const now = new Date().toISOString();
    let userId: string;
    let isNew = false;

    if (existingBySupplier.rows.length > 0) {
      userId = existingBySupplier.rows[0].id;
      await pool.query(
        `UPDATE supplier_users
         SET email = $1,
             password_hash = $2,
             name = $3,
             phone = $4,
             is_active = true,
             updated_at = $5
         WHERE id = $6`,
        [body.email, hash, body.name, body.phone || null, now, userId]
      );
    } else {
      userId = `supuser_${Date.now().toString(36)}`;
      isNew = true;
      await pool.query(
        `INSERT INTO supplier_users (id, supplier_id, email, password_hash, name, phone, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)`,
        [userId, body.supplierId, body.email, hash, body.name, body.phone || null, now]
      );
    }

    res.json({
      id: userId,
      supplierId: body.supplierId,
      supplierName: supplier.name,
      email: body.email,
      name: body.name,
      phone: body.phone || null,
      password: plainPassword,
      isNew,
    });
  } catch (e) {
    next(e);
  }
});

supplierAuthRouter.get('/manager-access/:supplierId', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!['manager', 'superadmin'].includes(req.staffRole || '')) {
      throw new HttpError(403, 'Only managers can view supplier access');
    }

    const { supplierId } = req.params;

    const supplierCheck = await pool.query(
      `SELECT id, name, restaurant_id
       FROM suppliers
       WHERE id = $1`,
      [supplierId]
    );
    if (supplierCheck.rows.length === 0) {
      throw new HttpError(404, 'Supplier not found');
    }

    const supplier = supplierCheck.rows[0];
    if (req.staffRole !== 'superadmin' && supplier.restaurant_id && req.restaurantId && supplier.restaurant_id !== req.restaurantId) {
      throw new HttpError(403, 'You can only access suppliers for your company');
    }

    const userRes = await pool.query(
      `SELECT id, supplier_id, email, name, phone, is_active, created_at, updated_at
       FROM supplier_users
       WHERE supplier_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [supplierId]
    );

    if (userRes.rows.length === 0) {
      res.json({ exists: false, supplierId, supplierName: supplier.name });
      return;
    }

    const row = userRes.rows[0];
    res.json({
      exists: true,
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: supplier.name,
      email: row.email,
      name: row.name,
      phone: row.phone,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (e) {
    next(e);
  }
});

supplierAuthRouter.get('/me', async (req: Request, res: Response, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization required');
    }

    const token = authHeader.split(' ')[1];
    const { userId, supplierId } = await resolveSupplierIdentityFromToken(token);

    const result = await pool.query(
      `SELECT su.id, su.supplier_id, su.email, su.name, su.phone, s.name as supplier_name
       FROM supplier_users su
       JOIN suppliers s ON su.supplier_id = s.id
       WHERE su.id = $1 AND su.supplier_id = $2 AND su.is_active = true`,
      [userId, supplierId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(401, 'Invalid token');
    }

    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});
