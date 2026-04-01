import { Parser } from 'json2csv';

/**
 * Converts inventory stock data into a CSV string for reports
 */
export const convertStockToCSV = (data: any[]) => {
  try {
    const fields = ['item_name', 'sku', 'location_name', 'quantity', 'unit_cost', 'total_value'];
    const opts = { fields };
    const parser = new Parser(opts);
    return parser.parse(data);
  } catch (err) {
    console.error('CSV Export Error:', err);
    throw new Error('Failed to generate export');
  }
};