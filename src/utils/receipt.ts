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
// PAYMENT TYPES
// ============================================

export interface PaymentEntry {
  method: string;    // 'Cash', 'Mobile Money', 'Card', 'Bank Transfer', etc.
  amount: number;
  reference?: string; // MOMO transaction ID, card last 4, etc.
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
  restaurantMomoCode?: string;
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
  payments: PaymentEntry[];
  paymentStatus: 'paid' | 'pending' | 'partial';
  change?: number;

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

  // OSDC / EBM fiscal metadata
  osdcVenueTin?: string;
  osdcBranchId?: string;
  osdcReceiptNo?: number | string;
  osdcReceiptSign?: string;
  osdcInternalData?: string;
  osdcSdcDateTime?: string;
  osdcQrData?: string;
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
  restaurantMomoCode?: string;
  taxRate: number;
  serverName: string;
  orderType?: 'dine-in' | 'takeout' | 'delivery';
  customerName?: string;
  payments?: PaymentEntry[];       // preferred: full split-payment list
  paymentMethod?: string;          // legacy: single method name
  paymentStatus?: 'paid' | 'pending' | 'partial';
  amountPaid?: number;             // legacy: single amount paid
  cardLast4?: string;              // legacy: card reference
  change?: number;                 // explicit change override (auto-computed if omitted)
  customerPointsBalance?: number;
  notes?: string;
  osdcVenueTin?: string;
  osdcBranchId?: string;
  osdcReceiptNo?: number | string;
  osdcReceiptSign?: string;
  osdcInternalData?: string;
  osdcSdcDateTime?: string;
  osdcQrData?: string;
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
    restaurantMomoCode: options.restaurantMomoCode,

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

    payments: options.payments ?? [{
      method: options.paymentMethod || 'Cash',
      amount: options.amountPaid ?? total,
      reference: options.cardLast4 ? `****${options.cardLast4}` : undefined,
    }],
    paymentStatus: options.paymentStatus || 'paid',
    change: (() => {
      if (options.change !== undefined) return options.change;
      const pmts = options.payments ?? [{ amount: options.amountPaid ?? total }];
      const paid = pmts.reduce((s, p) => s + p.amount, 0);
      return paid > total ? paid - total : undefined;
    })(),

    deliveryAddress: order.deliveryAddress,
    deliveryProvider: order.deliveryProvider,
    deliveryFee: 0,

    loyaltyPoints,

    notes: options.notes || order.notes,
    specialInstructions: order.specialInstructions,

    osdcVenueTin: options.osdcVenueTin,
    osdcBranchId: options.osdcBranchId,
    osdcReceiptNo: options.osdcReceiptNo ?? order.ebmRcptNo,
    osdcReceiptSign: options.osdcReceiptSign ?? order.ebmRcptSign,
    osdcInternalData: options.osdcInternalData,
    osdcSdcDateTime: options.osdcSdcDateTime ?? (order.ebmFiscalizedAt ? new Date(order.ebmFiscalizedAt).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) : undefined),
    osdcQrData: options.osdcQrData,
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
    restaurantMomoCode,
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
    payments,
    paymentStatus,
    change,
    deliveryAddress,
    loyaltyPoints,
    notes,
    specialInstructions,
    osdcVenueTin,
    osdcBranchId,
    osdcReceiptNo,
    osdcReceiptSign,
    osdcInternalData,
    osdcSdcDateTime,
    osdcQrData
  } = receipt;

  // RWF: no decimals; other currencies: standard formatting
  const fmt = (v: number) => currency === 'RWF'
    ? 'RWF ' + Math.round(v).toLocaleString('en-US')
    : formatCurrency(v, currency);

  const orderTypeDisplay = (orderType ?? 'dine-in').split('-').map((w: string) =>
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');

  const computedQrData = osdcQrData || (
    osdcVenueTin && osdcBranchId && osdcReceiptNo && osdcSdcDateTime && osdcReceiptSign
      ? `${osdcVenueTin}|${osdcBranchId}|${osdcReceiptNo}|${osdcSdcDateTime}|${osdcReceiptSign}`
      : undefined
  );
  const qrImageUrl = computedQrData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=2&data=${encodeURIComponent(computedQrData)}`
    : undefined;

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
    body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 10pt; color: #000; line-height: 1.45; }

    @media screen {
      body { background: #c8c8c8; display: flex; flex-direction: column; align-items: center; padding: 20px 12px 40px; }
      .paper { background: #fff; width: 80mm; padding: 6mm 5mm 10mm; box-shadow: 0 3px 16px rgba(0,0,0,.22); }
    }
    @media print {
      html, body { background: #fff; display: block; }
      .paper { padding: 3mm 4mm 14mm; }
      .footer { page-break-inside: avoid; }
      .no-print { display: none !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    .hdr { text-align: center; padding-bottom: 8px; }
    .logo { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 6px; }
    .brand { font-size: 15pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .addr { font-size: 9pt; color: #333; margin-top: 3px; line-height: 1.5; }
    .rbadge { display: inline-block; margin-top: 7px; padding: 2px 10px; border: 1.5px solid #000; font-size: 8pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

    .solid  { border: none; border-top: 2px solid #000; margin: 8px 0; }
    .dashed { border: none; border-top: 1px dashed #666; margin: 6px 0; }

    .meta { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .meta td { padding: 2px 0; vertical-align: top; }
    .meta td:first-child { color: #333; width: 42%; }
    .meta td:last-child  { font-weight: 700; text-align: right; }

    .items { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .items th { font-size: 8pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #333; padding: 0 0 4px; border-bottom: 1.5px solid #000; text-align: left; }
    .items th:last-child { text-align: right; }
    .items td { padding: 5px 0; vertical-align: top; border-bottom: 1px dotted #bbb; }
    .items .qty   { width: 24px; color: #333; font-size: 9pt; }
    .items .name  { padding-right: 6px; }
    .items .price { text-align: right; font-weight: 700; white-space: nowrap; font-size: 9pt; }
    .note { font-size: 8pt; color: #555; font-style: italic; margin-top: 1px; }

    .totals { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .totals td { padding: 3px 0; }
    .totals td:last-child { text-align: right; }
    .grand td { font-size: 13pt; font-weight: 900; border-top: 2px solid #000; padding-top: 7px; }

    .pay-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 2px 0; }
    .sbadge { display: inline-block; padding: 2px 9px; border-radius: 12px; font-size: 8pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .s-paid    { background: #d1fae5; color: #065f46; }
    .s-pending { background: #fef3c7; color: #92400e; }

    .notes-box { border: 1px dashed #888; border-radius: 3px; padding: 5px 7px; font-size: 9pt; color: #333; font-style: italic; line-height: 1.5; }

    .loyalty-box { border: 1.5px dashed #b8952a; border-radius: 3px; padding: 7px; text-align: center; background: #fffbf0; }
    .loyalty-box .pts { font-size: 15pt; font-weight: 900; color: #92400e; }
    .loyalty-box .lbl { font-size: 8pt; font-weight: 700; color: #92400e; letter-spacing: 1px; text-transform: uppercase; }

    .footer { text-align: center; font-size: 9pt; color: #333; line-height: 1.7; }
    .thanks { font-size: 11pt; font-weight: 900; color: #000; letter-spacing: 1px; margin-bottom: 3px; }
    .powered { font-size: 8pt; color: #777; margin-top: 6px; letter-spacing: 1px; }

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
      ${restaurantMomoCode ? `<br><strong style="font-size:10pt;letter-spacing:0.5px">MoMo: ${restaurantMomoCode}</strong>` : ''}
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

  ${payments.map(p => `
  <div class="pay-row">
    <span style="color:#333">${p.method}${p.reference ? ` <span style="font-size:8pt;color:#555">(${p.reference})</span>` : ''}</span>
    <span style="font-weight:700">${fmt(p.amount)}</span>
  </div>`).join('')}
  ${payments.length > 1 ? `
  <div class="pay-row" style="border-top:1px solid #ccc;margin-top:3px;padding-top:4px;font-weight:700">
    <span>Total Paid</span>
    <span>${fmt(payments.reduce((s, p) => s + p.amount, 0))}</span>
  </div>` : ''}
  <div class="pay-row" style="margin-top:3px">
    <span style="color:#333">Status</span>
    <span class="sbadge ${paymentStatus === 'paid' ? 's-paid' : 's-pending'}">${paymentStatus}</span>
  </div>
  ${change !== undefined && change > 0 ? `<div class="pay-row"><span style="color:#333">Change</span><span style="font-weight:700">${fmt(change)}</span></div>` : ''}

  ${deliveryAddress ? `
  <hr class="dashed">
  <div style="font-size:8pt;color:#444;line-height:1.6">
    <strong style="color:#000;text-transform:uppercase;letter-spacing:1px;font-size:7pt">Delivery</strong><br>
    ${receipt.deliveryProvider ? `${receipt.deliveryProvider} &middot; ` : ''}${deliveryAddress}
  </div>` : ''}

  ${(notes || specialInstructions) ? `
  <hr class="dashed">
  <div style="font-size:8pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#333;margin-bottom:4px">Comment / Note</div>
  <div class="notes-box">
    ${notes ? `<div><strong>Order Note:</strong> ${notes}</div>` : ''}
    ${notes && specialInstructions ? `<div style="height:4px"></div>` : ''}
    ${specialInstructions ? `<div><strong>Special Instructions:</strong> ${specialInstructions}</div>` : ''}
  </div>` : ''}

  ${loyaltyPoints && loyaltyPoints.pointsEarned > 0 ? `
  <hr class="dashed">
  <div class="loyalty-box">
    <div class="lbl">Points Earned This Visit</div>
    <div class="pts">+${loyaltyPoints.pointsEarned} pts</div>
    <div style="font-size:8pt;color:#92400e;margin-top:3px">Balance: ${loyaltyPoints.pointsBalance} pts</div>
  </div>` : ''}

  ${osdcReceiptSign || osdcReceiptNo ? `
  <hr class="dashed">
  <div style="font-size:8pt;line-height:1.6;color:#222">
    <div style="font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">RRA EBM Certified</div>
    ${osdcReceiptNo ? `<div>Receipt No: <strong>${osdcReceiptNo}</strong></div>` : ''}
    ${osdcSdcDateTime ? `<div>SDC Time: <strong>${osdcSdcDateTime}</strong></div>` : ''}
    ${osdcReceiptSign ? `<div style="word-break:break-all">EBM Signature: <strong>${osdcReceiptSign}</strong></div>` : ''}
    ${osdcInternalData ? `<div style="word-break:break-all">Internal Data: <strong>${osdcInternalData}</strong></div>` : ''}
  </div>
  ${qrImageUrl ? `<div style="text-align:center;margin-top:8px"><img src="${qrImageUrl}" alt="RRA QR" style="width:130px;height:130px;object-fit:contain" /></div>` : ''}
  ` : ''}

  <hr class="solid">

  <div class="footer">
    <div class="thanks">Thank you for chosing us!</div>
    <div>We hope to see you again soon.</div>
    <div style="font-size:8pt;color:#555;margin-top:4px">${receiptId}</div>
    <div class="powered">Powered by SERVV</div>
  </div>

</div>

<button class="print-btn no-print" onclick="window.print()">Print Receipt</button>

<script>
  if (window.opener || window.name === 'receipt_print') {
    setTimeout(function() {
      window.print();
      window.addEventListener('afterprint', function() {
        setTimeout(function() { window.close(); }, 300);
      });
    }, 500);
  }
<\/script>

</body>
</html>`;
}

// ============================================
// KITCHEN TICKET GENERATION
// ============================================

export interface KitchenTicketData {
  restaurantName: string;
  restaurantLogo?: string;
  orderNumber: string | number;
  tableNumber?: number | string;
  status: string;
  createdAt: string | Date;
  items: Array<{ quantity: number; name: string; notes?: string }>;
  notes?: string;
  loyaltyDiscount?: number;
  loyaltyFreeItemName?: string;
}

/**
 * Generate an 80mm kitchen order ticket (KOT) using the same CSS base
 * as buildReceiptHtml so all printed documents look consistent.
 */
export function buildKitchenTicketHtml(ticket: KitchenTicketData): string {
  const {
    restaurantName,
    restaurantLogo,
    orderNumber,
    tableNumber,
    status,
    createdAt,
    items,
    notes,
    loyaltyDiscount,
    loyaltyFreeItemName,
  } = ticket;

  const now = new Date();
  const placedAt = new Date(createdAt);
  const waitMinutes = Math.floor((now.getTime() - placedAt.getTime()) / 60000);
  const urgencyLabel = waitMinutes > 15 ? 'URGENT' : waitMinutes > 8 ? 'SOON' : 'ON TIME';
  const urgencyColor = waitMinutes > 15 ? '#b91c1c' : waitMinutes > 8 ? '#92400e' : '#065f46';
  const urgencyBg    = waitMinutes > 15 ? '#fee2e2' : waitMinutes > 8 ? '#fef3c7' : '#d1fae5';

  const printedAt = now.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const placedAtStr = placedAt.toLocaleString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  const itemsHtml = items.map(item => `
    <tr>
      <td class="qty">${item.quantity}&times;</td>
      <td class="name">${item.name}${item.notes ? `<div class="note">&#8627; ${item.notes}</div>` : ''}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kitchen Ticket #${orderNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 10pt; color: #000; line-height: 1.45; }

    @media screen {
      body { background: #c8c8c8; display: flex; flex-direction: column; align-items: center; padding: 20px 12px 40px; }
      .paper { background: #fff; width: 80mm; padding: 6mm 5mm 10mm; box-shadow: 0 3px 16px rgba(0,0,0,.22); }
    }
    @media print {
      html, body { background: #fff; display: block; }
      .paper { padding: 3mm 4mm 14mm; }
      .no-print { display: none !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    .hdr { text-align: center; padding-bottom: 8px; }
    .logo { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 6px; }
    .brand { font-size: 15pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .rbadge { display: inline-block; margin-top: 7px; padding: 2px 10px; border: 1.5px solid #000; font-size: 8pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

    .solid  { border: none; border-top: 2px solid #000; margin: 8px 0; }
    .dashed { border: none; border-top: 1px dashed #666; margin: 6px 0; }

    .order-block { text-align: center; padding: 4px 0; }
    .order-num { font-size: 24pt; font-weight: 900; line-height: 1.1; }
    .table-num { font-size: 14pt; font-weight: 700; margin-top: 2px; }
    .status-badge { display: inline-block; margin-top: 5px; padding: 2px 12px; border: 1.5px solid #000; font-size: 9pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

    .meta { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .meta td { padding: 2px 0; vertical-align: top; }
    .meta td:first-child { color: #333; width: 42%; }
    .meta td:last-child  { font-weight: 700; text-align: right; }

    .urgency-row { display: flex; justify-content: space-between; align-items: center; font-size: 9pt; margin: 4px 0; }
    .urgency-badge { padding: 2px 10px; border-radius: 3px; font-weight: 700; font-size: 8pt; letter-spacing: 1px; }

    .items { width: 100%; border-collapse: collapse; font-size: 11pt; }
    .items td { padding: 5px 0; vertical-align: top; border-bottom: 1px dotted #bbb; }
    .items .qty  { width: 28px; color: #333; font-size: 10pt; font-weight: 700; }
    .items .name { font-weight: 700; }
    .note { font-size: 8pt; color: #555; font-style: italic; margin-top: 1px; font-weight: 400; }

    .special-box { border: 2px solid #000; padding: 6px 8px; margin: 8px 0; font-size: 9pt; font-weight: 700; line-height: 1.5; }
    .special-box .lbl { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 2px; }

    .loyalty-box { border: 1.5px dashed #b8952a; border-radius: 3px; padding: 5px 7px; font-size: 9pt; background: #fffbf0; color: #92400e; }

    .footer { text-align: center; font-size: 9pt; color: #333; line-height: 1.7; }
    .powered { font-size: 8pt; color: #777; margin-top: 4px; letter-spacing: 1px; }

    .print-btn { margin-top: 16px; padding: 8px 28px; background: #111; color: #fff; border: none; border-radius: 3px; font-family: inherit; font-size: 12px; cursor: pointer; }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>

<div class="paper">

  <div class="hdr">
    ${restaurantLogo ? `<img src="${restaurantLogo}" alt="${restaurantName}" class="logo">` : ''}
    <div class="brand">${restaurantName}</div>
    <div class="rbadge">Kitchen Ticket</div>
  </div>

  <hr class="solid">

  <div class="order-block">
    <div class="order-num">Order #${orderNumber}</div>
    ${tableNumber != null ? `<div class="table-num">TABLE ${tableNumber}</div>` : ''}
    <div class="status-badge">${status.toUpperCase()}</div>
  </div>

  <hr class="dashed">

  <table class="meta">
    <tr><td>Placed</td><td>${placedAtStr}</td></tr>
    <tr>
      <td>Wait</td>
      <td>
        <span>${waitMinutes} min</span>
        &nbsp;<span class="urgency-badge" style="background:${urgencyBg};color:${urgencyColor}">${urgencyLabel}</span>
      </td>
    </tr>
  </table>

  <hr class="dashed">

  ${notes ? `
  <div class="special-box">
    <div class="lbl">&#9888; Special Request</div>
    ${notes}
  </div>` : ''}

  <table class="items">
    <tbody>${itemsHtml}</tbody>
  </table>

  ${(loyaltyDiscount && loyaltyDiscount > 0) || loyaltyFreeItemName ? `
  <hr class="dashed">
  <div class="loyalty-box">
    ${loyaltyDiscount && loyaltyDiscount > 0 ? `<div>&#127873; Loyalty Discount Applied</div>` : ''}
    ${loyaltyFreeItemName ? `<div>&#127873; Free Item: ${loyaltyFreeItemName}</div>` : ''}
  </div>` : ''}

  <hr class="solid">

  <div class="footer">
    <div>Printed: ${printedAt}</div>
    <div class="powered">Powered by SERVV</div>
  </div>

</div>

<button class="print-btn no-print" onclick="window.print()">Print Ticket</button>

<script>
  if (window.opener || window.name === 'kitchen_print') {
    setTimeout(function() {
      window.print();
      window.addEventListener('afterprint', function() {
        setTimeout(function() { window.close(); }, 300);
      });
    }, 500);
  }
<\/script>

</body>
</html>`;
}

/**
 * Open a kitchen ticket in a named 80mm-wide window.
 */
export function printKitchenTicket(html: string): void {
  const printWindow = window.open('', 'kitchen_print', 'width=302,height=700,toolbar=0,scrollbars=1,status=0');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow pop-ups.');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
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
// HTML DOWNLOAD
// ============================================

export function downloadReceiptHtml(receipt: ReceiptData, filename?: string): void {
  const html = buildReceiptHtml(receipt);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `receipt-${receipt.orderNumber || Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
    body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 10pt; color: #000; line-height: 1.45; }

    @media screen {
      body { background: #c8c8c8; display: flex; flex-direction: column; align-items: center; padding: 20px 12px 40px; }
      .paper { background: #fff; width: 80mm; padding: 6mm 5mm 10mm; box-shadow: 0 3px 16px rgba(0,0,0,.22); }
    }
    @media print {
      html, body { background: #fff; display: block; }
      .paper { padding: 3mm 4mm 14mm; }
      .footer { page-break-inside: avoid; }
      .no-print { display: none !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    .hdr { text-align: center; padding-bottom: 8px; }
    .logo { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 6px; }
    .brand { font-size: 15pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .sub { font-size: 9pt; color: #333; margin-top: 3px; line-height: 1.5; }
    .rbadge { display: inline-block; margin-top: 7px; padding: 2px 10px; border: 1.5px solid #000; font-size: 8pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

    .solid  { border: none; border-top: 2px solid #000; margin: 8px 0; }
    .dashed { border: none; border-top: 1px dashed #666; margin: 6px 0; }

    .meta { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .meta td { padding: 2px 0; vertical-align: top; }
    .meta td:first-child { color: #555; width: 45%; }
    .meta td:last-child  { font-weight: 700; text-align: right; }

    .desc-lbl { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: #555; margin-bottom: 3px; }
    .desc-lbl { font-size: 8pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #333; margin-bottom: 3px; }
    .desc-box { font-size: 9pt; line-height: 1.5; color: #000; border-top: 1px dotted #bbb; border-bottom: 1px dotted #bbb; padding: 6px 0; margin: 3px 0; }

    .totals { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .totals td { padding: 3px 0; }
    .totals td:last-child { text-align: right; }
    .grand td { font-size: 13pt; font-weight: 900; border-top: 2px solid #000; padding-top: 7px; }

    .pay-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 2px 0; }
    .sbadge { display: inline-block; padding: 2px 9px; border-radius: 12px; font-size: 8pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .s-paid     { background: #d1fae5; color: #065f46; }
    .s-pending  { background: #fef3c7; color: #92400e; }
    .s-approved { background: #d1fae5; color: #065f46; }
    .s-rejected { background: #fee2e2; color: #991b1b; }
    .s-draft    { background: #f1f5f9; color: #475569; }

    .notes-box { border: 1px dashed #888; border-radius: 3px; padding: 5px 7px; font-size: 9pt; color: #333; font-style: italic; line-height: 1.5; }

    .footer { text-align: center; font-size: 9pt; color: #333; line-height: 1.7; }
    .thanks { font-size: 11pt; font-weight: 900; color: #000; letter-spacing: 1px; margin-bottom: 3px; }
    .powered { font-size: 8pt; color: #777; margin-top: 6px; letter-spacing: 1px; }

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
    <div style="font-size:8pt;color:#555;margin-top:4px">${receiptRef}</div>
    <div class="powered">Powered by SERVV</div>
  </div>

</div>
<button class="print-btn no-print" onclick="window.print()">Print Receipt</button>

<script>
  if (window.opener || window.name === 'receipt_print') {
    setTimeout(function() {
      window.print();
      window.addEventListener('afterprint', function() {
        setTimeout(function() { window.close(); }, 300);
      });
    }, 500);
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
