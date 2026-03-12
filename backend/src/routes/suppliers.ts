import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';

const router = Router();

// GET all suppliers
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM suppliers WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// GET single supplier
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM suppliers WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Supplier not found');
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching supplier:', error);
      res.status(500).json({ error: 'Failed to fetch supplier' });
    }
  }
});

// POST create new supplier
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      contact_person,
      email,
      phone,
      address,
      categories = [],
      lead_time_days = 7,
      payment_terms = 'Net 30',
      rating = 3,
      notes
    } = req.body;

    const id = `sup_${Date.now().toString(36)}`;
    
    const result = await pool.query(
      `INSERT INTO suppliers 
        (id, name, contact_person, email, phone, address, categories, lead_time_days, payment_terms, rating, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, name, contact_person, email, phone, address, categories, lead_time_days, payment_terms, rating, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT update supplier
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      contact_person,
      email,
      phone,
      address,
      categories,
      lead_time_days,
      payment_terms,
      rating,
      is_active,
      notes
    } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (contact_person !== undefined) { updates.push(`contact_person = $${paramIndex++}`); values.push(contact_person); }
    if (email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(email); }
    if (phone !== undefined) { updates.push(`phone = $${paramIndex++}`); values.push(phone); }
    if (address !== undefined) { updates.push(`address = $${paramIndex++}`); values.push(address); }
    if (categories !== undefined) { updates.push(`categories = $${paramIndex++}`); values.push(categories); }
    if (lead_time_days !== undefined) { updates.push(`lead_time_days = $${paramIndex++}`); values.push(lead_time_days); }
    if (payment_terms !== undefined) { updates.push(`payment_terms = $${paramIndex++}`); values.push(payment_terms); }
    if (rating !== undefined) { updates.push(`rating = $${paramIndex++}`); values.push(rating); }
    if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
    if (notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(notes); }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());
    values.push(id);

    const result = await pool.query(
      `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Supplier not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating supplier:', error);
      res.status(500).json({ error: 'Failed to update supplier' });
    }
  }
});

// DELETE (soft delete) supplier
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE suppliers SET is_active = false, updated_at = $1 WHERE id = $2',
      [new Date().toISOString(), id]
    );
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

export const suppliersRouter = router;
