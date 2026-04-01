import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool, withClient } from '../db.js';
import { HttpError } from '../http.js';

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
    const body = SupplierSignUpSchema.parse(req.body);

    const existingEmail = await pool.query(
      'SELECT id FROM supplier_users WHERE email = $1',
      [body.email]
    );

    if (existingEmail.rows.length > 0) {
      throw new HttpError(409, 'Email already registered');
    }

    const supplierCheck = await pool.query(
      'SELECT id, name FROM suppliers WHERE id = $1 AND is_active = true',
      [body.supplierId]
    );

    if (supplierCheck.rows.length === 0) {
      throw new HttpError(404, 'Supplier not found or inactive');
    }

    const hash = await bcrypt.hash(body.password, 10);
    const id = `supuser_${Date.now().toString(36)}`;

    await pool.query(
      `INSERT INTO supplier_users (id, supplier_id, email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, body.supplierId, body.email, hash, body.name, body.phone || null]
    );

    res.status(201).json({
      id,
      supplierId: body.supplierId,
      supplierName: supplierCheck.rows[0].name,
      email: body.email,
      name: body.name,
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
    const [userId] = token.split(':');

    const result = await pool.query(
      `SELECT su.id, su.supplier_id, su.email, su.name, su.phone, s.name as supplier_name
       FROM supplier_users su
       JOIN suppliers s ON su.supplier_id = s.id
       WHERE su.id = $1 AND su.is_active = true`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(401, 'Invalid token');
    }

    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});
