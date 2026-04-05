import { Order } from '../types';
import { Expense } from '../types/expenses';

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RWF',
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

export function buildExpenseReceiptHtml(
  expense: Expense,
  restaurantName = 'Restaurant Name',
  restaurantAddress = '123 Main St',
  restaurantPhone = '(555) 123-4567'
) {
  const taxAmount = expense.taxAmount || (expense.amount * expense.taxRate) / 100;
  const total = expense.amount + taxAmount;
  const receiptDate = expense.expenseDate
    ? new Date(expense.expenseDate).toLocaleDateString()
    : new Date().toLocaleDateString();

  return `
    <html>
      <head>
        <title>Expense Receipt - ${expense.referenceNumber || expense.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f8fafc; }
          .receipt { max-width: 600px; background: white; margin: 0 auto; padding: 24px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
          .header { text-align: center; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 1.5rem; }
          .section { margin-bottom: 18px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
          .row:last-child { border-bottom: none; }
          .label { color: #475569; font-weight: 600; }
          .value { color: #0f172a; }
          .total { font-size: 1.1rem; font-weight: 700; margin-top: 12px; }
          .footer { margin-top: 24px; text-align: center; color: #64748b; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>${restaurantName}</h1>
            <p>${restaurantAddress}</p>
            <p>${restaurantPhone}</p>
          </div>

          <div class="section">
            <div class="row"><span class="label">Receipt #</span><span class="value">${expense.referenceNumber || expense.id}</span></div>
            <div class="row"><span class="label">Date</span><span class="value">${receiptDate}</span></div>
            <div class="row"><span class="label">Category</span><span class="value">${expense.category?.name || 'N/A'}</span></div>
            <div class="row"><span class="label">Vendor</span><span class="value">${expense.vendorName || 'N/A'}</span></div>
          </div>

          <div class="section">
            <div class="row"><span class="label">Description</span><span class="value">${expense.description}</span></div>
          </div>

          <div class="section">
            <div class="row"><span class="label">Subtotal</span><span class="value">${expense.currency} ${Number(expense.amount).toFixed(2)}</span></div>
            ${expense.taxRate > 0 || expense.taxAmount > 0 ? `<div class="row"><span class="label">Tax</span><span class="value">${expense.currency} ${Number(taxAmount).toFixed(2)}</span></div>` : ''}
            <div class="row total"><span class="label">Total</span><span class="value">${expense.currency} ${Number(total).toFixed(2)}</span></div>
          </div>

          <div class="section">
            <div class="row"><span class="label">Payment Method</span><span class="value">${(expense.paymentMethod || 'cash').replace(/_/g, ' ').toUpperCase()}</span></div>
            <div class="row"><span class="label">Payment Status</span><span class="value">${expense.paymentStatus.toUpperCase()}</span></div>
          </div>

          ${expense.notes ? `<div class="section"><div class="label">Notes</div><div>${expense.notes}</div></div>` : ''}

          <div class="footer">Thank you for your business!<br/>Generated on ${new Date().toLocaleString()}</div>
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

export function printHtml(html: string) {
  const printWindow = window.open('', '_blank', 'width=700,height=900');
  if (!printWindow) {
    throw new Error('Unable to open print window');
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
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
