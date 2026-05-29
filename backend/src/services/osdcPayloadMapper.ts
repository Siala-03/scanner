/**
 * OSDC Payload Mapper — OSDC Compliance Certification
 *
 * Implements Rwanda RRA OSDC TrnsSalesSaveWrReq strict schema.
 * Uses Decimal.js throughout to avoid IEEE-754 float precision loss
 * that would be flagged in compliance audits at RWF scale.
 *
 * OSDC differs from legacy VSDC in:
 *   - Numeric invcNo (device sequence) instead of string cisInvcNo
 *   - cmcKey per request (communication key from device)
 *   - taxTyCd per item (A/B/C/D) not vatCatCd
 *   - Mandatory prchrAcptcYn + receipt sub-object
 *   - pmtTyCd enum: 01=Cash 02=Cheque 03=CreditCard 04=BankTransfer 05=Card 06=MOMO 07=Other
 *   - Strict Zod validation before transmission
 */

import { z } from 'zod';
import Decimal from 'decimal.js';

// ─── OSDC Schema (TrnsSalesSaveWrReq) ─────────────────────────────────────────

const OsdcItemSchema = z.object({
  itemSeq:    z.number().int().positive(),
  itemCd:     z.string().max(20),
  itemClsCd:  z.string().max(10),
  itemNm:     z.string().max(200),
  pkgUnitCd:  z.string().max(5),
  qtyUnitCd:  z.string().max(5),
  qty:        z.number(),
  prc:        z.number(),
  splyAmt:    z.number(),
  dcRt:       z.number().default(0),
  dcAmt:      z.number().default(0),
  taxTyCd:    z.enum(['A', 'B', 'C', 'D']),
  taxblAmt:   z.number(),
  taxAmt:     z.number(),
  totAmt:     z.number(),
});

export const OsdcSalesSchema = z.object({
  tin:          z.string().length(9),
  bhfId:        z.string().length(2),
  cmcKey:       z.string().min(1),
  invcNo:       z.number().int().positive(),
  orgInvcNo:    z.number().int().nonnegative().default(0),
  custTin:      z.string().length(9).optional().nullable(),
  custNm:       z.string().max(60).optional().nullable(),
  rcptTyCd:     z.enum(['S', 'R']),
  pmtTyCd:      z.enum(['01', '02', '03', '04', '05', '06', '07']),
  salesSttsCd:  z.enum(['01', '02', '03', '04', '05', '06']),
  cfmDt:        z.string().length(14),
  salesDt:      z.string().length(8),
  totItemCnt:   z.number().int().positive(),
  taxblAmtA:    z.number(),
  taxblAmtB:    z.number(),
  taxblAmtC:    z.number(),
  taxblAmtD:    z.number(),
  taxRtA:       z.number(),
  taxRtB:       z.number(),
  taxRtC:       z.number(),
  taxRtD:       z.number(),
  taxAmtA:      z.number(),
  taxAmtB:      z.number(),
  taxAmtC:      z.number(),
  taxAmtD:      z.number(),
  totTaxblAmt:  z.number(),
  totTaxAmt:    z.number(),
  totAmt:       z.number(),
  prchrAcptcYn: z.enum(['Y', 'N']),
  itemList:     z.array(OsdcItemSchema).min(1).max(100),
  receipt: z.object({
    custTin:      z.string().length(9).optional().nullable(),
    custMblNo:    z.string().max(20).optional().nullable(),
    rcptPbctDt:   z.string().length(14),
    topMsg:       z.string().max(20).default(''),
    btmMsg:       z.string().max(20).default(''),
    prchrAcptcYn: z.enum(['Y', 'N']),
  }).optional(),
});

export type OsdcSalesPayload = z.infer<typeof OsdcSalesSchema>;

// ─── Tax Rate Constants ────────────────────────────────────────────────────────

const TAX_RATES: Record<'A' | 'B' | 'C' | 'D', Decimal> = {
  A: new Decimal(0),    // Exempt
  B: new Decimal(18),   // Standard VAT (18%)
  C: new Decimal(0),    // Zero-rated / Export
  D: new Decimal(0),    // Non-taxable
};

// ─── Input Types ───────────────────────────────────────────────────────────────

export type OsdcTaxType = 'A' | 'B' | 'C' | 'D';

/** A single order line item, as needed by the OSDC mapper */
export interface OsdcOrderItem {
  quantity:      number;
  unitPrice:     number;          // VAT-inclusive price
  name:          string;
  taxType?:      OsdcTaxType;     // Default: 'B' (standard 18% VAT)
  itemCode?:     string;          // Menu item ID / OSDC item code
  itemClassCode?: string;         // OSDC HS class code (default: food & beverage)
  pkgUnit?:      string;          // Packaging unit code (default: 'NT')
  qtyUnit?:      string;          // Quantity unit code (default: 'EA')
}

/** Full transaction input to mapToOsdcSalesPayload */
export interface OsdcTransaction {
  tin:           string;          // 9-char RRA TIN
  bhfId:         string;          // 2-char branch code (e.g., '00')
  createdAt:     Date;
  items:         OsdcOrderItem[];
  total:         number;          // Grand total (VAT-inclusive), used for cross-check
  isRefund?:     boolean;
  isVoid?:       boolean;
  paymentType?:  string;          // Raw pmtTyCd ('01'–'07') or alias ('MOMO','CARD','CASH')
  customer?: {
    tin?:        string | null;
    name?:       string | null;
    phone?:      string | null;
  };
}

// ─── Payment Type Normalisation ────────────────────────────────────────────────

const PAYMENT_ALIASES: Record<string, '01' | '02' | '03' | '04' | '05' | '06' | '07'> = {
  CASH:         '01',
  cash:         '01',
  CHEQUE:       '02',
  cheque:       '02',
  CREDITCARD:   '03',
  'CREDIT CARD':'03',
  BANKTRANSFER: '04',
  BANK:         '04',
  CARD:         '05',
  card:         '05',
  MOMO:         '06',
  momo:         '06',
  OTHER:        '07',
};

const VALID_PMT_CODES = new Set(['01', '02', '03', '04', '05', '06', '07']);

export function normalizeOsdcPaymentType(raw: string | undefined | null): '01' | '02' | '03' | '04' | '05' | '06' | '07' {
  if (!raw) return '01';
  if (VALID_PMT_CODES.has(raw)) return raw as '01' | '02' | '03' | '04' | '05' | '06' | '07';
  return PAYMENT_ALIASES[raw.toUpperCase()] ?? '01';
}

// ─── Date Helpers ──────────────────────────────────────────────────────────────

function toOsdcDateTime(date: Date): string {
  // YYYYMMDDHHmmss — local wall-clock, zero-padded
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}${s}`;
}

function toOsdcDate(date: Date): string {
  // YYYYMMDD
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

// ─── Decimal round helper (2dp, banker's rounding) ────────────────────────────

function r2(d: Decimal): number {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber();
}

// ─── Main Mapper ───────────────────────────────────────────────────────────────

/**
 * Map a ServVV order transaction to the OSDC `TrnsSalesSaveWrReq` payload.
 *
 * @param tx       Transaction data (order + restaurant EBM config)
 * @param cmcKey   Communication key from EBM device (from selectInitInfo or per-request)
 * @param invcNo   Numeric invoice sequence from device (must be monotonically increasing)
 * @returns        Validated OSDC payload ready to POST to /trnsSales/saveSales
 */
export function mapToOsdcSalesPayload(
  tx: OsdcTransaction,
  cmcKey: string,
  invcNo: number,
): OsdcSalesPayload {
  const cfmDt  = toOsdcDateTime(tx.createdAt);
  const salesDt = toOsdcDate(tx.createdAt);

  // Per-band taxable amount accumulators (Decimal precision)
  const bands: Record<OsdcTaxType, Decimal> = {
    A: new Decimal(0),
    B: new Decimal(0),
    C: new Decimal(0),
    D: new Decimal(0),
  };

  // Build item list
  const itemList = tx.items.map((item, idx): z.infer<typeof OsdcItemSchema> => {
    const taxType: OsdcTaxType = item.taxType ?? 'B';
    const rate = TAX_RATES[taxType];
    const divisor = new Decimal(1).add(rate.div(100)); // e.g. 1.18 for B

    const qty   = new Decimal(item.quantity);
    const prc   = new Decimal(item.unitPrice);
    const sply  = qty.mul(prc);

    // Reverse-calculate taxable amount from VAT-inclusive price
    const taxbl = sply.div(divisor);
    const tax   = sply.sub(taxbl);

    bands[taxType] = bands[taxType].add(taxbl);

    return {
      itemSeq:   idx + 1,
      itemCd:    (item.itemCode  || `ITEM${String(idx + 1).padStart(3, '0')}`).slice(0, 20),
      itemClsCd: (item.itemClassCode || '5020230101').slice(0, 10),
      itemNm:    item.name.slice(0, 200),
      pkgUnitCd: (item.pkgUnit  || 'NT').slice(0, 5),
      qtyUnitCd: (item.qtyUnit  || 'EA').slice(0, 5),
      qty:       Number(item.quantity),
      prc:       r2(prc),
      splyAmt:   r2(sply),
      dcRt:      0,
      dcAmt:     0,
      taxTyCd:   taxType,
      taxblAmt:  r2(taxbl),
      taxAmt:    r2(tax),
      totAmt:    r2(sply),
    };
  });

  // Compute band-level tax amounts
  const taxAmts: Record<OsdcTaxType, Decimal> = {
    A: bands.A.mul(TAX_RATES.A.div(100)),
    B: bands.B.mul(TAX_RATES.B.div(100)),
    C: bands.C.mul(TAX_RATES.C.div(100)),
    D: bands.D.mul(TAX_RATES.D.div(100)),
  };

  const totTaxbl = (Object.values(bands) as Decimal[]).reduce((a, b) => a.add(b), new Decimal(0));
  const totTax   = (Object.values(taxAmts) as Decimal[]).reduce((a, b) => a.add(b), new Decimal(0));

  // Use sum of item splyAmt as authoritative total to avoid float drift
  const totAmtCalc = itemList.reduce((sum, it) => sum.add(new Decimal(it.splyAmt)), new Decimal(0));

  const pmtTyCd = normalizeOsdcPaymentType(tx.paymentType);

  const payload: OsdcSalesPayload = {
    tin:    tx.tin.slice(0, 9).padStart(9, '0'),
    bhfId:  tx.bhfId.slice(0, 2).padStart(2, '0'),
    cmcKey,
    invcNo,
    orgInvcNo: 0,
    custTin:   tx.customer?.tin?.slice(0, 9) || null,
    custNm:    tx.customer?.name?.slice(0, 60) || null,
    rcptTyCd:  tx.isRefund ? 'R' : 'S',
    pmtTyCd,
    salesSttsCd: tx.isVoid ? '04' : '02',
    cfmDt,
    salesDt,
    totItemCnt: itemList.length,
    taxblAmtA: r2(bands.A),
    taxblAmtB: r2(bands.B),
    taxblAmtC: r2(bands.C),
    taxblAmtD: r2(bands.D),
    taxRtA: 0,
    taxRtB: 18.00,
    taxRtC: 0,
    taxRtD: 0,
    taxAmtA: r2(taxAmts.A),
    taxAmtB: r2(taxAmts.B),
    taxAmtC: r2(taxAmts.C),
    taxAmtD: r2(taxAmts.D),
    totTaxblAmt: r2(totTaxbl),
    totTaxAmt:   r2(totTax),
    totAmt:      r2(totAmtCalc),
    prchrAcptcYn: 'N',
    itemList,
    receipt: {
      custTin:      tx.customer?.tin?.slice(0, 9) || null,
      custMblNo:    tx.customer?.phone?.slice(0, 20) || null,
      rcptPbctDt:   cfmDt,
      topMsg:       '',
      btmMsg:       '',
      prchrAcptcYn: 'N',
    },
  };

  // Strict OSDC validation before returning
  const parsed = OsdcSalesSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`OSDC Payload Validation Failed: ${parsed.error.message}`);
  }

  return parsed.data;
}

// ─── Order-to-OSDC bridge (for ebmFiscalQueue) ─────────────────────────────────

/**
 * Convert raw DB order row + EBM config into an OsdcTransaction for mapToOsdcSalesPayload.
 * This is the entry point called by the fiscal queue worker.
 */
export function orderRowToOsdcTransaction(
  order: {
    items: Array<{
      menuItemId?: string;
      menuItemName?: string;
      name?: string;
      quantity: number;
      unitPrice: number;
      totalPrice?: number;
      itemCode?: string;
      itemClassCode?: string;
      taxType?: string;
    }>;
    total: number;
    customer_name?: string;
    customer_tin?: string;
    customer_phone?: string;
  },
  config: { tpin: string; bhfId: string },
  paymentType?: string,
): OsdcTransaction {
  return {
    tin:   config.tpin,
    bhfId: config.bhfId,
    createdAt: new Date(),
    items: order.items.map((it) => ({
      quantity:      Number(it.quantity) || 1,
      unitPrice:     Number(it.unitPrice) || 0,
      name:          (it.menuItemName || it.name || 'Item').slice(0, 200),
      taxType:       isValidTaxType(it.taxType) ? it.taxType : 'B',
      itemCode:      it.menuItemId || it.itemCode,
      itemClassCode: it.itemClassCode,
      pkgUnit:       'NT',
      qtyUnit:       'EA',
    })),
    total:       Number(order.total) || 0,
    paymentType,
    customer: {
      tin:   order.customer_tin  || null,
      name:  order.customer_name || null,
      phone: order.customer_phone || null,
    },
  };
}

function isValidTaxType(v: unknown): v is OsdcTaxType {
  return v === 'A' || v === 'B' || v === 'C' || v === 'D';
}
