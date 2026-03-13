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
  const header = ['Order ID', 'Order #', 'Table', 'Waiter', 'Status', 'Date', 'Time', 'Items', 'Subtotal', 'Tax', 'Total (RWF)'];
  const rows = orders.map((o) => [
    o.id,
    o.orderNumber,
    o.tableNumber ? String(o.tableNumber) : '-',
    o.assignedTo ?? '-',
    o.status,
    new Date(o.createdAt).toLocaleDateString(),
    new Date(o.createdAt).toLocaleTimeString(),
    o.items.map(i => `${i.quantity}x ${i.menuItemName}`).join('; '),
    String(o.subtotal),
    String(o.tax),
    String(o.total)
  ]);
  return [header, ...rows];
}

