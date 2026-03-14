import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withClient } from '../db.js';
import { HttpError } from '../http.js';

export const authRouter = Router();

const SignUpSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(3),
  role: z.enum(['waiter', 'supervisor', 'manager', 'kitchen']),
  username: z.string().min(3),
  password: z.string().min(6)
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

// POST login
authRouter.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    
    const staff = await withClient(async (client) => {
      const credResult = await client.query(
        `SELECT sc.staff_id, sc.username, sc.password_hash 
         FROM staff_credentials sc 
         WHERE sc.username = $1`,
        [body.username]
      );
      
      if (credResult.rows.length === 0) {
        throw new HttpError(401, 'Invalid username or password');
      }
      
      const cred = credResult.rows[0];
      const validPassword = await bcrypt.compare(body.password, cred.password_hash);
      
      if (!validPassword) {
        throw new HttpError(401, 'Invalid username or password');
      }
      
      const staffResult = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date 
         FROM staff WHERE id = $1`,
        [cred.staff_id]
      );
      
      if (staffResult.rows.length === 0) {
        throw new HttpError(401, 'User not found');
      }
      
      const row = staffResult.rows[0];
      return {
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date
      };
    });
    
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/signup', async (req, res, next) => {
  try {
    const body = SignUpSchema.parse(req.body);

    const staff = await withClient(async (client) => {
      // Check if username exists
      const existing = await client.query(
        `select 1 from staff_credentials where username = $1`,
        [body.username]
      );
      if (existing.rowCount) {
        throw new HttpError(409, 'Username already taken');
      }

      // Check if email exists
      const existingEmail = await client.query(
        `select 1 from staff where email = $1`,
        [body.email]
      );
      if (existingEmail.rowCount) {
        throw new HttpError(409, 'Email already registered');
      }

      const hash = await bcrypt.hash(body.password, 10);
      const id = `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await client.query('begin');
      try {
        const staffRes = await client.query(
          `insert into staff
             (id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date)
           values
             ($1,$2,$3,$4,$5,$6,$7,$8,now())
           returning id, name, role, email, phone, is_on_duty as "isOnDuty", assigned_tables as "assignedTables", performance, hire_date as "hireDate"`,
          [id, body.name, body.role, body.email, body.phone, true, '{}', '{}']
        );

        await client.query(
          `insert into staff_credentials (staff_id, username, password_hash)
           values ($1,$2,$3)`,
          [id, body.username, hash]
        );

        await client.query('commit');

        const row = staffRes.rows[0];
        return {
          id: row.id,
          name: row.name,
          role: row.role,
          email: row.email,
          phone: row.phone,
          isOnDuty: row.isOnDuty,
          assignedTables: row.assignedTables ?? [],
          performance: row.performance,
          hireDate: row.hireDate
        };
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
    });

    res.status(201).json({ staff });
  } catch (e) {
    next(e);
  }
});

// GET all staff
authRouter.get('/staff', async (_req, res, next) => {
  try {
    const staff = await withClient(async (client) => {
      const result = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date 
         FROM staff ORDER BY name`
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date
      }));
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

// GET staff by ID
authRouter.get('/staff/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const staff = await withClient(async (client) => {
      const result = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date 
         FROM staff WHERE id = $1`,
        [id]
      );
      if (result.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date
      };
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

// GET waiters only
authRouter.get('/waiters', async (_req, res, next) => {
  try {
    const staff = await withClient(async (client) => {
      const result = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date 
         FROM staff WHERE role = 'waiter' ORDER BY name`
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date
      }));
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

