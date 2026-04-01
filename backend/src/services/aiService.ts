import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from '../db.js';

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

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  const result = await model.generateContent([systemInstruction, userPrompt]);
  const response = await result.response;
  
  return {
    answer: response.text(),
    suggestedActions: deriveActionsFromContext(inventory, waste),
    timestamp: new Date()
  };
};

const getLowStockContext = async (restaurantId: string) => {
  try {
    const res = await pool.query(`
      SELECT ii.name, ist.quantity, ist.min_level
      FROM inventory_items ii
      JOIN inventory_stock ist ON ii.id = ist.inventory_item_id
      WHERE ii.restaurant_id = $1 AND ist.quantity <= ist.min_level
      LIMIT 10
    `, [restaurantId]);
    return res.rows;
  } catch (e) {
    console.warn('AI Context Warning (Inventory):', e.message);
    return [];
  }
};

const getTopSalesContext = async (restaurantId: string) => {
  try {
    // This query assumes a specific 'orders' table structure. 
    // We wrap it in a try-catch so the whole AI service doesn't crash if the table is different.
    const res = await pool.query(`
      SELECT menu_item_name, COUNT(*) as order_count
      FROM orders, jsonb_to_recordset(items) as x(menu_item_name text)
      WHERE restaurant_id = $1 AND status = 'served' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY menu_item_name ORDER BY order_count DESC LIMIT 5
    `, [restaurantId]);
    return res.rows;
  } catch (e) {
    console.error('AI Context Error (Sales Query Failed):', e);
    return [];
  }
};

const getWasteContext = async (restaurantId: string) => {
  try {
    const res = await pool.query(`
      SELECT menu_item_name, SUM(qty) as total_qty, SUM(total_cost) as cost
      FROM waste_entries
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY menu_item_name ORDER BY cost DESC LIMIT 3
    `); 
    return res.rows;
  } catch (e) {
    console.error('AI Context Error (Waste Query Failed):', e);
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
    console.warn('AI Context Warning (Expenses):', e.message);
    return [];
  }
};

function deriveActionsFromContext(lowStock: any[], waste: any[]) {
  const actions = [];
  if (lowStock.length > 0) actions.push("review_purchase_orders");
  if (waste.length > 0) actions.push("check_waste_analysis");
  return actions;
}