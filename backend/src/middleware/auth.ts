import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../http.js';
import { pool } from '../db.js';

export interface AuthenticatedRequest extends Request {
  staffId?: string;
  userId?: string;
  staffRole?: string;
  restaurantId?: string;
}

/**
 * Authentication middleware.
 * Validates the x-staff-id header against Supabase (where all staff data lives).
 */
export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const staffId = req.headers['x-staff-id'] as string;

    if (!staffId) {
      throw new HttpError(401, 'Authentication required');
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new HttpError(500, 'Server misconfiguration: Supabase credentials not set.');
    }

    let authenticated = false;

    // Primary auth path: verify the staff member in Supabase.
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&select=id,role,restaurant_id&limit=1`,
        {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            Accept: 'application/json',
          },
        }
      );

      if (response.ok) {
        const rows = (await response.json()) as Array<{ id: string; role: string; restaurant_id: string }>;
        if (rows.length > 0) {
          req.staffId = rows[0].id;
          req.userId = rows[0].id;
          req.staffRole = rows[0].role;
          req.restaurantId = rows[0].restaurant_id;
          authenticated = true;
        }
      }
    } catch {
      // Fall through to Postgres fallback.
    }

    // Fallback auth path: local Postgres staff table.
    if (!authenticated) {
      const localResult = await pool.query(
        'SELECT id, role, restaurant_id FROM staff WHERE id = $1 LIMIT 1',
        [staffId]
      );

      if (!localResult.rows.length) {
        throw new HttpError(401, 'Invalid authentication');
      }

      const row = localResult.rows[0] as { id: string; role: string; restaurant_id: string };
      req.staffId = row.id;
      req.userId = row.id;
      req.staffRole = row.role;
      req.restaurantId = row.restaurant_id;
    }

    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
    } else {
      next(new HttpError(401, 'Authentication failed'));
    }
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.staffRole) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.staffRole)) {
      next(new HttpError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };
}
