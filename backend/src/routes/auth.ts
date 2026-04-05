import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { HttpError } from '../http.js';
import { pool, withClient } from '../db.js';
import pg from 'pg';

export const authRouter = Router();

const SignUpSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(3),
  role: z.enum(['waiter', 'supervisor', 'manager', 'kitchen']),
  username: z.string().min(3),
  password: z.string().min(6),
  restaurantId: z.string().optional() // For multi-tenancy
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  restaurantId: z.string().optional() // For multi-tenancy
});

// POST login
authRouter.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    
    const staff = await withClient(async (client: pg.PoolClient) => {
      let credResult;
      
      // First try to find credentials - for superadmin, search across all restaurants
      if (body.restaurantId) {
        credResult = await client.query(
          `SELECT sc.staff_id, sc.password_hash, sc.restaurant_id, s.role
           FROM staff_credentials sc 
           JOIN staff s ON sc.staff_id = s.id
           WHERE sc.username = $1 AND sc.restaurant_id = $2`,
          [body.username, body.restaurantId]
        );
      } else {
        // No restaurantId provided - try to find user, prioritizing superadmin
        credResult = await client.query(
          `SELECT sc.staff_id, sc.password_hash, sc.restaurant_id, s.role
           FROM staff_credentials sc 
           JOIN staff s ON sc.staff_id = s.id
           WHERE sc.username = $1
           ORDER BY CASE WHEN s.role = 'superadmin' THEN 1 ELSE 2 END`,
          [body.username]
        );
      }
      
      if (credResult.rows.length === 0) {
        throw new HttpError(401, 'Invalid username or password');
      }
      
      const cred = credResult.rows[0];
      const validPassword = await bcrypt.compare(body.password, cred.password_hash);
      
      if (!validPassword) {
        throw new HttpError(401, 'Invalid username or password');
      }
      
      const staffResult = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id 
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
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      };
    });
    
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/signup', async (req: AuthenticatedRequest, res: Response, next: any) => {
  try {
    const body = SignUpSchema.parse(req.body);
    
    // Check if authentication header is present
    const staffId = req.headers['x-staff-id'] as string;
    let isAuthenticated = false;
    
    if (staffId) {
      // Verify the staff exists and get role
      const staffResult = await pool.query(
        'SELECT id, role, restaurant_id FROM staff WHERE id = $1',
        [staffId]
      );
      if (staffResult.rows.length > 0) {
        req.staffRole = staffResult.rows[0].role;
        req.restaurantId = staffResult.rows[0].restaurant_id;
        isAuthenticated = true;
      }
    }

    let restaurantId = body.restaurantId || 'default_restaurant';

    // Allow any unauthenticated user to create a manager account (no superadmin required)
    // Managers can self-register without authentication
    if (!isAuthenticated && body.role === 'manager') {
      // Proceed with manager signup without authentication
    } else if (!isAuthenticated) {
      throw new HttpError(403, 'Please authenticate as manager to create an account');
    } else {
      // Authenticated user - must be a manager to create accounts
      if (req.staffRole !== 'manager') {
        throw new HttpError(403, 'Only managers can create staff accounts');
      }

      // Managers can create accounts for their restaurant
      if (body.restaurantId && body.restaurantId !== req.restaurantId) {
        throw new HttpError(403, 'Managers can only create accounts for their restaurant');
      }

      // Managers can create waiter, supervisor, or kitchen staff (not other managers)
      if (!['waiter', 'supervisor', 'kitchen'].includes(body.role)) {
        throw new HttpError(403, 'Managers can only create waiter, supervisor, or kitchen staff');
      }

      restaurantId = req.restaurantId || restaurantId;
      body.restaurantId = restaurantId;
    }


    const staff = await withClient(async (client: pg.PoolClient) => {
      // Check if username exists within this restaurant
      const existingUsername = await client.query(
        `select 1 from staff_credentials where username = $1 and restaurant_id = $2`,
        [body.username, restaurantId]
      );
      if (existingUsername.rowCount) {
        throw new HttpError(409, 'Username already taken in this restaurant');
      }

      // Check if email exists within this restaurant
      const existingEmail = await client.query(
        `select 1 from staff where email = $1 and restaurant_id = $2`,
        [body.email, restaurantId]
      );
      if (existingEmail.rowCount) {
        throw new HttpError(409, 'Email already registered in this restaurant');
      }

      const hash = await bcrypt.hash(body.password, 10);
      const id = `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await client.query('begin');
      try {
        const staffRes = await client.query(
          `insert into staff
             (id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id)
           values
             ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)
           returning id, name, role, email, phone, is_on_duty as "isOnDuty", assigned_tables as "assignedTables", performance, hire_date as "hireDate", restaurant_id`,
          [id, body.name, body.role, body.email, body.phone, true, '{}', '{}', restaurantId]
        );

        await client.query(
          `insert into staff_credentials (staff_id, username, password_hash, restaurant_id)
           values ($1,$2,$3,$4)`,
          [id, body.username, hash, restaurantId]
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
          hireDate: row.hireDate,
          restaurantId: row.restaurant_id
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
authRouter.get('/staff', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const staff = await withClient(async (client: pg.PoolClient) => {
      const query = `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id FROM staff WHERE restaurant_id = $1 ORDER BY name`;
      const params = [req.restaurantId];

      const result = await client.query(query, params);
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      }));
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

// GET staff by ID
authRouter.get('/staff/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const staff = await withClient(async (client: pg.PoolClient) => {
      const result = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id 
         FROM staff WHERE id = $1`,
        [id]
      );
      if (result.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
      const row = result.rows[0];
      if (row.restaurant_id !== req.restaurantId) {
        throw new HttpError(403, 'Unauthorized access to staff member');
      }
      return {
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      };
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6)
});

// PUT change current user's password
authRouter.put('/me/password', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = PasswordChangeSchema.parse(req.body);

    await withClient(async (client: pg.PoolClient) => {
      const credentialResult = await client.query(
        `SELECT sc.password_hash, sc.username, sc.restaurant_id
         FROM staff_credentials sc
         WHERE sc.staff_id = $1 AND sc.restaurant_id = $2`,
        [req.staffId, req.restaurantId]
      );

      if (credentialResult.rows.length === 0) {
        throw new HttpError(404, 'Credentials not found');
      }

      const credential = credentialResult.rows[0];
      const validPassword = await bcrypt.compare(body.currentPassword, credential.password_hash);
      if (!validPassword) {
        throw new HttpError(401, 'Current password is incorrect');
      }

      const newHash = await bcrypt.hash(body.newPassword, 10);
      await client.query(
        `UPDATE staff_credentials SET password_hash = $1 WHERE staff_id = $2 AND restaurant_id = $3`,
        [newHash, req.staffId, req.restaurantId]
      );
    });

    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    next(e);
  }
});

// GET staff on duty
authRouter.get('/staff/on-duty', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const staff = await withClient(async (client: pg.PoolClient) => {
      const result = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id 
         FROM staff WHERE is_on_duty = true ORDER BY name`
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      }));
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

// DELETE staff member (for testing/reset purposes)
authRouter.delete('/staff/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    
    // Only managers can delete staff from their restaurant
    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can delete staff');
    }

    await withClient(async (client: pg.PoolClient) => {
      // First get the staff member's restaurant_id to verify ownership
      const staffCheck = await client.query('SELECT restaurant_id FROM staff WHERE id = $1', [id]);
      if (staffCheck.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
      
      const staffRestaurantId = staffCheck.rows[0].restaurant_id;
      
      // Verify the manager can only delete staff from their own restaurant
      if (req.restaurantId !== staffRestaurantId) {
        throw new HttpError(403, 'Managers can only delete staff from their restaurant');
      }
      
      // First delete credentials
      await client.query('DELETE FROM staff_credentials WHERE staff_id = $1', [id]);
      // Then delete staff
      const result = await client.query('DELETE FROM staff WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
    });

    res.json({ message: 'Staff deleted successfully' });
  } catch (e) {
    next(e);
  }
});

// PUT update staff on-duty status
authRouter.put('/staff/:id/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const { isOnDuty } = req.body;

    if (typeof isOnDuty !== 'boolean') {
      throw new HttpError(400, 'isOnDuty must be true or false');
    }

    if (req.staffRole !== 'manager' && req.staffRole !== 'supervisor') {
      throw new HttpError(403, 'Unauthorized to update staff duty status');
    }

    const staff = await withClient(async (client: pg.PoolClient) => {
      // allow managers/supervisors to update staff in their own restaurant only
      const staffResult = await client.query('SELECT restaurant_id FROM staff WHERE id = $1', [id]);
      if (staffResult.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
      const staffRest = staffResult.rows[0].restaurant_id;
      if (staffRest !== req.restaurantId) {
        throw new HttpError(403, 'Cannot update staff outside your restaurant');
      }

      const result = await client.query(
        `UPDATE staff SET is_on_duty = $1 WHERE id = $2 RETURNING id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id`,
        [isOnDuty, id]
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
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      };
    });

    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

// PUT update staff role
authRouter.put('/staff/:id/role', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['waiter', 'supervisor', 'manager', 'kitchen'].includes(role)) {
      throw new HttpError(400, 'Invalid role');
    }

    if (req.staffRole !== 'manager') {
      throw new HttpError(403, 'Only managers can change staff roles');
    }

    const updatedStaff = await withClient(async (client: pg.PoolClient) => {
      const targetResult = await client.query('SELECT restaurant_id FROM staff WHERE id = $1', [id]);
      if (targetResult.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
      const targetRest = targetResult.rows[0].restaurant_id;

      if (targetRest !== req.restaurantId) {
        throw new HttpError(403, 'Unauthorized to change role for this staff member');
      }

      if (role === 'manager') {
        throw new HttpError(403, 'Cannot assign manager role');
      }

      const result = await client.query(
        `UPDATE staff SET role = $1 WHERE id = $2 RETURNING id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id`,
        [role, id]
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
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      };
    });

    res.json({ staff: updatedStaff });
  } catch (e) {
    next(e);
  }
});

// GET waiters only
authRouter.get('/waiters', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const staff = await withClient(async (client) => {
      const result = await client.query(
        `SELECT id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id FROM staff WHERE role = 'waiter' AND restaurant_id = $1 ORDER BY name`,
        [req.restaurantId]
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        isOnDuty: row.is_on_duty,
        assignedTables: row.assigned_tables ?? [],
        performance: row.performance,
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      }));
    });
    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

authRouter.put('/staff/:id/assignments', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const assignedTables = Array.isArray(req.body.assignedTables)
      ? req.body.assignedTables.map((v: unknown) => Number(v)).filter((n: number) => !Number.isNaN(n))
      : [];

    const staff = await withClient(async (client: pg.PoolClient) => {
      const staffCheck = await client.query('SELECT restaurant_id FROM staff WHERE id = $1', [id]);
      if (staffCheck.rows.length === 0) {
        throw new HttpError(404, 'Staff not found');
      }
      const staffRest = staffCheck.rows[0].restaurant_id;
      if (req.staffRole !== 'manager' || staffRest !== req.restaurantId) {
        throw new HttpError(403, 'Unauthorized to update assignments for this staff member');
      }

      const result = await client.query(
        `UPDATE staff SET assigned_tables = $1 WHERE id = $2 RETURNING id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id`,
        [assignedTables, id]
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
        hireDate: row.hire_date,
        restaurantId: row.restaurant_id
      };
    });

    res.json({ staff });
  } catch (e) {
    next(e);
  }
});

