import type { Order } from '../types';
import type { MenuItem } from '../types';

export function downloadCsv(filename: string, rows: string[][]) {
  const csvContent = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildOrdersCsv(orders: Order[]): string[][] {
  const header = ['Order ID', 'Table', 'Waiter ID', 'Status', 'Date', 'Time', 'Total (RWF)'];
  const rows = orders.map((o) => [
    o.id,
    String(o.tableNumber),
    o.assignedWaiterId ?? '',
    o.status,
    o.createdAt.toLocaleDateString(),
    o.createdAt.toLocaleTimeString(),
    String(o.total)
  ]);
  return [header, ...rows];
}

