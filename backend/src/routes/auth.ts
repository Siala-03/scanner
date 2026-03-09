import { Router } from 'express';
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

authRouter.post('/signup', async (req, res, next) => {
  try {
    const body = SignUpSchema.parse(req.body);

    const staff = await withClient(async (client) => {
      const existing = await client.query(
        `select 1 from staff_credentials where username = $1`,
        [body.username]
      );
      if (existing.rowCount) {
        throw new HttpError(409, 'Username already taken');
      }

      const hash = await bcrypt.hash(body.password, 10);
      const id = `staff-${Date.now()}`;

      await client.query('begin');
      try {
        const staffRes = await client.query(
          `insert into staff
             (id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date)
           values
             ($1,$2,$3,$4,$5,true,$6,$7,now())
           returning id, name, role, email, phone, is_on_duty as "isOnDuty",
                     assigned_tables as "assignedTables", performance, hire_date as "hireDate"`,
          [
            id,
            body.name,
            body.role,
            body.email,
            body.phone,
            [],
            {
              ordersServed: 0,
              avgServiceTime: 0,
              rating: 5,
              totalRevenue: 0,
              shiftsThisWeek: 0
            }
          ]
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

