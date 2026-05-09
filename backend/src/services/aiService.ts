import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from '../db.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type SqlRow = Record<string, unknown>;

interface RestaurantProfile {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

interface AiSnapshot {
  restaurant: RestaurantProfile | null;
  inventory: {
    criticalItems: SqlRow[];
    inventorySummary: SqlRow[];
  };
  sales: {
    kpis: SqlRow[];
    topItems: SqlRow[];
    dailyTrend: SqlRow[];
  };
  waste: {
    topWasteItems: SqlRow[];
    wasteReasons: SqlRow[];
  };
  finance: {
    expensesByCategory: SqlRow[];
    pendingExpenses: SqlRow[];
  };
  marketing: {
    promotions: SqlRow[];
  };
  reservations: {
    statusBreakdown: SqlRow[];
    upcoming: SqlRow[];
  };
  customers: {
    loyaltySummary: SqlRow[];
    reviewSummary: SqlRow[];
    recentLowRatings: SqlRow[];
  };
  staffing: {
    staffingSummary: SqlRow[];
    weeklyScheduleCoverage: SqlRow[];
  };
}

export const analyzeRestaurantData = async (restaurantId: string, userPrompt: string) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GEMINI_API_KEY is missing or invalid in the .env file.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Gather comprehensive context so responses cover operations, finance, marketing, and customer signals.
  const [
    restaurant,
    criticalItems,
    inventorySummary,
    salesKpis,
    topSales,
    salesTrend,
    wasteItems,
    wasteReasons,
    expensesByCategory,
    pendingExpenses,
    promotions,
    reservationStatus,
    upcomingReservations,
    loyaltySummary,
    reviewSummary,
    recentLowRatings,
    staffingSummary,
    weeklyScheduleCoverage,
  ] = await Promise.all([
    getRestaurantProfile(restaurantId),
    getInventoryRiskContext(restaurantId),
    getInventorySummaryContext(restaurantId),
    getSalesKpisContext(restaurantId),
    getTopSalesContext(restaurantId),
    getSalesTrendContext(restaurantId),
    getWasteContext(restaurantId),
    getWasteReasonContext(restaurantId),
    getExpenseContext(restaurantId),
    getPendingExpenseContext(restaurantId),
    getPromotionContext(restaurantId),
    getReservationStatusContext(restaurantId),
    getUpcomingReservationsContext(restaurantId),
    getLoyaltyContext(restaurantId),
    getReviewSummaryContext(restaurantId),
    getRecentLowRatingsContext(restaurantId),
    getStaffingSummaryContext(restaurantId),
    getWeeklyScheduleCoverageContext(restaurantId),
  ]);

  const snapshot: AiSnapshot = {
    restaurant,
    inventory: {
      criticalItems,
      inventorySummary,
    },
    sales: {
      kpis: salesKpis,
      topItems: topSales,
      dailyTrend: salesTrend,
    },
    waste: {
      topWasteItems: wasteItems,
      wasteReasons,
    },
    finance: {
      expensesByCategory,
      pendingExpenses,
    },
    marketing: {
      promotions,
    },
    reservations: {
      statusBreakdown: reservationStatus,
      upcoming: upcomingReservations,
    },
    customers: {
      loyaltySummary,
      reviewSummary,
      recentLowRatings,
    },
    staffing: {
      staffingSummary,
      weeklyScheduleCoverage,
    },
  };

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const systemInstruction = buildSystemInstruction(snapshot);

  if (!userPrompt || typeof userPrompt !== 'string') {
    throw new Error('A valid prompt is required.');
  }
  const result = await model.generateContent([systemInstruction, userPrompt]);
  const response = await result.response;

  let answerText: string;
  try {
    answerText = response.text();
  } catch {
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`The AI response was blocked (${finishReason}). Please rephrase your question.`);
    }
    throw new Error('The AI returned an empty response. Please rephrase your question and try again.');
  }

  return {
    answer: answerText,
    suggestedActions: deriveActionsFromContext(snapshot),
    timestamp: new Date()
  };
};

const getRestaurantProfile = async (restaurantId: string): Promise<RestaurantProfile | null> => {
  try {
    const res = await pool.query(
      `
      SELECT id, name, currency, timezone
      FROM restaurants
      WHERE id = $1
      LIMIT 1
      `,
      [restaurantId]
    );

    if (!res.rows.length) {
      return null;
    }

    const row = res.rows[0] as {
      id: string;
      name: string;
      currency: string;
      timezone: string;
    };

    return {
      id: row.id,
      name: row.name,
      currency: row.currency || 'RWF',
      timezone: row.timezone || 'UTC',
    };
  } catch (e) {
    console.warn('AI Context Warning (Restaurant Profile):', getErrorMessage(e));
    return null;
  }
};

const getInventoryRiskContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(`
      SELECT
        mi.name,
        ir.stock,
        ir.low_stock_threshold,
        ir.reorder_point,
        CASE
          WHEN ir.stock <= 0 THEN 'out_of_stock'
          WHEN ir.stock <= COALESCE(ir.low_stock_threshold, 0) THEN 'low_stock'
          WHEN ir.stock <= COALESCE(ir.reorder_point, 0) THEN 'below_reorder'
          ELSE 'ok'
        END AS risk_level
      FROM inventory_records ir
      JOIN menu_items mi ON ir.menu_item_id = mi.id
      WHERE ir.restaurant_id = $1
        AND mi.restaurant_id = $1
        AND (
          ir.stock <= COALESCE(ir.low_stock_threshold, 0)
          OR ir.stock <= COALESCE(ir.reorder_point, 0)
        )
      ORDER BY
        CASE
          WHEN ir.stock <= 0 THEN 1
          WHEN ir.stock <= COALESCE(ir.low_stock_threshold, 0) THEN 2
          ELSE 3
        END,
        ir.stock ASC
      LIMIT 20
    `, [restaurantId]);
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Inventory):', getErrorMessage(e));
    return [];
  }
};

const getInventorySummaryContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE stock <= 0)::int AS out_of_stock_count,
        COUNT(*) FILTER (WHERE stock <= COALESCE(low_stock_threshold, 0))::int AS low_stock_count,
        COUNT(*) FILTER (WHERE stock <= COALESCE(reorder_point, 0))::int AS below_reorder_count,
        COALESCE(SUM(stock * COALESCE(unit_cost, 0)), 0)::numeric AS total_stock_value
      FROM inventory_records
      WHERE restaurant_id = $1
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Inventory Summary):', getErrorMessage(e));
    return [];
  }
};

const getSalesKpisContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        COUNT(*)::int AS orders_30d,
        COALESCE(SUM(total), 0)::numeric AS gross_revenue_30d,
        COALESCE(AVG(total), 0)::numeric(12,2) AS avg_order_value_30d,
        COUNT(*) FILTER (WHERE status = 'served')::int AS served_orders_30d,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders_30d,
        COALESCE(SUM(promotion_discount), 0)::numeric AS promo_discount_30d
      FROM orders
      WHERE restaurant_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Sales KPIs):', getErrorMessage(e));
    return [];
  }
};

const getTopSalesContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(`
      SELECT
        item->>'menu_item_name' AS menu_item_name,
        COUNT(*)::int AS order_count,
        COALESCE(SUM((item->>'quantity')::numeric), 0)::numeric AS total_qty,
        COALESCE(SUM(((item->>'price')::numeric) * ((item->>'quantity')::numeric)), 0)::numeric AS gross_sales
      FROM orders o,
        jsonb_array_elements(o.items) AS item
      WHERE o.restaurant_id = $1
        AND o.created_at >= NOW() - INTERVAL '30 days'
        AND o.status IN ('served', 'ready', 'preparing')
      GROUP BY item->>'menu_item_name'
      ORDER BY total_qty DESC
      LIMIT 10
    `, [restaurantId]);
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Sales Query Failed):', getErrorMessage(e));
    return [];
  }
};

const getSalesTrendContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        DATE(created_at) AS sales_date,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total), 0)::numeric AS revenue
      FROM orders
      WHERE restaurant_id = $1
        AND created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Sales Trend):', getErrorMessage(e));
    return [];
  }
};

const getWasteContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(`
      SELECT menu_item_name, SUM(qty) as total_qty, SUM(total_cost) as cost
      FROM waste_entries
      WHERE restaurant_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY menu_item_name
      ORDER BY cost DESC
      LIMIT 10
    `, [restaurantId]); 
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Waste Query Failed):', getErrorMessage(e));
    return [];
  }
};

const getWasteReasonContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        COALESCE(reason, 'unspecified') AS reason,
        COUNT(*)::int AS entries,
        COALESCE(SUM(total_cost), 0)::numeric AS cost
      FROM waste_entries
      WHERE restaurant_id = $1
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY COALESCE(reason, 'unspecified')
      ORDER BY cost DESC
      LIMIT 8
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Waste Reasons):', getErrorMessage(e));
    return [];
  }
};

const getExpenseContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(`
      SELECT ec.name as category, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.restaurant_id = $1 AND e.expense_date >= date_trunc('month', now())
      GROUP BY ec.name
      ORDER BY total DESC
    `, [restaurantId]);
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Expenses):', getErrorMessage(e));
    return [];
  }
};

const getPendingExpenseContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        payment_status,
        COUNT(*)::int AS items,
        COALESCE(SUM(amount), 0)::numeric AS amount
      FROM expenses
      WHERE restaurant_id = $1
        AND payment_status IN ('pending', 'partially_paid', 'overdue')
      GROUP BY payment_status
      ORDER BY amount DESC
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Pending Expenses):', getErrorMessage(e));
    return [];
  }
};

const getPromotionContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        p.code,
        p.type,
        p.discount_value,
        p.uses_count,
        p.max_uses,
        p.is_active,
        p.valid_until,
        COALESCE(SUM(o.total), 0)::numeric AS attributed_revenue,
        COUNT(o.id)::int AS attributed_orders
      FROM promotions p
      LEFT JOIN orders o
        ON o.restaurant_id = p.restaurant_id
        AND o.promotion_id = p.id
        AND o.created_at >= NOW() - INTERVAL '30 days'
      WHERE p.restaurant_id = $1
      GROUP BY p.id
      ORDER BY attributed_orders DESC, p.uses_count DESC
      LIMIT 10
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Promotions):', getErrorMessage(e));
    return [];
  }
};

const getReservationStatusContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT status, COUNT(*)::int AS count
      FROM reservations
      WHERE restaurant_id = $1
        AND reservation_date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY status
      ORDER BY count DESC
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Reservations Status):', getErrorMessage(e));
    return [];
  }
};

const getUpcomingReservationsContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT reservation_date, reservation_time, party_size, status
      FROM reservations
      WHERE restaurant_id = $1
        AND reservation_date >= CURRENT_DATE
        AND status IN ('pending', 'confirmed')
      ORDER BY reservation_date ASC, reservation_time ASC
      LIMIT 12
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Upcoming Reservations):', getErrorMessage(e));
    return [];
  }
};

const getLoyaltyContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_customers,
        COUNT(*) FILTER (WHERE last_visit >= NOW() - INTERVAL '30 days')::int AS active_customers_30d,
        COALESCE(SUM(total_points), 0)::numeric AS total_points_balance,
        COALESCE(SUM(total_spent), 0)::numeric AS cumulative_loyalty_spend
      FROM customers
      WHERE restaurant_id = $1
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Loyalty):', getErrorMessage(e));
    return [];
  }
};

const getReviewSummaryContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_reviews_30d,
        COALESCE(AVG(rating), 0)::numeric(4,2) AS avg_rating_30d,
        COUNT(*) FILTER (WHERE rating <= 2)::int AS low_rating_count_30d
      FROM reviews
      WHERE restaurant_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Review Summary):', getErrorMessage(e));
    return [];
  }
};

const getRecentLowRatingsContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT rating, comment, customer_name, created_at
      FROM reviews
      WHERE restaurant_id = $1
        AND rating <= 2
      ORDER BY created_at DESC
      LIMIT 8
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Low Ratings):', getErrorMessage(e));
    return [];
  }
};

const getStaffingSummaryContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        role,
        COUNT(*)::int AS staff_count,
        COUNT(*) FILTER (WHERE is_on_duty = true)::int AS on_duty_count
      FROM staff
      WHERE restaurant_id = $1
      GROUP BY role
      ORDER BY staff_count DESC
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Staffing Summary):', getErrorMessage(e));
    return [];
  }
};

const getWeeklyScheduleCoverageContext = async (restaurantId: string): Promise<SqlRow[]> => {
  try {
    const res = await pool.query(
      `
      SELECT
        shift_date,
        COUNT(*)::int AS shifts,
        COUNT(DISTINCT staff_id)::int AS unique_staff
      FROM staff_schedules
      WHERE restaurant_id = $1
        AND shift_date >= CURRENT_DATE
        AND shift_date <= CURRENT_DATE + INTERVAL '7 days'
      GROUP BY shift_date
      ORDER BY shift_date ASC
      `,
      [restaurantId]
    );
    return res.rows as SqlRow[];
  } catch (e) {
    console.warn('AI Context Warning (Schedule Coverage):', getErrorMessage(e));
    return [];
  }
};

const buildSystemInstruction = (snapshot: AiSnapshot): string => {
  const currency = snapshot.restaurant?.currency || 'RWF';
  const restaurantName = snapshot.restaurant?.name || 'the restaurant';

  return `
You are 'Servv Insights Assistant', a senior hospitality operations analyst for ${restaurantName}.

MISSION
- Analyze this full operational snapshot and provide comprehensive, practical management insights.
- Use evidence from multiple modules together (inventory + sales + waste + finance + marketing + reservations + customer feedback + staffing).
- If any module is empty, mention it as a data gap and continue with available modules.

STRICT OUTPUT RULES
1) Always quote monetary values in ${currency}. Never use USD or "$" unless the source data explicitly uses another currency.
2) Never say "no restocking needed" if any item is out_of_stock, low_stock, or below_reorder in the data.
3) Keep every claim traceable to the snapshot. Do not invent metrics.
4) Prefer specific actions with expected impact and priority.

RESPONSE FORMAT
Return the answer with these sections:
1. Executive Summary (3-5 bullets)
2. Cross-Module Findings (Inventory, Sales, Waste, Finance, Marketing, Reservations, Customers, Staffing)
3. Priority Actions (Now / This Week / This Month)
4. Risks & Data Gaps

CURRENT SNAPSHOT
${JSON.stringify(snapshot, null, 2)}
`.trim();
};

function deriveActionsFromContext(snapshot: AiSnapshot): string[] {
  const actions: string[] = [];
  if (snapshot.inventory.criticalItems.length > 0) actions.push('review_purchase_orders');
  if (snapshot.waste.topWasteItems.length > 0) actions.push('check_waste_analysis');
  if (snapshot.finance.pendingExpenses.length > 0) actions.push('clear_pending_expenses');
  if (snapshot.marketing.promotions.length > 0) actions.push('optimize_promotions');
  if (snapshot.customers.recentLowRatings.length > 0) actions.push('address_service_quality');
  if (snapshot.reservations.upcoming.length > 0) actions.push('prepare_reservation_coverage');
  return actions;
}