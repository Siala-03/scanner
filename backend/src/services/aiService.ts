import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from '../db.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const analyzeRestaurantData = async (restaurantId: string, userPrompt: string) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GEMINI_API_KEY is missing or invalid in the .env file.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // 1. Gather Multi-dimensional Context
  const [inventory, sales, waste, expenses] = await Promise.all([
    getLowStockContext(restaurantId),
    getTopSalesContext(restaurantId),
    getWasteContext(restaurantId),
    getExpenseContext(restaurantId)
  ]);

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const systemInstruction = `
    You are 'Servv Insights Assistant', an elite restaurant operations analyst.
    Your goal is to provide actionable, data-driven advice to the restaurant manager.
    
    CURRENT DATA SNAPSHOT FOR RESTAURANT:
    - Low Stock Items: ${JSON.stringify(inventory)}
    - Top 5 Best Sellers (30 days): ${JSON.stringify(sales)}
    - Top Waste Drivers: ${JSON.stringify(waste)}
    - Monthly Expenses by Category: ${JSON.stringify(expenses)}

    GUIDELINES:
    1. If stock is low for a best-seller, warn the manager to reorder immediately.
    2. If waste is high for an item, suggest checking portion sizes or storage temperatures.
    3. If expenses in a category (like 'Utilities') are spiking, suggest an audit.
    4. Keep answers professional, concise, and focused on increasing profitability.
    5. Only use the data provided. If you don't know, suggest where the manager can look in the app.
  `;

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
    suggestedActions: deriveActionsFromContext(inventory, waste),
    timestamp: new Date()
  };
};

const getLowStockContext = async (restaurantId: string) => {
  try {
    const res = await pool.query(`
      SELECT mi.name, ir.stock, ir.low_stock_threshold, ir.reorder_point
      FROM inventory_records ir
      JOIN menu_items mi ON ir.menu_item_id = mi.id
      WHERE ir.restaurant_id = $1 AND mi.restaurant_id = $1 AND ir.stock <= ir.low_stock_threshold
      ORDER BY ir.stock ASC
      LIMIT 10
    `, [restaurantId]);
    return res.rows;
  } catch (e) {
    console.warn('AI Context Warning (Inventory):', getErrorMessage(e));
    return [];
  }
};

const getTopSalesContext = async (restaurantId: string) => {
  try {
    // Items are stored as a JSONB array in orders.items, not in a separate table
    const res = await pool.query(`
      SELECT
        item->>'menu_item_name' AS menu_item_name,
        COUNT(*) AS order_count,
        SUM((item->>'quantity')::int) AS total_qty
      FROM orders o,
        jsonb_array_elements(o.items) AS item
      WHERE o.restaurant_id = $1
        AND o.status = 'served'
        AND o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY item->>'menu_item_name'
      ORDER BY order_count DESC
      LIMIT 5
    `, [restaurantId]);
    return res.rows;
  } catch (e) {
    console.warn('AI Context Warning (Sales Query Failed):', getErrorMessage(e));
    return [];
  }
};

const getWasteContext = async (restaurantId: string) => {
  try {
    const res = await pool.query(`
      SELECT menu_item_name, SUM(qty) as total_qty, SUM(total_cost) as cost
      FROM waste_entries
      WHERE restaurant_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY menu_item_name
      ORDER BY cost DESC
      LIMIT 3
    `, [restaurantId]); 
    return res.rows;
  } catch (e) {
    console.warn('AI Context Warning (Waste Query Failed):', getErrorMessage(e));
    return [];
  }
};

const getExpenseContext = async (restaurantId: string) => {
  try {
    const res = await pool.query(`
      SELECT ec.name as category, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.restaurant_id = $1 AND e.expense_date >= date_trunc('month', now())
      GROUP BY ec.name
    `, [restaurantId]);
    return res.rows;
  } catch (e) {
    console.warn('AI Context Warning (Expenses):', getErrorMessage(e));
    return [];
  }
};

function deriveActionsFromContext(lowStock: any[], waste: any[]) {
  const actions = [];
  if (lowStock.length > 0) actions.push("review_purchase_orders");
  if (waste.length > 0) actions.push("check_waste_analysis");
  return actions;
}