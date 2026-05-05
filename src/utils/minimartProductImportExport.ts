import * as XLSX from 'xlsx';
import type { MenuItem } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductImportRow {
  name: string;
  category: string;
  price: number;
  emoji: string;
  description: string;
  isAvailable: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function csvEsc(val: unknown): string {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function dl(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export ───────────────────────────────────────────────────────────────────

const PRODUCT_CSV_HEADERS = ['name', 'category', 'price', 'emoji', 'description', 'available'];

export function exportProductsToCsv(products: MenuItem[]): void {
  const rows = [
    PRODUCT_CSV_HEADERS.join(','),
    ...products.map((p) =>
      [
        csvEsc(p.name),
        csvEsc(p.category),
        csvEsc(p.price),
        csvEsc((p as any).emoji || '📦'),
        csvEsc(p.description || ''),
        csvEsc(p.is_available !== false ? 'true' : 'false'),
      ].join(',')
    ),
  ].join('\n');

  dl(new Blob([rows], { type: 'text/csv;charset=utf-8;' }), 'minimart_products.csv');
}

export function downloadProductTemplate(): void {
  const rows = [
    PRODUCT_CSV_HEADERS.join(','),
    csvEsc('Coca Cola 500ml') + ',Beverages,1500,🥤,,true',
    csvEsc('Mineral Water 1L') + ',Beverages,800,💧,,true',
    csvEsc('Bread Loaf') + ',Bakery,2000,🍞,,true',
  ].join('\n');

  dl(new Blob([rows], { type: 'text/csv;charset=utf-8;' }), 'minimart_products_template.csv');
}

// ── Import ───────────────────────────────────────────────────────────────────

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
}

function normalizeRow(raw: Record<string, unknown>): ProductImportRow | null {
  const name = String(raw['name'] ?? raw['product_name'] ?? raw['Product Name'] ?? '').trim();
  const category = String(raw['category'] ?? raw['Category'] ?? '').trim();
  const priceRaw = raw['price'] ?? raw['Price'];
  const price = parseFloat(String(priceRaw ?? '0'));

  if (!name || !category || isNaN(price) || price < 0) return null;

  return {
    name,
    category,
    price,
    emoji: String(raw['emoji'] ?? raw['Emoji'] ?? '📦').trim() || '📦',
    description: String(raw['description'] ?? raw['Description'] ?? '').trim(),
    isAvailable: parseBool(raw['available'] ?? raw['Available'] ?? raw['is_available'] ?? true),
  };
}

export async function importProductsFromFile(file: File): Promise<ProductImportRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new Error('CSV is empty or has no data rows.');
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const rows: ProductImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const raw: Record<string, string> = {};
      headers.forEach((h, j) => { raw[h] = values[j] ?? ''; });
      const row = normalizeRow(raw);
      if (row) rows.push(row);
    }
    if (rows.length === 0) throw new Error('No valid product rows found in CSV.');
    return rows;
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
    const rows = raw.map(normalizeRow).filter((r): r is ProductImportRow => r !== null);
    if (rows.length === 0) throw new Error('No valid product rows found in spreadsheet.');
    return rows;
  }

  throw new Error('Unsupported file format. Use .csv, .xlsx or .xls');
}

// ── Transaction Export ───────────────────────────────────────────────────────

interface TransactionRow {
  id: string;
  orderNumber: string;
  cashierName: string;
  total: number;
  paymentMethod: string;
  itemCount: number;
  createdAt: string;
  items: Array<{ name: string; qty: number; unitPrice: number; total: number }>;
}

export function exportTransactionsToCsv(transactions: TransactionRow[]): void {
  const headers = ['order_number', 'date', 'cashier', 'payment_method', 'item_count', 'total'];
  const rows = [
    headers.join(','),
    ...transactions.map((t) =>
      [
        csvEsc(t.orderNumber),
        csvEsc(new Date(t.createdAt).toLocaleString()),
        csvEsc(t.cashierName),
        csvEsc(t.paymentMethod),
        csvEsc(t.itemCount),
        csvEsc(t.total),
      ].join(',')
    ),
  ].join('\n');

  const dateStr = new Date().toISOString().slice(0, 10);
  dl(new Blob([rows], { type: 'text/csv;charset=utf-8;' }), `minimart_transactions_${dateStr}.csv`);
}
