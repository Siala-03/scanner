import * as XLSX from 'xlsx';

export interface InventoryImportRow {
  menuItemId: string;
  stock: number;
  lowStockThreshold: number;
  reorderPoint: number;
  reorderQty: number;
  unitCost: number;
  location: string;
  unitMeasurement: string;
}

const CSV_HEADERS = [
  'item_name',
  'menu_item_id',
  'stock',
  'low_stock_threshold',
  'reorder_point',
  'reorder_qty',
  'unit_cost',
  'location',
  'unit_measurement',
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
    item: { id: string; name: string };
    rec?: {
      stock: number;
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
        csvEsc(r.item.name),
        csvEsc(r.item.id),
        r.rec?.stock ?? 0,
        r.rec?.lowStockThreshold ?? 5,
        r.rec?.reorderPoint ?? 10,
        r.rec?.reorderQty ?? 20,
        r.rec?.unitCost ?? 0,
        csvEsc(r.rec?.location ?? ''),
        csvEsc(r.rec?.unitMeasurement ?? 'units'),
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
    'Coca Cola,item-example-001,24,5,10,20,500,Bar Fridge,units',
    'Heineken Beer,item-example-002,48,10,20,50,1200,Fridge 2,bottles',
    'Tomatoes,item-example-003,10,3,5,20,200,Dry Store,kg',
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

    const id = row.menuitemid || row.itemid || row.id || '';
    if (!id) continue;

    results.push({
      menuItemId: id,
      stock: parseInt(row.stock ?? '0', 10) || 0,
      lowStockThreshold: parseInt(row.lowstockthreshold ?? row.threshold ?? '5', 10) || 5,
      reorderPoint: parseInt(row.reorderpoint ?? '10', 10) || 10,
      reorderQty: parseInt(row.reorderqty ?? '20', 10) || 20,
      unitCost: parseFloat(row.unitcost ?? row.cost ?? '0') || 0,
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
      return {
        menuItemId: id,
        stock: Number(row.stock ?? 0),
        lowStockThreshold: Number(row.lowstockthreshold ?? row.threshold ?? 5),
        reorderPoint: Number(row.reorderpoint ?? 10),
        reorderQty: Number(row.reorderqty ?? 20),
        unitCost: Number(row.unitcost ?? row.cost ?? 0),
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
      stock: Number(r.stock ?? 0),
      lowStockThreshold: Number(r.low_stock_threshold ?? r.lowStockThreshold ?? 5),
      reorderPoint: Number(r.reorder_point ?? r.reorderPoint ?? 10),
      reorderQty: Number(r.reorder_qty ?? r.reorderQty ?? 20),
      unitCost: Number(r.unit_cost ?? r.unitCost ?? 0),
      location: String(r.location ?? ''),
      unitMeasurement: String(r.unit_measurement ?? r.unitMeasurement ?? 'units'),
    }));
  }

  throw new Error('Unsupported file format. Use CSV, XLSX, or JSON.');
}
