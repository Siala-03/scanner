import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../http.js';
import { pool } from '../db.js';

export interface AuthenticatedRequest extends Request {
  staffId?: string;
  staffRole?: string;
}

/**
 * Authentication middleware
 * This is a basic implementation - in production, consider using JWT
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Get staff_id from request header (set by login)
    const staffId = req.headers['x-staff-id'] as string;
    
    if (!staffId) {
      throw new HttpError(401, 'Authentication required');
    }

    // Verify the staff exists
    const result = await pool.query(
      'SELECT id, role FROM staff WHERE id = $1',
      [staffId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(401, 'Invalid authentication');
    }

    req.staffId = result.rows[0].id;
    req.staffRole = result.rows[0].role;
    
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
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
