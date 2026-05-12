// ── Sunmi P2 Thermal Printer Utility ─────────────────────────────────────────
// Supports three strategies in priority order:
//   1. Sunmi JavaScript Bridge  – window.SunmiPrinter (Sunmi WebView / launcher)
//   2. Web Serial API           – USB ESC/POS (Chrome 89+ on desktop)
//   3. HTML print fallback      – opens a thermal-optimised popup window
//
// Paper: 80 mm → 48 chars per line at Font A (12 × 24 dots, 203 dpi)
// ─────────────────────────────────────────────────────────────────────────────

import type { ReceiptData } from './receipt';
import { formatCurrency, formatDateTime } from './receipt';

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS = 48;

// ── ESC/POS command bytes ─────────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

const CMD = {
  INIT:         [ESC, 0x40],
  ALIGN_LEFT:   [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT:  [ESC, 0x61, 0x02],
  BOLD_ON:      [ESC, 0x45, 0x01],
  BOLD_OFF:     [ESC, 0x45, 0x00],
  SIZE_2X:      [GS,  0x21, 0x11],   // double height + width
  SIZE_TALL:    [GS,  0x21, 0x01],   // double height only
  SIZE_NORMAL:  [GS,  0x21, 0x00],
  FEED:         (n: number) => [ESC, 0x64, n],
  PARTIAL_CUT:  [GS,  0x56, 0x41, 0x10],
  FULL_CUT:     [GS,  0x56, 0x42, 0x00],
};

// ── Text helpers ──────────────────────────────────────────────────────────────

function pad(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  const s = String(text ?? '');
  if (s.length >= width) return s.substring(0, width);
  const gap = width - s.length;
  if (align === 'right')  return ' '.repeat(gap) + s;
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
  return s + ' '.repeat(gap);
}

function twoCol(left: string, right: string, width = COLS): string {
  const l = String(left ?? '');
  const r = String(right ?? '');
  const gap = width - l.length - r.length;
  if (gap <= 0) return (l + ' ' + r).substring(0, width);
  return l + ' '.repeat(gap) + r;
}

function divider(char = '-', width = COLS): string {
  return char.repeat(width);
}

function wrapText(text: string | null | undefined, width = COLS): string[] {
  const words = String(text ?? '').split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) { current = word; continue; }
    if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function encodeText(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out.push(c < 256 ? c : 0x3f);
  }
  out.push(LF);
  return out;
}

// ── Device / bridge detection ─────────────────────────────────────────────────

function isSunmiDevice(): boolean {
  return /sunmi/i.test(navigator.userAgent) || typeof (window as any).SunmiPrinter !== 'undefined';
}

function getSunmiBridge(): any | null {
  return (window as any).SunmiPrinter ?? (window as any).sunmiPrinter ?? null;
}

// ── Strategy 1: Sunmi JS Bridge ───────────────────────────────────────────────

function printViaBridge(textLines: string[]): boolean {
  const b = getSunmiBridge();
  if (!b) return false;
  try {
    b.enterPrinterBuffer?.(true);
    for (const line of textLines) {
      b.printerText?.(line + '\n');
    }
    b.lineWrap?.(4);
    b.cutPaper?.();
    b.exitPrinterBuffer?.(true);
    return true;
  } catch {
    return false;
  }
}

// ── Strategy 2: Web Serial API (ESC/POS) ──────────────────────────────────────

// Cache the port so we don't prompt the user on every print
let _cachedSerialPort: any = null;

async function printViaSerial(escposBytes: number[]): Promise<boolean> {
  if (!('serial' in navigator)) return false;
  try {
    const serial = (navigator as any).serial;

    // Reuse a previously authorised port without prompting
    if (!_cachedSerialPort) {
      const ports = await serial.getPorts();
      if (ports.length > 0) {
        _cachedSerialPort = ports[0];
      }
    }

    // First use: ask the user to select a port (one-time permission grant)
    if (!_cachedSerialPort) {
      _cachedSerialPort = await serial.requestPort({ filters: [] });
    }

    const port = _cachedSerialPort;
    await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    await writer.write(new Uint8Array(escposBytes));
    writer.releaseLock();
    await port.close();
    return true;
  } catch {
    _cachedSerialPort = null; // reset on error so next attempt can re-select
    return false;
  }
}

// ── Strategy 3: HTML print popup ─────────────────────────────────────────────

function printViaHtmlPopup(textLines: string[]): void {
  const escaped = textLines
    .map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 10pt; color: #000; }
  @media screen {
    body { background: #c8c8c8; display: flex; justify-content: center; padding: 20px; }
    pre { background: #fff; padding: 8px 10px; box-shadow: 0 2px 10px rgba(0,0,0,.2); width: 80mm; }
  }
  @media print {
    html, body { background: #fff; display: block; }
    body { padding: 3mm 4mm 14mm; width: 80mm; }
    .no-print { display: none !important; }
  }
  pre { white-space: pre-wrap; word-break: break-all; line-height: 1.4; }
</style>
</head>
<body>
<pre>${escaped}</pre>
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

  const win = window.open('', 'receipt_print', 'width=302,height=700,toolbar=0,scrollbars=1,status=0');
  if (!win) { window.print(); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ── Receipt text builders ─────────────────────────────────────────────────────

function buildOrderReceiptLines(receipt: ReceiptData): string[] {
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);

  // Header
  add(divider('='));
  add(pad(receipt.restaurantName, COLS, 'center'));
  const addressParts = [receipt.restaurantAddress, receipt.restaurantCity, receipt.restaurantCountry].filter(Boolean);
  if (addressParts.length) add(pad(addressParts.join(', '), COLS, 'center'));
  if (receipt.restaurantPhone) add(pad(receipt.restaurantPhone, COLS, 'center'));
  add(divider('='));

  // Order meta
  add(twoCol(`Order: #${receipt.orderNumber}`, new Date(receipt.orderDate).toLocaleDateString()));
  add(twoCol(`Type: ${receipt.orderType}`, receipt.tableNumber ? `Table: ${receipt.tableNumber}` : ''));
  add(twoCol(`Server: ${receipt.serverName}`, receipt.customerName ? `Cust: ${receipt.customerName}` : ''));
  add(divider('-'));

  // Items header
  add(twoCol('ITEM', 'PRICE'));
  add(divider('-'));

  // Items
  for (const item of receipt.items) {
    const price = formatCurrency(item.totalPrice, receipt.currency);
    const nameLabel = `${item.quantity}x ${item.name}`;
    if (nameLabel.length + price.length + 1 <= COLS) {
      add(twoCol(nameLabel, price));
    } else {
      add(nameLabel.substring(0, COLS));
      add(pad(price, COLS, 'right'));
    }
    if (item.specialInstructions) {
      add(pad(`  * ${item.specialInstructions}`, COLS));
    }
  }

  add(divider('-'));

  // Totals
  if (receipt.taxRate > 0) {
    add(twoCol('Subtotal:', formatCurrency(receipt.subtotal, receipt.currency)));
    add(twoCol(`Tax (${receipt.taxRate}%):`, formatCurrency(receipt.taxAmount, receipt.currency)));
  }
  add(twoCol('** TOTAL **', formatCurrency(receipt.total, receipt.currency)));

  add(divider('-'));

  // Payment
  for (const p of receipt.payments) {
    const label = p.reference ? `${p.method} (${p.reference})` : p.method;
    add(twoCol(label + ':', formatCurrency(p.amount, receipt.currency)));
  }
  if (receipt.payments.length > 1) {
    const totalPaid = receipt.payments.reduce((s, p) => s + p.amount, 0);
    add(twoCol('Total Paid:', formatCurrency(totalPaid, receipt.currency)));
  }
  add(twoCol('Status:', receipt.paymentStatus.toUpperCase()));
  if (receipt.change && receipt.change > 0) {
    add(twoCol('Change:', formatCurrency(receipt.change, receipt.currency)));
  }

  // Delivery
  if (receipt.deliveryAddress) {
    add(divider('-'));
    add('DELIVERY:');
    wrapText(receipt.deliveryAddress).forEach(l => add(`  ${l}`));
  }

  // Loyalty
  if (receipt.loyaltyPoints && receipt.loyaltyPoints.pointsEarned > 0) {
    add(divider('-'));
    add(pad(`Points earned: +${receipt.loyaltyPoints.pointsEarned}`, COLS, 'center'));
    add(pad(`Balance: ${receipt.loyaltyPoints.pointsBalance} pts`, COLS, 'center'));
  }

  // Comment / Note
  if (receipt.notes || receipt.specialInstructions) {
    add(divider('-'));
    add('COMMENT / NOTE:');
    if (receipt.notes) {
      add('  Order Note:');
      wrapText(receipt.notes).forEach(l => add(`    ${l}`));
    }
    if (receipt.specialInstructions) {
      add('  Special Instructions:');
      wrapText(receipt.specialInstructions).forEach(l => add(`    ${l}`));
    }
  }

  add(divider('='));
  add(pad('Thank you for chosing us!', COLS, 'center'));
  add(pad('Powered by SERVV IQ', COLS, 'center'));
  add(divider('='));

  return lines;
}

export interface ExpenseReceiptOptions {
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
  companyName?: string;
}

function buildExpenseReceiptLines(expense: ExpenseReceiptOptions): string[] {
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);
  const cur = (expense.currency || 'RWF') as 'RWF' | 'USD';
  const taxAmt = expense.taxAmount ?? (expense.amount * expense.taxRate) / 100;
  const total = expense.amount + taxAmt;

  add(divider('='));
  add(pad(expense.companyName || 'Company', COLS, 'center'));
  add(pad('EXPENSE RECEIPT', COLS, 'center'));
  add(divider('='));

  add(twoCol('Ref #:', expense.referenceNumber || expense.id.substring(0, 12)));
  add(twoCol('Date:', new Date(expense.expenseDate).toLocaleDateString()));
  add(twoCol('Category:', expense.category?.name || 'N/A'));
  add(twoCol('Vendor:', (expense.vendorName || 'N/A').substring(0, 16)));

  add(divider('-'));
  add('Description:');
  wrapText(expense.description).forEach(l => add(`  ${l}`));

  add(divider('-'));
  add(twoCol('Amount:', formatCurrency(expense.amount, cur)));
  if (expense.taxRate > 0 || taxAmt > 0) {
    add(twoCol(`Tax (${expense.taxRate}%):`, formatCurrency(taxAmt, cur)));
  }
  add(twoCol('** TOTAL **', formatCurrency(total, cur)));

  add(divider('-'));
  add(twoCol('Payment:', (expense.paymentMethod || 'cash').toUpperCase()));
  add(twoCol('Pay Status:', expense.paymentStatus.toUpperCase()));
  add(twoCol('Approval:', expense.approvalStatus.toUpperCase()));

  if (expense.notes) {
    add(divider('-'));
    add('Notes:');
    wrapText(expense.notes).forEach(l => add(`  ${l}`));
  }

  add(divider('='));
  add(pad(formatDateTime(new Date()), COLS, 'center'));
  add(pad('Powered by SERVV IQ', COLS, 'center'));
  add(divider('='));

  return lines;
}

// ── ESC/POS byte stream from text lines ──────────────────────────────────────

function buildEscPos(textLines: string[]): number[] {
  const bytes: number[] = [
    ...CMD.INIT,
    ...CMD.ALIGN_LEFT,
  ];
  for (const line of textLines) {
    bytes.push(...encodeText(line));
  }
  bytes.push(...CMD.FEED(4), ...CMD.PARTIAL_CUT);
  return bytes;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function printOrderReceipt(receipt: ReceiptData): Promise<void> {
  const lines = buildOrderReceiptLines(receipt);

  if (printViaBridge(lines)) return;

  const escpos = buildEscPos(lines);
  if (await printViaSerial(escpos)) return;

  printViaHtmlPopup(lines);
}

export async function printExpenseReceipt(expense: ExpenseReceiptOptions): Promise<void> {
  const lines = buildExpenseReceiptLines(expense);

  if (printViaBridge(lines)) return;

  const escpos = buildEscPos(lines);
  if (await printViaSerial(escpos)) return;

  printViaHtmlPopup(lines);
}

export { isSunmiDevice };
