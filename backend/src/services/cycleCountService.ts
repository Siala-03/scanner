import { pool } from '../db.js';
import { emitInventoryUpdate } from '../socket.js';

export interface CycleCount {
  id: string;
  restaurantId: string;
  locationId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate: string;
  completedDate?: string;
  countedBy?: string;
  varianceNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CycleCountItem {
  id: string;
  cycleCountId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  systemQty: number;
  countedQty?: number;
  variance?: number;
  varianceReason?: string;
  countedBy?: string;
  countedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

// Create a new cycle count
export async function createCycleCount(
  restaurantId: string,
  scheduledDate: string,
  locationId?: string
): Promise<CycleCount> {
  const id = `cycle_${Date.now().toString(36)}`;
  
  const result = await pool.query(`
    INSERT INTO cycle_counts
      (id, restaurant_id, location_id, scheduled_date, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING *
  `, [id, restaurantId, locationId || null, scheduledDate]);

  const row = result.rows[0];
  
  // If location specified, only create items for that location, otherwise create for main warehouse
  const locId = locationId || `loc_default_${restaurantId}`;

  // Get all inventory items
  const itemsResult = await pool.query(`
    SELECT ist.id, ist.inventory_item_id, ist.quantity, ist.location_id
    FROM inventory_stock ist
    WHERE ist.restaurant_id = $1 AND ist.location_id = $2
  `, [restaurantId, locId]);

  // Create cycle count items
  for (const item of itemsResult.rows) {
    const itemId = `cycle_item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(`
      INSERT INTO cycle_count_items
        (id, cycle_count_id, inventory_item_id, location_id, system_qty)
      VALUES ($1, $2, $3, $4, $5)
    `, [itemId, id, item.inventory_item_id, item.location_id, item.quantity]);
  }

  emitInventoryUpdate({ type: 'cycle_count_created', cycleCountId: id });

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    locationId: row.location_id,
    status: row.status,
    scheduledDate: row.scheduled_date,
    completedDate: row.completed_date,
    countedBy: row.counted_by,
    varianceNotes: row.variance_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Get cycle count by ID
export async function getCycleCount(
  cycleCountId: string,
  restaurantId: string
): Promise<{ cycle: CycleCount; items: CycleCountItem[] } | null> {
  const result = await pool.query(`
    SELECT * FROM cycle_counts
    WHERE id = $1 AND restaurant_id = $2
  `, [cycleCountId, restaurantId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Get items for this cycle count
  const itemsResult = await pool.query(`
    SELECT 
      cci.*,
      ii.name as inventory_item_name
    FROM cycle_count_items cci
    LEFT JOIN inventory_items ii ON ii.id = cci.inventory_item_id
    WHERE cci.cycle_count_id = $1
    ORDER BY ii.name ASC
  `, [cycleCountId]);

  return {
    cycle: {
      id: row.id,
      restaurantId: row.restaurant_id,
      locationId: row.location_id,
      status: row.status,
      scheduledDate: row.scheduled_date,
      completedDate: row.completed_date,
      countedBy: row.counted_by,
      varianceNotes: row.variance_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    items: itemsResult.rows.map(item => ({
      id: item.id,
      cycleCountId: item.cycle_count_id,
      inventoryItemId: item.inventory_item_id,
      inventoryItemName: item.inventory_item_name,
      locationId: item.location_id,
      systemQty: item.system_qty,
      countedQty: item.counted_qty,
      variance: item.variance,
      varianceReason: item.variance_reason,
      countedBy: item.counted_by,
      countedAt: item.counted_at,
      verifiedBy: item.verified_by,
      verifiedAt: item.verified_at,
    })),
  };
}

// List cycle counts
export async function listCycleCount(
  restaurantId: string,
  status?: string
): Promise<CycleCount[]> {
  const query = status
    ? `SELECT * FROM cycle_counts WHERE restaurant_id = $1 AND status = $2 ORDER BY scheduled_date DESC`
    : `SELECT * FROM cycle_counts WHERE restaurant_id = $1 ORDER BY scheduled_date DESC`;
  
  const params = status ? [restaurantId, status] : [restaurantId];
  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    locationId: row.location_id,
    status: row.status,
    scheduledDate: row.scheduled_date,
    completedDate: row.completed_date,
    countedBy: row.counted_by,
    varianceNotes: row.variance_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// Record count for a cycle count item
export async function recordCycleCount(
  cycleCountItemId: string,
  countedQty: number,
  countedBy: string,
  varianceReason?: string
): Promise<CycleCountItem | null> {
  const variance = countedQty - (await pool.query(`SELECT system_qty FROM cycle_count_items WHERE id = $1`, [cycleCountItemId])).rows[0]?.system_qty || 0;

  const result = await pool.query(`
    UPDATE cycle_count_items
    SET 
      counted_qty = $1,
      variance = $2,
      variance_reason = $3,
      counted_by = $4,
      counted_at = NOW()
    WHERE id = $5
    RETURNING *
  `, [countedQty, variance, varianceReason || null, countedBy, cycleCountItemId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Get inventory item name
  const itemResult = await pool.query(`
    SELECT name FROM inventory_items WHERE id = $1
  `, [row.inventory_item_id]);

  return {
    id: row.id,
    cycleCountId: row.cycle_count_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: itemResult.rows[0]?.name || '',
    locationId: row.location_id,
    systemQty: row.system_qty,
    countedQty: row.counted_qty,
    variance: row.variance,
    varianceReason: row.variance_reason,
    countedBy: row.counted_by,
    countedAt: row.counted_at,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
  };
}

// Complete cycle count and update inventory
export async function completeCycleCount(
  cycleCountId: string,
  restaurantId: string,
  completedBy: string,
  varianceNotes?: string
): Promise<CycleCount> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get all items in the cycle count
    const itemsResult = await client.query(`
      SELECT * FROM cycle_count_items WHERE cycle_count_id = $1
    `, [cycleCountId]);

    // Update inventory based on variances
    for (const item of itemsResult.rows) {
      if (item.counted_qty === null || item.variance === null) {
        throw new Error(`Item ${item.inventory_item_id} not fully counted`);
      }

      if (item.variance !== 0) {
        // Update inventory stock
        await client.query(`
          UPDATE inventory_stock
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE inventory_item_id = $2 AND location_id = $3
        `, [item.variance, item.inventory_item_id, item.location_id]);

        // Record movement
        const movementId = `mov_${Date.now().toString(36)}`;
        await client.query(`
          INSERT INTO stock_movements_enhanced
            (id, restaurant_id, inventory_item_id, from_location_id,
             movement_type, quantity, quantity_before, quantity_after, performed_by, notes)
          VALUES ($1, $2, $3, $4, 'count_variance', $5, $6, $7, $8, $9)
        `, [
          movementId,
          restaurantId,
          item.inventory_item_id,
          item.location_id,
          item.variance,
          item.system_qty,
          item.counted_qty,
          completedBy,
          `Cycle count variance: ${item.variance_reason || 'unspecified'}`,
        ]);
      }
    }

    // Update cycle count status
    const result = await client.query(`
      UPDATE cycle_counts
      SET status = 'completed', completed_date = NOW(), counted_by = $1, variance_notes = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [completedBy, varianceNotes || null, cycleCountId]);

    await client.query('COMMIT');

    emitInventoryUpdate({ type: 'cycle_count_completed', cycleCountId });

    const row = result.rows[0];
    return {
      id: row.id,
      restaurantId: row.restaurant_id,
      locationId: row.location_id,
      status: row.status,
      scheduledDate: row.scheduled_date,
      completedDate: row.completed_date,
      countedBy: row.counted_by,
      varianceNotes: row.variance_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Cancel a cycle count
export async function cancelCycleCount(
  cycleCountId: string,
  restaurantId: string
): Promise<CycleCount | null> {
  const result = await pool.query(`
    UPDATE cycle_counts
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1 AND restaurant_id = $2
    RETURNING *
  `, [cycleCountId, restaurantId]);

  if (result.rows.length === 0) return null;

  emitInventoryUpdate({ type: 'cycle_count_cancelled', cycleCountId });

  const row = result.rows[0];
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    locationId: row.location_id,
    status: row.status,
    scheduledDate: row.scheduled_date,
    completedDate: row.completed_date,
    countedBy: row.counted_by,
    varianceNotes: row.variance_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
