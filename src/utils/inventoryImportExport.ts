import * as XLSX from 'xlsx';

export interface InventoryImportRow {
  menuItemId: string;
  description?: string;
  expiryDate?: string;
  purchaseDate?: string;
  qtyStart?: number;
  stock: number;
  lowStockThreshold: number;
  reorderPoint: number;
  reorderQty: number;
  unitCost: number;
  price?: number;
  location: string;
  unitMeasurement: string;
}

const CSV_HEADERS = [
  'Item_ID',
  'Description',
  'Expiry_Date',
  'Purchase_Date',
  'Qty_Start',
  'Current_Qty',
  'Cost',
  'Price',
  'Location',
];

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

export function exportInventoryToCsv(
  rows: {
    item: { id: string; name: string; price?: number };
    rec?: {
      stock: number;
      description?: string;
      qtyStart?: number;
      currentQty?: number;
      cost?: number;
      price?: number;
      expiryDate?: string;
      purchaseDate?: string;
      lowStockThreshold: number;
      reorderPoint: number;
      reorderQty: number;
      unitCost: number;
      location?: string;
      unitMeasurement?: string;
    };
  }[]
): void {
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((r) =>
      [
        csvEsc(r.item.id),
        csvEsc(r.rec?.description ?? r.item.name),
        csvEsc(r.rec?.expiryDate ?? ''),
        csvEsc(r.rec?.purchaseDate ?? ''),
        r.rec?.qtyStart ?? r.rec?.stock ?? 0,
        r.rec?.currentQty ?? r.rec?.stock ?? 0,
        r.rec?.cost ?? r.rec?.unitCost ?? 0,
        r.rec?.price ?? r.item.price ?? 0,
        csvEsc(r.rec?.location ?? ''),
      ].join(',')
    ),
  ].join('\n');

  dl(
    new Blob([lines], { type: 'text/csv' }),
    `inventory-export-${new Date().toISOString().split('T')[0]}.csv`
  );
}

export function downloadInventoryTemplate(): void {
  const examples = [
    'item-example-001,Coca Cola,2026-12-31,2026-05-01,24,24,500,700,Bar Fridge',
    'item-example-002,Heineken Beer,2027-02-28,2026-05-01,48,48,1200,1700,Fridge 2',
    'item-example-003,Tomatoes,2026-05-10,2026-05-02,10,10,200,350,Dry Store',
  ];
  const csv = [CSV_HEADERS.join(','), ...examples].join('\n');
  dl(new Blob([csv], { type: 'text/csv' }), 'inventory-template.csv');
}

function nk(k: string): string {
  return k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvRows(content: string): InventoryImportRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(nk);
  const results: InventoryImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const id = row.itemid || row.menuitemid || row.menuitemid || row.id || '';
    if (!id) continue;

    const stock = Math.round(parseFloat(row.currentqty ?? row.stock ?? row.qtystart ?? '0') || 0);
    const qtyStart = Math.round(parseFloat(row.qtystart ?? String(stock)) || stock);

    results.push({
      menuItemId: id,
      description: row.description ?? row.itemname ?? '',
      expiryDate: row.expirydate ?? '',
      purchaseDate: row.purchasedate ?? '',
      qtyStart,
      stock,
      lowStockThreshold: Math.round(parseFloat(row.lowstockthreshold ?? row.threshold ?? '5') || 5),
      reorderPoint: Math.round(parseFloat(row.reorderpoint ?? '10') || 10),
      reorderQty: Math.round(parseFloat(row.reorderqty ?? '20') || 20),
      unitCost: parseFloat(row.cost ?? row.unitcost ?? '0') || 0,
      price: parseFloat(row.price ?? '0') || 0,
      location: row.location ?? '',
      unitMeasurement: row.unitmeasurement ?? row.unit ?? 'units',
    });
  }

  return results;
}

function parseExcelRows(buffer: ArrayBuffer): InventoryImportRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);

  return data
    .map((raw) => {
      const row: Record<string, any> = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [nk(k), v])
      );
      const id = String(row.menuitemid || row.itemid || row.id || '');
      if (!id) return null;

      const stock = Math.round(Number(row.currentqty ?? row.stock ?? row.qtystart ?? 0));
      const qtyStart = Math.round(Number(row.qtystart ?? stock));

      return {
        menuItemId: id,
        description: String(row.description ?? row.itemname ?? ''),
        expiryDate: String(row.expirydate ?? ''),
        purchaseDate: String(row.purchasedate ?? ''),
        qtyStart,
        stock,
        lowStockThreshold: Math.round(Number(row.lowstockthreshold ?? row.threshold ?? 5)),
        reorderPoint: Math.round(Number(row.reorderpoint ?? 10)),
        reorderQty: Math.round(Number(row.reorderqty ?? 20)),
        unitCost: Number(row.cost ?? row.unitcost ?? 0),
        price: Number(row.price ?? 0),
        location: String(row.location ?? ''),
        unitMeasurement: String(row.unitmeasurement ?? row.unit ?? 'units'),
      } as InventoryImportRow;
    })
    .filter((r): r is InventoryImportRow => r !== null);
}

export async function importInventoryFromFile(file: File): Promise<InventoryImportRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    return parseCsvRows(await file.text());
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcelRows(await file.arrayBuffer());
  }

  if (name.endsWith('.json')) {
    const data: unknown = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('JSON must be an array of objects');
    return (data as any[]).map((r, i) => ({
      menuItemId: String(r.menu_item_id || r.menuItemId || r.id || `row-${i}`),
      description: String(r.description ?? ''),
      expiryDate: String(r.expiry_date ?? r.expiryDate ?? ''),
      purchaseDate: String(r.purchase_date ?? r.purchaseDate ?? ''),
      qtyStart: Math.round(Number(r.qty_start ?? r.qtyStart ?? r.current_qty ?? r.currentQty ?? r.stock ?? 0)),
      stock: Math.round(Number(r.current_qty ?? r.currentQty ?? r.stock ?? 0)),
      lowStockThreshold: Math.round(Number(r.low_stock_threshold ?? r.lowStockThreshold ?? 5)),
      reorderPoint: Math.round(Number(r.reorder_point ?? r.reorderPoint ?? 10)),
      reorderQty: Math.round(Number(r.reorder_qty ?? r.reorderQty ?? 20)),
      unitCost: Number(r.cost ?? r.unit_cost ?? r.unitCost ?? 0),
      price: Number(r.price ?? r.selling_price ?? r.sellingPrice ?? 0),
      location: String(r.location ?? ''),
      unitMeasurement: String(r.unit_measurement ?? r.unitMeasurement ?? 'units'),
    }));
  }

  throw new Error('Unsupported file format. Use CSV, XLSX, or JSON.');
}
