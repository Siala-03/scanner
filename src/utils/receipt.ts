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
  restaurantLogo?: string;
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
  currency: 'USD';
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
  const receiptId = `RCP-${orderNumber}-${Date.now().toString(36).toUpperCase()}`;
  
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
      category: item.menuItem?.category
    };
  });

  // Calculate subtotal from items
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  
  // Calculate tax
  const taxAmount = (subtotal * options.taxRate) / 100;
  
  // Calculate total
  const total = subtotal + taxAmount;

  // Convert total to RWF for loyalty points calculation (assuming 1 USD = 1300 RWF)
  const exchangeRate = 1300;
  const totalRWF = total * exchangeRate;
  
  // Calculate loyalty points
  const loyaltyCalc = calculateLoyaltyPoints(totalRWF);
  const loyaltyPoints = options.customerPointsBalance !== undefined ? {
    ...loyaltyCalc,
    pointsBalance: options.customerPointsBalance + loyaltyCalc.pointsEarned
  } : undefined;

  // Determine order type
  const orderType = options.orderType || (order.deliveryAddress ? 'delivery' : 'dine-in');

  return {
    // Restaurant Info
    restaurantName: options.restaurantName,
    restaurantAddress: options.restaurantAddress,
    restaurantPhone: options.restaurantPhone,
    restaurantEmail: options.restaurantEmail,
    
    // Order Info
    orderNumber,
    receiptId,
    orderType,
    tableNumber: order.tableNumber,
    serverName: options.serverName,
    orderDate: order.createdAt,

    // Customer Info
    customerName: options.customerName || order.customerName,
    customerId: order.customerId,

    // Items
    items,

    // Financials
    currency: 'USD',
    subtotal,
    taxRate: options.taxRate,
    taxAmount,
    total,

    // Payment
    paymentMethod: options.paymentMethod || 'Cash',
    paymentStatus: options.paymentStatus || 'paid',
    amountPaid: options.amountPaid || total,
    change: options.amountPaid ? options.amountPaid - total : undefined,
    cardLast4: options.cardLast4,

    // Delivery Info
    deliveryAddress: order.deliveryAddress,
    deliveryProvider: order.deliveryProvider,
    deliveryFee: 0,

    // Loyalty Points
    loyaltyPoints,

    // Additional
    notes: options.notes || order.notes,
    specialInstructions: order.specialInstructions
  };
}

// ============================================
// HTML RECEIPT GENERATION
// ============================================

/**
 * Generate a professional HTML receipt for printing
 */
export function buildReceiptHtml(receipt: ReceiptData): string {
  const {
    restaurantName,
    restaurantAddress,
    restaurantPhone,
    restaurantEmail,
    orderNumber,
    receiptId,
    orderType,
    tableNumber,
    serverName,
    orderDate,
    customerName,
    items,
    currency,
    subtotal,
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

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt - ${orderNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Courier New', monospace;
      background: #f5f5f5;
      padding: 20px;
      color: #1a1a1a;
    }
    
    .receipt {
      max-width: 400px;
      margin: 0 auto;
      background: white;
      padding: 24px;
      border: 1px solid #e5e5e5;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 16px;
    }
    
    .restaurant-name {
      font-size: 1.4rem;
      font-weight: bold;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .restaurant-info {
      font-size: 0.85rem;
      line-height: 1.4;
      color: #555;
    }
    
    .receipt-title {
      text-align: center;
      font-size: 1.1rem;
      font-weight: bold;
      margin: 16px 0;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .meta-info {
      font-size: 0.85rem;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    
    .meta-label {
      font-weight: bold;
    }
    
    .section {
      margin: 16px 0;
    }
    
    .section-title {
      font-weight: bold;
      font-size: 0.9rem;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    
    .items-table th {
      text-align: left;
      padding: 8px 0;
      border-bottom: 2px solid #1a1a1a;
      font-weight: bold;
    }
    
    .items-table td {
      padding: 6px 0;
      vertical-align: top;
    }
    
    .item-row {
      border-bottom: 1px dotted #ccc;
    }
    
    .item-qty {
      width: 40px;
      font-weight: bold;
    }
    
    .item-name {
      flex: 1;
    }
    
    .item-note {
      font-size: 0.75rem;
      color: #666;
      font-style: italic;
      margin-top: 2px;
    }
    
    .item-price {
      text-align: right;
      font-weight: bold;
      white-space: nowrap;
    }
    
    .totals-table {
      width: 100%;
      font-size: 0.9rem;
    }
    
    .totals-table td {
      padding: 6px 0;
    }
    
    .totals-table .total-row {
      font-weight: bold;
      font-size: 1.1rem;
      border-top: 2px solid #1a1a1a;
      padding-top: 8px;
      margin-top: 4px;
    }
    
    .text-right {
      text-align: right;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 0.85rem;
    }
    
    .info-row .label {
      color: #555;
    }
    
    .info-row.highlight {
      font-weight: bold;
      font-size: 1rem;
      color: #1a1a1a;
    }
    
    .info-row.small {
      font-size: 0.75rem;
      color: #666;
      justify-content: flex-start;
    }
    
    .loyalty-section {
      background: #f9f9f9;
      padding: 12px;
      border: 1px dashed #ccc;
      text-align: center;
    }
    
    .loyalty-section .section-title {
      text-align: center;
      margin-bottom: 12px;
    }
    
    .loyalty-section .info-row {
      justify-content: center;
      gap: 8px;
    }
    
    .notes-content {
      font-size: 0.85rem;
      color: #555;
      font-style: italic;
      line-height: 1.4;
    }
    
    .footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 2px solid #1a1a1a;
    }
    
    .footer-message {
      font-size: 1rem;
      font-weight: bold;
      margin-bottom: 8px;
    }
    
    .footer-info {
      font-size: 0.75rem;
      color: #666;
      line-height: 1.4;
    }
    
    .barcode {
      text-align: center;
      margin: 16px 0;
      font-size: 0.75rem;
      letter-spacing: 2px;
      word-break: break-all;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      
      .receipt {
        box-shadow: none;
        border: none;
        max-width: 100%;
        padding: 16px;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <!-- Header -->
    <div class="header">
      <div class="restaurant-name">${restaurantName}</div>
      <div class="restaurant-info">
        ${restaurantAddress}<br>
        ${restaurantPhone}<br>
        ${restaurantEmail || ''}
      </div>
    </div>

    <!-- Receipt Title -->
    <div class="receipt-title">Receipt</div>

    <!-- Order Meta Info -->
    <div class="meta-info">
      <div class="meta-row">
        <span class="meta-label">Order #:</span>
        <span>${orderNumber}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Receipt ID:</span>
        <span>${receiptId}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Date:</span>
        <span>${formatDateTime(orderDate)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Type:</span>
        <span>${orderTypeDisplay}</span>
      </div>
      ${tableNumber ? `
      <div class="meta-row">
        <span class="meta-label">Table:</span>
        <span>${tableNumber}</span>
      </div>
      ` : ''}
      <div class="meta-row">
        <span class="meta-label">Server:</span>
        <span>${serverName}</span>
      </div>
      ${customerName ? `
      <div class="meta-row">
        <span class="meta-label">Customer:</span>
        <span>${customerName}</span>
      </div>
      ` : ''}
    </div>

    <!-- Items Section -->
    <div class="section">
      <div class="section-title">Items</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Qty</th>
            <th>Item</th>
            <th style="text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Totals Section -->
    <div class="section">
      <table class="totals-table">
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td class="text-right">${formatCurrency(subtotal, currency)}</td>
          </tr>
          ${taxLine}
          <tr class="total-row">
            <td>TOTAL</td>
            <td class="text-right">${formatCurrency(total, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Payment Info -->
    <div class="section">
      <div class="section-title">Payment</div>
      <table class="totals-table">
        <tbody>
          ${paymentInfo}
        </tbody>
      </table>
    </div>

    <!-- Delivery Info -->
    ${deliveryInfo}

    <!-- Loyalty Points -->
    ${loyaltySection}

    <!-- Notes -->
    ${notesSection}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-message">Thank you for dining with us!</div>
      <div class="footer-info">
        We hope to see you again soon.<br>
        Receipt ID: ${receiptId}<br>
        Generated: ${new Date().toLocaleString()}
      </div>
    </div>
  </div>

  <!-- Print Button (hidden when printing) -->
  <div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="
      padding: 12px 24px;
      font-size: 1rem;
      background: #1a1a1a;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    ">
      Print Receipt
    </button>
  </div>

  <script>
    // Auto-print on load (optional - remove if not desired)
    // window.onload = function() {
    //   window.print();
    // };
  </script>
</body>
</html>
  `;
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
  restaurantName = 'Restaurant Name',
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