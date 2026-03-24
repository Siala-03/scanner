import { Order } from '../types';

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

export function formatDateTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function buildReceiptHtml(order: Order, waiterName: string, printerName = 'Network Thermal Printer') {
  const orderNumber = (order as any).orderNumber || order.id;
  const taxAmount = (order as any).tax ?? 0;
  const serviceCharge = (order as any).serviceCharge ?? 0;

  const itemsHtml = order.items
    .map((item) => {
      const unitPrice = (item as any).unitPrice ?? item.menuItem.price ?? 0;
      const menuName = (item as any).menuItemName ?? item.menuItem?.name ?? 'Item';
      const lineTotal = item.quantity * unitPrice;
      return `
        <tr>
          <td>${item.quantity} x ${menuName}</td>
          <td style="text-align: right;">${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const dateTime = formatDateTime(order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt);

  return `
  <html>
    <head>
      <title>Receipt - ${orderNumber}</title>
      <style>
        body { font-family: 'Courier New', monospace; color: #111827; background: white; margin: 0; padding: 16px; }
        .receipt { max-width: 340px; margin: 0 auto; }
        .title { text-align: center; font-size: 1.2rem; font-weight: bold; margin-bottom: 8px; }
        .meta, .totals { font-size: 0.85rem; margin-top: 6px; }
        .items { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .items td { padding: 4px 0; }
        .divider { border-top: 1px dashed #9ca3af; margin-top: 8px; margin-bottom: 8px; }
        .total-line { font-weight: bold; border-top: 1px solid #d1d5db; padding-top: 6px; }
        .print-button { display: none; }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="title">Servv Restaurant</div>
        <div class="meta">Printer: ${printerName}</div>
        <div class="meta">Order: ${orderNumber}</div>
        <div class="meta">Table: ${order.tableNumber ?? 'N/A'}</div>
        <div class="meta">Waiter: ${waiterName}</div>
        <div class="meta">Date: ${dateTime}</div>

        <div class="divider"></div>

        <table class="items">
          ${itemsHtml}
        </table>

        <div class="divider"></div>

        <div class="totals">
          <div class="total-line" style="display:flex;justify-content:space-between;">Subtotal<span>${formatCurrency(order.subtotal)}</span></div>
          ${serviceCharge > 0 ? `<div style="display:flex;justify-content:space-between;">Service<span>${formatCurrency(serviceCharge)}</span></div>` : ''}
          ${taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;">Tax<span>${formatCurrency(taxAmount)}</span></div>` : ''}
          <div class="total-line" style="display:flex;justify-content:space-between;">Total<span>${formatCurrency(order.total)}</span></div>
        </div>

        <div class="meta" style="margin-top:12px;">Thank you for dining with us!</div>
      </div>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
  </html>
  `;
}
