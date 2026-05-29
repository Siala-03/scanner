import type { Pool } from 'pg';

function formatDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export class ReceiptCounter {
  constructor(private readonly db: Pool) {}

  async getNext(restaurantId: string, branchId: string, date: Date = new Date()): Promise<number> {
    const day = formatDay(date);

    const result = await this.db.query(
      `INSERT INTO receipt_counters (restaurant_id, branch_id, day, next_val, updated_at)
       VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (restaurant_id, branch_id, day)
       DO UPDATE SET
         next_val = receipt_counters.next_val + 1,
         updated_at = now()
       RETURNING next_val`,
      [restaurantId, branchId, day]
    );

    return Number(result.rows[0].next_val);
  }
}
