import { Order } from '../types';

// ============================================
// CURRENCY FORMATTING
// ============================================

export function formatCurrency(value: number, currency: 'USD' | 'RWF' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatCurrencyNoSymbol(value: number, currency: 'USD' | 'RWF' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value).replace(/^\D+/, '').trim();
}

export function formatDateTime(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// ============================================
// LOYALTY POINTS CALCULATION
// ============================================

export interface LoyaltyPointsResult {
  orderAmountRWF: number;
  pointsEarned: number;
  calculationNote: string;
}

/**
 * Calculate loyalty points based on order amount in RWF
 * Rule: 1 point for every 1,000 RWF above 5,000 RWF threshold
 */
export function calculateLoyaltyPoints(orderAmountRWF: number): LoyaltyPointsResult {
  const threshold = 5000;
  const pointsPerUnit = 1;
  const unitAmount = 1000;

  if (orderAmountRWF <= threshold) {
    return {
      orderAmountRWF,
      pointsEarned: 0,
      calculationNote: `No points for orders at or below ${formatCurrency(threshold, 'RWF')}`
    };
  }

  const eligibleAmount = orderAmountRWF - threshold;
  const pointsEarned = Math.floor(eligibleAmount / unitAmount) * pointsPerUnit;

  return {
    orderAmountRWF,
    pointsEarned,
    calculationNote: `1 point per ${formatCurrency(unitAmount, 'RWF')} above ${formatCurrency(threshold, 'RWF')}`
  };
}

// ============================================
// RECEIPT DATA TYPES
// ============================================

export interface ReceiptItemData {
  quantity: number;
  name: string;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  category?: string;
}

export interface ReceiptData {
  // Restaurant Info
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantEmail?: string;
  restaurantLogo?: string;   // base64 data URL or https URL
  restaurantCity?: string;
  restaurantCountry?: string;
  taxId?: string;

  // Order Info
  orderNumber: string;
  receiptId: string;
  orderType: 'dine-in' | 'takeout' | 'delivery';
  tableNumber?: number;
  serverName: string;
  orderDate: Date | string;

  // Customer Info
  customerName?: string;
  customerId?: string;

  // Items
  items: ReceiptItemData[];

  // Financials
  currency: 'USD' | 'RWF';
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount?: number;
  discountDescription?: string;
  total: number;

  // Payment
  paymentMethod: string;
  paymentStatus: 'paid' | 'pending' | 'partial';
  amountPaid?: number;
  change?: number;
  cardLast4?: string;

  // Delivery Info (if applicable)
  deliveryAddress?: string;
  deliveryProvider?: string;
  deliveryFee?: number;

  // Loyalty Points
  loyaltyPoints?: LoyaltyPointsResult & {
    pointsBalance: number;
  };

  // Additional
  notes?: string;
  specialInstructions?: string;
}

// ============================================
// ORDER TO RECEIPT DATA CONVERSION
// ============================================

export interface BuildReceiptOptions {
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantEmail?: string;
  restaurantLogo?: string;
  restaurantCity?: string;
  restaurantCountry?: string;
  taxRate: number;
  serverName: string;
  orderType?: 'dine-in' | 'takeout' | 'delivery';
  customerName?: string;
  paymentMethod?: string;
  paymentStatus?: 'paid' | 'pending' | 'partial';
  amountPaid?: number;
  cardLast4?: string;
  customerPointsBalance?: number;
  notes?: string;
}

export function orderToReceiptData(
  order: Order,
  options: BuildReceiptOptions
): ReceiptData {
  const orderNumber = order.orderNumber || order.id;
  const receiptId = orderNumber;

  const items: ReceiptItemData[] = order.items.map(item => {
    const unitPrice = item.unitPrice ?? item.menuItem?.price ?? 0;
    const name = item.menuItemName ?? item.menuItem?.name ?? 'Unknown Item';
    const totalPrice = item.totalPrice ?? (unitPrice * item.quantity);
    return {
      quantity: item.quantity,
      name,
      unitPrice,
      totalPrice,
      specialInstructions: item.specialInstructions,
      category: item.menuItem?.category,
    };
  });

  const total = order.total ?? items.reduce((s, i) => s + i.totalPrice, 0);

  const loyaltyCalc = calculateLoyaltyPoints(total);
  const loyaltyPoints = options.customerPointsBalance !== undefined ? {
    ...loyaltyCalc,
    pointsBalance: options.customerPointsBalance + loyaltyCalc.pointsEarned,
  } : undefined;

  const orderType = options.orderType || (order.deliveryAddress ? 'delivery' : 'dine-in');

  return {
    restaurantName: options.restaurantName,
    restaurantAddress: options.restaurantAddress,
    restaurantPhone: options.restaurantPhone,
    restaurantEmail: options.restaurantEmail,
    restaurantLogo: options.restaurantLogo,
    restaurantCity: options.restaurantCity,
    restaurantCountry: options.restaurantCountry,

    orderNumber,
    receiptId,
    orderType,
    tableNumber: order.tableNumber,
    serverName: options.serverName,
    orderDate: new Date(),

    customerName: options.customerName || order.customerName,
    customerId: order.customerId,

    items,

    currency: 'RWF',
    subtotal: total,
    taxRate: 0,
    taxAmount: 0,
    total,

    paymentMethod: options.paymentMethod || 'Cash',
    paymentStatus: options.paymentStatus || 'paid',
    amountPaid: options.amountPaid || total,
    change: options.amountPaid ? options.amountPaid - total : undefined,
    cardLast4: options.cardLast4,

    deliveryAddress: order.deliveryAddress,
    deliveryProvider: order.deliveryProvider,
    deliveryFee: 0,

    loyaltyPoints,

    notes: options.notes || order.notes,
    specialInstructions: order.specialInstructions,
  };
}

// ============================================
// HTML RECEIPT GENERATION
// ============================================

/**
 * Generate an 80mm thermal-optimised HTML receipt.
 * Uses @page { size: 80mm auto } so XPrinter / any 80mm USB printer
 * via window.print() gets the correct paper width automatically.
 */
export function buildReceiptHtml(receipt: ReceiptData): string {
  const {
    restaurantName,
    restaurantAddress,
    restaurantPhone,
    restaurantEmail,
    restaurantLogo,
    restaurantCity,
    restaurantCountry,
    orderNumber,
    receiptId,
    orderType,
    tableNumber,
    serverName,
    orderDate,
    customerName,
    items,
    currency,
    taxRate,
    taxAmount,
    total,
    paymentMethod,
    paymentStatus,
    amountPaid,
    change,
    cardLast4,
    deliveryAddress,
    loyaltyPoints,
    notes,
    specialInstructions
  } = receipt;

  // RWF: no decimals; other currencies: standard formatting
  const fmt = (v: number) => currency === 'RWF'
    ? 'RWF ' + Math.round(v).toLocaleString('en-US')
    : formatCurrency(v, currency);

  const orderTypeDisplay = (orderType ?? 'dine-in').split('-').map((w: string) =>
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');

  const itemsHtml = items.map(item => `
    <tr>
      <td class="qty">${item.quantity}&times;</td>
      <td class="name">${item.name}${item.specialInstructions ? `<div class="note">&#8627; ${item.specialInstructions}</div>` : ''}</td>
      <td class="price">${fmt(item.totalPrice)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt #${orderNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 9pt; color: #000; line-height: 1.4; }

    @media screen {
      body { background: #c8c8c8; display: flex; flex-direction: column; align-items: center; padding: 20px 12px 40px; }
      .paper { background: #fff; width: 80mm; padding: 6mm 5mm 10mm; box-shadow: 0 3px 16px rgba(0,0,0,.22); }
    }
    @media print {
      html, body { background: #fff; }
      .paper { padding: 3mm 4mm 8mm; }
      .no-print { display: none !important; }
    }

    .hdr { text-align: center; padding-bottom: 8px; }
    .logo { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 6px; }
    .brand { font-size: 14pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .addr { font-size: 8pt; color: #444; margin-top: 3px; line-height: 1.5; }
    .rbadge { display: inline-block; margin-top: 7px; padding: 2px 10px; border: 1px solid #000; font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; }

    .solid  { border: none; border-top: 1.5px solid #000; margin: 8px 0; }
    .dashed { border: none; border-top: 1px dashed #888; margin: 6px 0; }

    .meta { width: 100%; border-collapse: collapse; font-size: 8pt; }
    .meta td { padding: 2px 0; vertical-align: top; }
    .meta td:first-child { color: #555; width: 42%; }
    .meta td:last-child  { font-weight: 700; text-align: right; }

    .items { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .items th { font-size: 7pt; letter-spacing: 1px; text-transform: uppercase; color: #555; padding: 0 0 4px; border-bottom: 1px solid #ccc; text-align: left; }
    .items th:last-child { text-align: right; }
    .items td { padding: 5px 0; vertical-align: top; border-bottom: 1px dotted #ddd; }
    .items .qty   { width: 22px; color: #555; font-size: 8pt; }
    .items .name  { padding-right: 6px; }
    .items .price { text-align: right; font-weight: 700; white-space: nowrap; font-size: 8pt; }
    .note { font-size: 7pt; color: #777; font-style: italic; margin-top: 1px; }

    .totals { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .totals td { padding: 3px 0; }
    .totals td:last-child { text-align: right; }
    .grand td { font-size: 12pt; font-weight: 900; border-top: 1.5px solid #000; padding-top: 6px; }

    .pay-row { display: flex; justify-content: space-between; font-size: 8pt; padding: 2px 0; }
    .sbadge { display: inline-block; padding: 1px 8px; border-radius: 12px; font-size: 7pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .s-paid    { background: #d1fae5; color: #065f46; }
    .s-pending { background: #fef3c7; color: #92400e; }

    .notes-box { border: 1px dashed #bbb; border-radius: 3px; padding: 5px 7px; font-size: 8pt; color: #444; font-style: italic; line-height: 1.5; }

    .loyalty-box { border: 1px dashed #b8952a; border-radius: 3px; padding: 7px; text-align: center; background: #fffbf0; }
    .loyalty-box .pts { font-size: 14pt; font-weight: 900; color: #92400e; }
    .loyalty-box .lbl { font-size: 7pt; color: #92400e; letter-spacing: 1px; text-transform: uppercase; }

    .footer { text-align: center; font-size: 8pt; color: #444; line-height: 1.7; }
    .thanks { font-size: 10pt; font-weight: 900; color: #000; letter-spacing: 1px; margin-bottom: 3px; }
    .powered { font-size: 7pt; color: #999; margin-top: 6px; letter-spacing: 1px; }

    .print-btn { margin-top: 16px; padding: 8px 28px; background: #111; color: #fff; border: none; border-radius: 3px; font-family: inherit; font-size: 12px; cursor: pointer; }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>

<div class="paper">

  <div class="hdr">
    ${restaurantLogo ? `<img src="${restaurantLogo}" alt="${restaurantName}" class="logo">` : ''}
    <div class="brand">${restaurantName}</div>
    <div class="addr">
      ${[restaurantAddress, restaurantCity, restaurantCountry].filter(Boolean).join(', ')}<br>
      ${restaurantPhone}${restaurantEmail ? `<br>${restaurantEmail}` : ''}
    </div>
    <div class="rbadge">Official Receipt</div>
  </div>

  <hr class="solid">

  <table class="meta">
    <tr><td>Order #</td>         <td>${orderNumber}</td></tr>
    <tr><td>Date &amp; Time</td> <td>${formatDateTime(orderDate)}</td></tr>
    <tr><td>Type</td>            <td>${orderTypeDisplay}</td></tr>
    ${tableNumber  ? `<tr><td>Table</td><td>${tableNumber}</td></tr>` : ''}
    <tr><td>Served by</td>       <td>${serverName}</td></tr>
    ${customerName ? `<tr><td>Customer</td><td>${customerName}</td></tr>` : ''}
  </table>

  <hr class="dashed">

  <table class="items">
    <thead><tr><th>Qty</th><th>Item</th><th style="text-align:right">Price</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <hr class="dashed">

  <table class="totals">
    ${taxRate > 0 ? `
    <tr><td style="color:#555">Subtotal</td><td>${fmt(receipt.subtotal)}</td></tr>
    <tr><td style="color:#555">Tax (${taxRate}%)</td><td>${fmt(taxAmount)}</td></tr>` : ''}
    <tr class="grand">
      <td>TOTAL <span style="font-size:7pt;font-weight:400;color:#555">(Tax Incl.)</span></td>
      <td>${fmt(total)}</td>
    </tr>
  </table>

  <hr class="dashed">

  <div class="pay-row"><span style="color:#555">Payment</span><span>${paymentMethod}${cardLast4 ? ` ····${cardLast4}` : ''}</span></div>
  <div class="pay-row">
    <span style="color:#555">Status</span>
    <span class="sbadge ${paymentStatus === 'paid' ? 's-paid' : 's-pending'}">${paymentStatus}</span>
  </div>
  ${amountPaid && amountPaid !== total ? `<div class="pay-row"><span style="color:#555">Amount Paid</span><span>${fmt(amountPaid)}</span></div>` : ''}
  ${change !== undefined && change > 0 ? `<div class="pay-row"><span style="color:#555">Change</span><span>${fmt(change)}</span></div>` : ''}

  ${deliveryAddress ? `
  <hr class="dashed">
  <div style="font-size:8pt;color:#444;line-height:1.6">
    <strong style="color:#000;text-transform:uppercase;letter-spacing:1px;font-size:7pt">Delivery</strong><br>
    ${receipt.deliveryProvider ? `${receipt.deliveryProvider} &middot; ` : ''}${deliveryAddress}
  </div>` : ''}

  ${notes || specialInstructions ? `
  <hr class="dashed">
  <div class="notes-box"><strong>Note:</strong> ${notes || specialInstructions}</div>` : ''}

  ${loyaltyPoints && loyaltyPoints.pointsEarned > 0 ? `
  <hr class="dashed">
  <div class="loyalty-box">
    <div class="lbl">Points Earned This Visit</div>
    <div class="pts">+${loyaltyPoints.pointsEarned} pts</div>
    <div style="font-size:8pt;color:#92400e;margin-top:3px">Balance: ${loyaltyPoints.pointsBalance} pts</div>
  </div>` : ''}

  <hr class="solid">

  <div class="footer">
    <div class="thanks">Thank you for dining with us!</div>
    We hope to see you again soon.<br>
    <span style="font-size:7pt;color:#aaa">${receiptId} &middot; ${new Date().toLocaleString()}</span>
    <div class="powered">Powered by SERVV IQ</div>
  </div>

</div>

<button class="print-btn no-print" onclick="window.print()">Print Receipt</button>

<script>
  if (window.opener || window.name === 'receipt_print') {
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
        window.addEventListener('afterprint', function() {
          setTimeout(function() { window.close(); }, 300);
        });
      }, 300);
    });
  }
<\/script>

</body>
</html>`;
}

// ============================================
// PRINT FUNCTION
// ============================================

/**
 * Open receipt in a named 80mm-wide window.
 * The embedded script auto-prints and auto-closes when opened this way.
 */
export function printReceipt(html: string): void {
  const printWindow = window.open('', 'receipt_print', 'width=302,height=700,toolbar=0,scrollbars=1,status=0');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow pop-ups.');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

// ============================================
// CONVENIENCE FUNCTION
// ============================================

export function printOrderReceipt(
  order: Order,
  options: BuildReceiptOptions
): void {
  const receiptData = orderToReceiptData(order, options);
  const html = buildReceiptHtml(receiptData);
  printReceipt(html);
}

// ============================================
// EXPENSE RECEIPT HELPERS
// ============================================

export interface ExpenseReceiptData {
  id: string;
  referenceNumber?: string;
  category?: { name: string };
  vendorName?: string;
  description: string;
  amount: number;
  currency: string;
  taxRate: number;
  taxAmount?: number;
  expenseDate: string;
  paymentMethod?: string;
  paymentStatus: string;
  approvalStatus: string;
  notes?: string;
}

/**
 * Build HTML receipt for an expense — 80mm thermal-optimised, matches order receipt style.
 */
export function buildExpenseReceiptHtml(
  expense: ExpenseReceiptData,
  restaurantName = 'Company',
  restaurantAddress = '',
  restaurantPhone = '',
  restaurantLogo = ''
): string {
  const taxAmount = expense.taxAmount !== undefined
    ? expense.taxAmount
    : (expense.amount * expense.taxRate) / 100;
  const total = expense.amount + taxAmount;
  const receiptRef = expense.referenceNumber || expense.id.slice(0, 8).toUpperCase();
  const paymentMethod = (expense.paymentMethod || 'cash').replace(/_/g, ' ');
  const approvalStatus = expense.approvalStatus;

  const fmt = (v: number) => expense.currency === 'RWF'
    ? 'RWF ' + Math.round(v).toLocaleString('en-US')
    : `${expense.currency} ${v.toFixed(2)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Expense Receipt #${receiptRef}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 9pt; color: #000; line-height: 1.4; }

    @media screen {
      body { background: #c8c8c8; display: flex; flex-direction: column; align-items: center; padding: 20px 12px 40px; }
      .paper { background: #fff; width: 80mm; padding: 6mm 5mm 10mm; box-shadow: 0 3px 16px rgba(0,0,0,.22); }
    }
    @media print {
      html, body { background: #fff; }
      .paper { padding: 3mm 4mm 8mm; }
      .no-print { display: none !important; }
    }

    .hdr { text-align: center; padding-bottom: 8px; }
    .logo { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 6px; }
    .brand { font-size: 14pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .sub { font-size: 8pt; color: #444; margin-top: 3px; line-height: 1.5; }
    .rbadge { display: inline-block; margin-top: 7px; padding: 2px 10px; border: 1px solid #000; font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; }

    .solid  { border: none; border-top: 1.5px solid #000; margin: 8px 0; }
    .dashed { border: none; border-top: 1px dashed #888; margin: 6px 0; }

    .meta { width: 100%; border-collapse: collapse; font-size: 8pt; }
    .meta td { padding: 2px 0; vertical-align: top; }
    .meta td:first-child { color: #555; width: 45%; }
    .meta td:last-child  { font-weight: 700; text-align: right; }

    .desc-lbl { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: #555; margin-bottom: 3px; }
    .desc-box { font-size: 8pt; line-height: 1.5; color: #333; border-top: 1px dotted #ddd; border-bottom: 1px dotted #ddd; padding: 6px 0; margin: 3px 0; }

    .totals { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .totals td { padding: 3px 0; }
    .totals td:last-child { text-align: right; }
    .grand td { font-size: 12pt; font-weight: 900; border-top: 1.5px solid #000; padding-top: 6px; }

    .pay-row { display: flex; justify-content: space-between; font-size: 8pt; padding: 2px 0; }
    .sbadge { display: inline-block; padding: 1px 8px; border-radius: 12px; font-size: 7pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .s-paid     { background: #d1fae5; color: #065f46; }
    .s-pending  { background: #fef3c7; color: #92400e; }
    .s-approved { background: #d1fae5; color: #065f46; }
    .s-rejected { background: #fee2e2; color: #991b1b; }
    .s-draft    { background: #f1f5f9; color: #475569; }

    .notes-box { border: 1px dashed #bbb; border-radius: 3px; padding: 5px 7px; font-size: 8pt; color: #444; font-style: italic; line-height: 1.5; }

    .footer { text-align: center; font-size: 8pt; color: #444; line-height: 1.7; }
    .thanks { font-size: 10pt; font-weight: 900; color: #000; letter-spacing: 1px; margin-bottom: 3px; }
    .powered { font-size: 7pt; color: #999; margin-top: 6px; letter-spacing: 1px; }

    .print-btn { margin-top: 16px; padding: 8px 28px; background: #111; color: #fff; border: none; border-radius: 3px; font-family: inherit; font-size: 12px; cursor: pointer; }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>
<div class="paper">

  <div class="hdr">
    ${restaurantLogo ? `<img src="${restaurantLogo}" alt="${restaurantName}" class="logo">` : ''}
    <div class="brand">${restaurantName}</div>
    ${restaurantAddress || restaurantPhone ? `<div class="sub">${[restaurantAddress, restaurantPhone].filter(Boolean).join('<br>')}</div>` : ''}
    <div class="rbadge">Expense Receipt</div>
  </div>

  <hr class="solid">

  <table class="meta">
    <tr><td>Receipt #</td>  <td>${receiptRef}</td></tr>
    <tr><td>Date</td>       <td>${new Date(expense.expenseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td></tr>
    <tr><td>Generated</td>  <td>${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td></tr>
    ${expense.category?.name ? `<tr><td>Category</td><td>${expense.category.name}</td></tr>` : ''}
    ${expense.vendorName ? `<tr><td>Vendor</td><td>${expense.vendorName}</td></tr>` : ''}
  </table>

  <hr class="dashed">

  <div class="desc-lbl">Description</div>
  <div class="desc-box">${expense.description}</div>

  <hr class="dashed">

  <table class="totals">
    <tr><td style="color:#555">Subtotal</td><td>${fmt(expense.amount)}</td></tr>
    ${taxAmount > 0 ? `<tr><td style="color:#555">Tax (${expense.taxRate}%)</td><td>${fmt(taxAmount)}</td></tr>` : ''}
    <tr class="grand"><td>TOTAL</td><td>${fmt(total)}</td></tr>
  </table>

  <hr class="dashed">

  <div class="pay-row">
    <span style="color:#555">Payment</span>
    <span style="text-transform:capitalize">${paymentMethod}</span>
  </div>
  <div class="pay-row">
    <span style="color:#555">Payment Status</span>
    <span class="sbadge s-${expense.paymentStatus}">${expense.paymentStatus}</span>
  </div>
  <div class="pay-row">
    <span style="color:#555">Approval</span>
    <span class="sbadge s-${approvalStatus}">${approvalStatus.replace(/_/g, ' ')}</span>
  </div>

  ${expense.notes ? `
  <hr class="dashed">
  <div class="notes-box"><strong>Note:</strong> ${expense.notes}</div>` : ''}

  <hr class="solid">

  <div class="footer">
    <div class="thanks">Thank you!</div>
    <span style="font-size:7pt;color:#aaa">${receiptRef} &middot; ${new Date().toLocaleString()}</span>
    <div class="powered">Powered by SERVV IQ</div>
  </div>

</div>
<button class="print-btn no-print" onclick="window.print()">Print Receipt</button>

<script>
  if (window.opener || window.name === 'receipt_print') {
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
        window.addEventListener('afterprint', function() {
          setTimeout(function() { window.close(); }, 300);
        });
      }, 300);
    });
  }
<\/script>
</body>
</html>`;
}

export function downloadExpenseReceiptHtml(html: string, filename?: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'expense-receipt.html';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printExpenseReceipt(html: string): void {
  const printWindow = window.open('', 'receipt_print', 'width=302,height=700,toolbar=0,scrollbars=1,status=0');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow pop-ups.');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
