import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../http.js';

export interface AuthenticatedRequest extends Request {
  staffId?: string;
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

    // Verify the staff member exists in Supabase
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

    if (!response.ok) {
      throw new HttpError(401, 'Authentication failed');
    }

    const rows: any[] = await response.json();
    if (!rows.length) {
      throw new HttpError(401, 'Invalid authentication');
    }

    req.staffId = rows[0].id;
    req.staffRole = rows[0].role;
    req.restaurantId = rows[0].restaurant_id;

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
