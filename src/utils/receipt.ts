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
  const threshold = 5000; // Minimum order amount to earn points
  const pointsPerUnit = 1; // 1 point per 1,000 RWF
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
  taxRate: number; // Configurable by manager (e.g., 18 for 18%)
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
  restaurantLogo?: string;    // base64 data URL or https URL
  restaurantCity?: string;
  restaurantCountry?: string;
  taxRate: number; // e.g., 18 for 18%
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

/**
 * Convert an Order object to ReceiptData
 */
export function orderToReceiptData(
  order: Order,
  options: BuildReceiptOptions
): ReceiptData {
  const orderNumber = order.orderNumber || order.id;
  // Receipt ID == Order ID (no separate generated ID)
  const receiptId = orderNumber;

  // Convert order items to receipt items
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

  // Use the order's actual total (already tax-inclusive) — no recalculation
  const total = order.total ?? items.reduce((s, i) => s + i.totalPrice, 0);

  // Loyalty points based on RWF total
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
    orderDate: new Date(), // generation time, not order creation time

    customerName: options.customerName || order.customerName,
    customerId: order.customerId,

    items,

    currency: 'RWF',
    subtotal: total,   // total is tax-inclusive; no separate subtotal/tax split
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
 * Generate a professional HTML receipt for printing.
 * Designed for 80 mm thermal printers and screen display.
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

  // Format order type for display
  const orderTypeDisplay = orderType.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  // Generate items HTML
  const itemsHtml = items.map(item => `
    <tr class="item-row">
      <td class="item-qty">${item.quantity}x</td>
      <td class="item-name">
        ${item.name}
        ${item.specialInstructions ? `<div class="item-note">- ${item.specialInstructions}</div>` : ''}
      </td>
      <td class="item-price">${formatCurrency(item.totalPrice, currency)}</td>
    </tr>
  `).join('');

  // Generate tax line
  const taxLine = taxRate > 0 ? `
    <tr>
      <td colspan="2">Tax (${taxRate}%)</td>
      <td class="text-right">${formatCurrency(taxAmount, currency)}</td>
    </tr>
  ` : '';

  // Generate payment info
  const paymentInfo = `
    <tr>
      <td colspan="2">Payment Method</td>
      <td class="text-right">${paymentMethod}${cardLast4 ? ` (****${cardLast4})` : ''}</td>
    </tr>
    <tr>
      <td colspan="2">Status</td>
      <td class="text-right">${paymentStatus.toUpperCase()}</td>
    </tr>
    ${amountPaid ? `
    <tr>
      <td colspan="2">Amount Paid</td>
      <td class="text-right">${formatCurrency(amountPaid, currency)}</td>
    </tr>
    ` : ''}
    ${change !== undefined && change > 0 ? `
    <tr>
      <td colspan="2">Change</td>
      <td class="text-right">${formatCurrency(change, currency)}</td>
    </tr>
    ` : ''}
  `;

  // Generate delivery info
  const deliveryInfo = deliveryAddress ? `
    <div class="section">
      <div class="section-title">Delivery Information</div>
      <div class="info-row">
        <span class="label">Address:</span>
        <span class="value">${deliveryAddress}</span>
      </div>
      ${receipt.deliveryProvider ? `
      <div class="info-row">
        <span class="label">Provider:</span>
        <span class="value">${receipt.deliveryProvider}</span>
      </div>
      ` : ''}
    </div>
  ` : '';

  // Generate loyalty points section
  const loyaltySection = loyaltyPoints ? `
    <div class="section loyalty-section">
      <div class="section-title">★ Loyalty Points ★</div>
      <div class="info-row">
        <span class="label">Order Amount:</span>
        <span class="value">${formatCurrency(loyaltyPoints.orderAmountRWF, 'RWF')}</span>
      </div>
      <div class="info-row highlight">
        <span class="label">Points Earned:</span>
        <span class="value">+${loyaltyPoints.pointsEarned} pts</span>
      </div>
      <div class="info-row small">
        <span class="label">${loyaltyPoints.calculationNote}</span>
      </div>
      <div class="info-row">
        <span class="label">Total Balance:</span>
        <span class="value">${loyaltyPoints.pointsBalance} pts</span>
      </div>
    </div>
  ` : '';

  // Generate notes section
  const notesSection = notes || specialInstructions ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <div class="notes-content">
        ${notes || ''}
        ${specialInstructions ? `<div>${specialInstructions}</div>` : ''}
      </div>
    </div>
  ` : '';

  const dashedLine = '- '.repeat(24);
  const solidLine  = '─'.repeat(48);

  const itemsHtmlNew = items.map(item => `
    <tr>
      <td class="qty">${item.quantity}×</td>
      <td class="name">
        ${item.name}
        ${item.specialInstructions ? `<div class="note">↳ ${item.specialInstructions}</div>` : ''}
      </td>
      <td class="price">${formatCurrency(item.totalPrice, currency)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt #${orderNumber}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      background: #f0f0f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 12px 40px;
      color: #111;
    }

    /* ── Paper ── */
    .receipt {
      width: 100%;
      max-width: 380px;
      background: #fff;
      padding: 28px 24px 24px;
      box-shadow: 0 4px 24px rgba(0,0,0,.12);
      border-radius: 4px;
    }

    /* ── Header ── */
    .header { text-align: center; padding-bottom: 16px; }
    .logo   { max-height: 72px; max-width: 180px; object-fit: contain; margin: 0 auto 10px; display: block; }
    .brand  { font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; }
    .sub    { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.5; }
    .badge  {
      display: inline-block;
      margin-top: 10px;
      padding: 3px 12px;
      border: 1px solid #111;
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    /* ── Dividers ── */
    .line-solid  { border: none; border-top: 2px solid #111; margin: 14px 0; }
    .line-dashed { border: none; border-top: 1px dashed #999; margin: 12px 0; }

    /* ── Meta grid ── */
    .meta { width: 100%; font-size: 12px; border-collapse: collapse; }
    .meta td { padding: 3px 0; vertical-align: top; }
    .meta td:first-child { color: #555; width: 50%; }
    .meta td:last-child  { font-weight: 600; text-align: right; }

    /* ── Items ── */
    .items { width: 100%; border-collapse: collapse; font-size: 13px; }
    .items th {
      text-align: left; font-size: 10px; letter-spacing: 1.5px;
      text-transform: uppercase; color: #555;
      padding: 0 0 6px; border-bottom: 1px solid #ddd;
    }
    .items th:last-child { text-align: right; }
    .items td { padding: 7px 0; vertical-align: top; border-bottom: 1px dotted #e5e5e5; }
    .items .qty   { width: 28px; color: #555; }
    .items .name  { padding-right: 8px; }
    .items .price { text-align: right; font-weight: 600; white-space: nowrap; }
    .note { font-size: 11px; color: #888; font-style: italic; margin-top: 2px; }

    /* ── Totals ── */
    .totals { width: 100%; border-collapse: collapse; font-size: 13px; }
    .totals td { padding: 4px 0; }
    .totals td:last-child { text-align: right; }
    .totals .grand td {
      font-size: 16px; font-weight: 900;
      border-top: 2px solid #111; padding-top: 10px; margin-top: 6px;
      letter-spacing: .5px;
    }

    /* ── Payment badge ── */
    .payment-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 3px 0; }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .status-paid    { background: #d1fae5; color: #065f46; }
    .status-pending { background: #fef3c7; color: #92400e; }

    /* ── Notes ── */
    .notes-box {
      background: #fafafa;
      border: 1px dashed #ccc;
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 11px;
      color: #555;
      font-style: italic;
      line-height: 1.5;
    }

    /* ── Loyalty ── */
    .loyalty-box {
      border: 1px dashed #c0a060;
      border-radius: 4px;
      padding: 10px;
      text-align: center;
      background: #fffbf0;
    }
    .loyalty-box .pts { font-size: 18px; font-weight: 900; color: #92400e; }
    .loyalty-box .lbl { font-size: 10px; color: #92400e; letter-spacing: 1px; text-transform: uppercase; }

    /* ── Footer ── */
    .footer { text-align: center; font-size: 11px; color: #555; line-height: 1.7; }
    .footer .thanks { font-size: 14px; font-weight: 800; color: #111; letter-spacing: 1px; margin-bottom: 4px; }
    .powered { font-size: 10px; color: #bbb; margin-top: 8px; letter-spacing: 1px; }

    /* ── Screen-only print button ── */
    .print-btn {
      margin-top: 20px;
      padding: 10px 32px;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      letter-spacing: 1px;
    }
    .print-btn:hover { background: #333; }

    @media print {
      body { background: #fff; padding: 0; }
      .receipt { box-shadow: none; max-width: 100%; padding: 8px; border-radius: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

<div class="receipt">

  <!-- ── HEADER ── -->
  <div class="header">
    ${restaurantLogo ? `<img src="${restaurantLogo}" alt="${restaurantName} logo" class="logo">` : ''}
    <div class="brand">${restaurantName}</div>
    <div class="sub">
      ${[restaurantAddress, restaurantCity, restaurantCountry].filter(Boolean).join(', ')}<br>
      ${restaurantPhone}${restaurantEmail ? `<br>${restaurantEmail}` : ''}
    </div>
    <div class="badge">Official Receipt</div>
  </div>

  <hr class="line-solid">

  <!-- ── ORDER META ── -->
  <table class="meta">
    <tr><td>Order #</td>         <td>${orderNumber}</td></tr>
    <tr><td>Receipt ID</td>      <td>${receiptId}</td></tr>
    <tr><td>Date &amp; Time</td> <td>${formatDateTime(orderDate)}</td></tr>
    <tr><td>Type</td>            <td>${orderTypeDisplay}</td></tr>
    ${tableNumber  ? `<tr><td>Table</td><td>${tableNumber}</td></tr>` : ''}
    <tr><td>Served by</td>       <td>${serverName}</td></tr>
    ${customerName ? `<tr><td>Customer</td><td>${customerName}</td></tr>` : ''}
  </table>

  <hr class="line-dashed">

  <!-- ── ITEMS ── -->
  <table class="items">
    <thead>
      <tr>
        <th>Qty</th>
        <th>Item</th>
        <th style="text-align:right">Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtmlNew}
    </tbody>
  </table>

  <hr class="line-dashed">

  <!-- ── TOTALS ── -->
  <table class="totals">
    <tr class="grand">
      <td>TOTAL <span style="font-size:10px;font-weight:400;color:#555">(Tax Incl.)</span></td>
      <td>${formatCurrency(total, currency)}</td>
    </tr>
  </table>

  <hr class="line-dashed">

  <!-- ── PAYMENT ── -->
  <div class="payment-row">
    <span style="color:#555">Payment</span>
    <span>${paymentMethod}${cardLast4 ? ` ····${cardLast4}` : ''}</span>
  </div>
  <div class="payment-row">
    <span style="color:#555">Status</span>
    <span class="status-badge ${paymentStatus === 'paid' ? 'status-paid' : 'status-pending'}">${paymentStatus}</span>
  </div>
  ${amountPaid && amountPaid !== total ? `
  <div class="payment-row"><span style="color:#555">Amount Paid</span><span>${formatCurrency(amountPaid, currency)}</span></div>
  ` : ''}
  ${change !== undefined && change > 0 ? `
  <div class="payment-row"><span style="color:#555">Change</span><span>${formatCurrency(change, currency)}</span></div>
  ` : ''}

  <!-- ── DELIVERY ── -->
  ${deliveryAddress ? `
  <hr class="line-dashed">
  <div style="font-size:11px;color:#555;line-height:1.6">
    <strong style="color:#111;text-transform:uppercase;letter-spacing:1px;font-size:10px">Delivery</strong><br>
    ${receipt.deliveryProvider ? `${receipt.deliveryProvider} · ` : ''}${deliveryAddress}
  </div>` : ''}

  <!-- ── NOTES ── -->
  ${notes || specialInstructions ? `
  <hr class="line-dashed">
  <div class="notes-box">
    <strong>Note:</strong> ${notes || specialInstructions}
  </div>` : ''}

  <!-- ── LOYALTY ── -->
  ${loyaltyPoints && loyaltyPoints.pointsEarned > 0 ? `
  <hr class="line-dashed">
  <div class="loyalty-box">
    <div class="lbl">Points Earned This Visit</div>
    <div class="pts">+${loyaltyPoints.pointsEarned} pts</div>
    <div style="font-size:11px;color:#92400e;margin-top:4px">Balance: ${loyaltyPoints.pointsBalance} pts</div>
  </div>` : ''}

  <hr class="line-solid">

  <!-- ── FOOTER ── -->
  <div class="footer">
    <div class="thanks">Thank you for dining with us!</div>
    We hope to see you again soon.<br>
    <span style="font-size:10px;color:#aaa">${receiptId} · ${new Date().toLocaleString()}</span>
    <div class="powered">Powered by SERVV IQ</div>
  </div>

</div>

<!-- Screen-only print button -->
<button class="print-btn no-print" onclick="window.print()">Print Receipt</button>

</body>
</html>`;
}

// ============================================
// PRINT FUNCTION
// ============================================

/**
 * Open receipt in a new window and trigger print
 */
export function printReceipt(html: string): void {
  const printWindow = window.open('', '_blank', 'width=450,height=800');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow pop-ups.');
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load before printing
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };
}

// ============================================
// CONVENIENCE FUNCTION
// ============================================

/**
 * Build and print receipt from an order in one step
 */
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
 * Build HTML receipt for an expense
 */
export function buildExpenseReceiptHtml(
  expense: ExpenseReceiptData,
  restaurantName = 'Company Name',
  restaurantAddress = '123 Main St',
  restaurantPhone = '(555) 123-4567'
): string {
  const taxAmount = expense.taxAmount !== undefined ? expense.taxAmount : (expense.amount * expense.taxRate) / 100;
  const total = expense.amount + taxAmount;
  const receiptDate = new Date(expense.expenseDate).toLocaleDateString();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expense Receipt - ${expense.referenceNumber || expense.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f8fafc; color: #1a1a1a; }
    .receipt { max-width: 600px; margin: 20px auto; background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
    .header h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .header p { font-size: 0.9rem; color: #64748b; }
    .title { text-align: center; font-size: 1.1rem; font-weight: bold; margin: 20px 0; text-transform: uppercase; }
    .section { margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #64748b; }
    .value { color: #1a1a1a; }
    .total-section { margin-top: 16px; padding-top: 16px; border-top: 2px solid #1a1a1a; }
    .total-row { display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 700; padding: 8px 0; }
    .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.9rem; color: #64748b; }
    @media print {
      body { background: white; }
      .receipt { box-shadow: none; border: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>${restaurantName}</h1>
      <p>${restaurantAddress}</p>
      <p>${restaurantPhone}</p>
    </div>

    <div class="title">EXPENSE RECEIPT</div>

    <div class="section">
      <div class="row">
        <span class="label">Receipt #:</span>
        <span class="value">${expense.referenceNumber || expense.id}</span>
      </div>
      <div class="row">
        <span class="label">Date:</span>
        <span class="value">${receiptDate}</span>
      </div>
      <div class="row">
        <span class="label">Category:</span>
        <span class="value">${expense.category?.name || 'N/A'}</span>
      </div>
      <div class="row">
        <span class="label">Vendor:</span>
        <span class="value">${expense.vendorName || 'N/A'}</span>
      </div>
    </div>

    <div class="section">
      <div class="label" style="margin-bottom: 8px;">Description:</div>
      <div style="padding: 8px 0;">${expense.description}</div>
    </div>

    <div class="total-section">
      <div class="row">
        <span class="label">Subtotal:</span>
        <span class="value">${expense.currency} ${Number(expense.amount).toFixed(2)}</span>
      </div>
      ${expense.taxRate > 0 || (expense.taxAmount !== undefined && expense.taxAmount > 0) ? `
      <div class="row">
        <span class="label">Tax (${expense.taxRate}%):</span>
        <span class="value">${expense.currency} ${Number(taxAmount).toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="total-row" style="margin-top: 8px;">
        <span>TOTAL:</span>
        <span>${expense.currency} ${Number(total).toFixed(2)}</span>
      </div>
    </div>

    <div class="section">
      <div class="row">
        <span class="label">Payment Method:</span>
        <span class="value">${(expense.paymentMethod || 'cash').replace(/_/g, ' ').toUpperCase()}</span>
      </div>
      <div class="row">
        <span class="label">Payment Status:</span>
        <span class="value">${expense.paymentStatus.toUpperCase()}</span>
      </div>
    </div>

    ${expense.notes ? `
    <div class="section">
      <div class="label" style="margin-bottom: 8px;">Notes:</div>
      <div style="padding: 8px 0; background: #f1f5f9; border-radius: 4px; padding: 8px;">${expense.notes}</div>
    </div>
    ` : ''}

    <div class="footer">
      <p>Thank you for your business!</p>
      <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
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

/**
 * Print an expense receipt
 */
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
  const printWindow = window.open('', '_blank', 'width=700,height=900');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow pop-ups.');
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}