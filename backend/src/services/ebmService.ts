// RRA EBM / VSDC API integration service
// Implements the VSDC API spec used by Rwanda Revenue Authority (RRA)
// Reference: https://documenter.getpostman.com/view/20074551/2s9YXe74Jr (RRA-ALGO EBM v8.2)

export interface EbmConfig {
  tpin: string;
  bhfId: string;
  dvcSrlNo: string;
  baseUrl: string;
}

export interface EbmResponse<T = Record<string, unknown>> {
  resultCd: string;
  resultMsg: string;
  resultDt: string;
  data?: T;
}

// ─── Mock Mode ────────────────────────────────────────────────────────────────
// Set EBM_MOCK=true in backend/.env to test the full SERVV→EBM flow
// without a real VSDC instance. All calls return realistic responses.
// No real credentials needed, no RRA network requests.

export const EBM_MOCK_MODE = process.env.EBM_MOCK === 'true';

let _mockRcptCounter = 1000;

function mockDateTime(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function mockResponse<T>(data?: T): EbmResponse<T> {
  return {
    resultCd: '000',
    resultMsg: '[MOCK] Success',
    resultDt: mockDateTime(),
    ...(data !== undefined ? { data } : {}),
  };
}

function getMockResponse<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): EbmResponse<T> {
  const tpin    = (body.tpin    as string) || 'MOCK_TPIN';
  const bhfId   = (body.bhfId   as string) || '000';
  const dvcSrlNo = (body.dvcSrlNo as string) || 'MOCK-SRL-001';

  switch (true) {
    case path.includes('selectInitInfo'):
      return mockResponse({
        tpin,
        taxprNm: '[MOCK] Test Business Ltd',
        bhfId,
        bhfNm: '[MOCK] Main Branch',
        bhfOpenDt: '20240101',
        prvncNm: 'Kigali',
        dstrtNm: 'Nyarugenge',
        sctrNm: 'Nyarugenge',
        locDesc: '[MOCK] Test Location',
        mgrNm: '[MOCK] Manager',
        mgrTelNo: '0780000000',
        mgrEmail: 'mock@test.com',
        dvcSrlNo,
      } as unknown as T);

    case path.includes('selectCodes'):
      return mockResponse({ clsList: [] } as unknown as T);

    case path.includes('selectItemsClass'):
      return mockResponse({ itemClsList: [] } as unknown as T);

    case path.includes('selectNotices'):
      return mockResponse({ noticeList: [] } as unknown as T);

    case path.includes('selectBranches'):
      return mockResponse({ bhfList: [{ bhfId, bhfNm: '[MOCK] Main Branch', bhfSttsCd: '01' }] } as unknown as T);

    case path.includes('selectCustomer'):
      return mockResponse({
        custTin: body.custTin || 'MOCK_CUST_TIN',
        custNm: '[MOCK] Walk-in Customer',
        adrs: '[MOCK] Kigali, Rwanda',
      } as unknown as T);

    case path.includes('saveItem'):
    case path.includes('updateItem'):
      return mockResponse({ itemCd: body.itemCd || 'MOCK-ITEM' } as unknown as T);

    case path.includes('selectItems'):
      return mockResponse({ itemList: [] } as unknown as T);

    case path.includes('selectItem'):
      return mockResponse(null as unknown as T);

    case path.includes('saveSales'): {
      const rcptNo = ++_mockRcptCounter;
      const sign = Buffer.from(`MOCK-${tpin}-${rcptNo}-${Date.now()}`).toString('base64').slice(0, 20);
      return mockResponse({
        rcptNo,
        intrlData: `MOCK-INTRL-${rcptNo}`,
        rcptSign: sign,
        sdcId: 'MOCK-SDC-001',
        totRcptNo: rcptNo,
      } as unknown as T);
    }

    case path.includes('selectInvoice'):
    case path.includes('selectPrincipals'):
      return mockResponse({ itemList: [] } as unknown as T);

    case path.includes('savePurchase'):
      return mockResponse({ invcNo: body.invcNo || 'MOCK-PURCH' } as unknown as T);

    case path.includes('selectTrnsPurchaseSales'):
      return mockResponse({ itemList: [] } as unknown as T);

    case path.includes('saveStockMaster'):
    case path.includes('saveStockItems'):
      return mockResponse({ sarNo: `MOCK-SAR-${Date.now()}` } as unknown as T);

    case path.includes('selectStockItems'):
      return mockResponse({ stockList: [] } as unknown as T);

    case path.includes('selectImportItems'):
    case path.includes('updateImportItems'):
      return mockResponse({ itemList: [] } as unknown as T);

    default:
      return mockResponse(undefined);
  }
}

// ─── Transport ────────────────────────────────────────────────────────────────

async function vsdcPost<T = Record<string, unknown>>(
  baseUrl: string,
  path: string,
  body: object
): Promise<EbmResponse<T>> {
  if (EBM_MOCK_MODE) {
    console.log(`[EBM MOCK] ${path}`);
    return getMockResponse<T>(path, body as Record<string, unknown>);
  }

  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EBM VSDC ${path} → HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<EbmResponse<T>>;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function formatVsdcDateTime(date: Date = new Date()): string {
  // YYYYMMDDHHmmss
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

export function formatVsdcDate(date: Date = new Date()): string {
  // YYYYMMDD
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

// ─── Initializer ──────────────────────────────────────────────────────────────

export interface InitInfoData {
  tpin: string;
  taxprNm: string;
  bhfId: string;
  bhfNm: string;
  bhfOpenDt: string;
  prvncNm: string;
  dstrtNm: string;
  sctrNm: string;
  locDesc: string;
  mgrNm: string;
  mgrTelNo: string;
  mgrEmail: string;
  dvcSrlNo: string;
}

export function selectInitInfo(config: EbmConfig): Promise<EbmResponse<InitInfoData>> {
  return vsdcPost(config.baseUrl, '/initializer/selectInitInfo', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    dvcSrlNo: config.dvcSrlNo,
  });
}

// ─── Code / Reference Data ────────────────────────────────────────────────────

export function selectCodeList(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/code/selectCodes', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

export function selectItemsClass(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/itemClass/selectItemsClass', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

export function selectNotices(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/notices/selectNotices', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export function selectBranches(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/branches/selectBranches', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface CustomerData {
  custTin: string;
  custNm: string;
  adrs?: string;
  telNo?: string;
  email?: string;
  faxNo?: string;
  isUsed?: string;
}

export function selectCustomer(config: EbmConfig, custTin: string): Promise<EbmResponse<CustomerData>> {
  return vsdcPost(config.baseUrl, '/customers/selectCustomer', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    custTin,
  });
}

// ─── Items / Products ─────────────────────────────────────────────────────────

export interface SaveItemRequest {
  itemCd: string;
  itemClsCd: string;
  itemTyCd: string;   // 1=Raw Material, 2=Finished Product, 3=Service
  itemNm: string;
  temSttsCd: string;  // A=Active, B=Inactive
  addInfo?: string;
  isrcAplcbYn: string; // Y/N – insurance applicable
  regrNm: string;
  regrId: string;
  modrNm?: string;
  modrId?: string;
}

export function saveItem(config: EbmConfig, item: SaveItemRequest): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/items/saveItem', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...item,
  });
}

export function updateItem(config: EbmConfig, item: SaveItemRequest): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/items/updateItem', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...item,
  });
}

export function selectItems(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/items/selectItems', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

export function selectItem(config: EbmConfig, itemCd: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/items/selectItem', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    itemCd,
  });
}

// ─── Sales Transactions ───────────────────────────────────────────────────────

export interface SalesItem {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  bcd?: string | null;
  pkgUnitCd?: string;
  pkg?: number;
  qtyUnitCd?: string;
  qty: number;
  prc: number;
  splyAmt: number;
  dcRt?: number;
  dcAmt?: number;
  isrccCd?: string | null;
  isrccNm?: string | null;
  isrcRt?: number;
  isrcAmt?: number;
  vatCatCd: string; // A=0% Exempt, B=18% Standard, C=0% Export, D=0% Non-Taxable
  iplCatCd?: string | null;
  tlCatCd?: string | null;
  exciseTxCatCd?: string | null;
  taxblAmt: number;
  taxAmt: number;
  totAmt: number;
}

export interface SaveSalesRequest {
  orgInvcNo?: string | null;
  cisInvcNo: string;
  custTin?: string | null;
  custNm?: string;
  rcptTyCd: 'S' | 'R' | 'T'; // Sale, Refund, Training
  pmtTyCd: string;            // 01=Cash, 02=Credit/Card, 03=Cheque, 04=Mobile Money, 05=Other
  salesSttsCd: string;        // 01=Wait, 02=Approved
  cfmDt: string;              // YYYYMMDDHHmmss
  salesDt: string;            // YYYYMMDD
  totItemCnt: number;
  taxblAmtA: number;
  taxblAmtB: number;
  taxblAmtC: number;
  taxblAmtD: number;
  taxRtA: number;
  taxRtB: number;
  taxRtC: number;
  taxRtD: number;
  taxAmtA: number;
  taxAmtB: number;
  taxAmtC: number;
  taxAmtD: number;
  totTaxblAmt: number;
  totTaxAmt: number;
  totAmt: number;
  salesItemList: SalesItem[];
}

export interface SaveSalesData {
  rcptNo: number;
  intrlData: string;
  rcptSign: string;
  sdcId: string;
  totRcptNo: number;
}

export function saveSales(
  config: EbmConfig,
  sales: SaveSalesRequest
): Promise<EbmResponse<SaveSalesData>> {
  return vsdcPost(config.baseUrl, '/trnsSales/saveSales', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...sales,
  });
}

export function selectInvoice(config: EbmConfig, invcNo: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/trnsSales/selectInvoice', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    invcNo,
  });
}

export function selectPrincipals(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/trnsSales/selectPrincipals', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

// ─── Purchase Transactions ────────────────────────────────────────────────────

export interface PurchaseItem {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  qty: number;
  prc: number;
  splyAmt: number;
  dcRt?: number;
  dcAmt?: number;
  vatCatCd: string;
  taxblAmt: number;
  taxAmt: number;
  totAmt: number;
}

export interface SavePurchaseRequest {
  invcNo: string;
  orgInvcNo?: string;
  spplrTpin: string;
  spplrNm: string;
  spplrBhfId?: string;
  regTyCd: string;    // A=Sales, B=Import
  pchsTyCd: string;   // N=Normal
  rcptTyCd: string;   // P=Purchase
  pmtTyCd: string;
  pchsSttsCd: string; // 02=Approved
  cfmDt: string;
  pchsDt: string;
  totItemCnt: number;
  totTaxblAmt: number;
  totTaxAmt: number;
  totAmt: number;
  itemList: PurchaseItem[];
}

export function savePurchase(
  config: EbmConfig,
  purchase: SavePurchaseRequest
): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/trnsPurchase/savePurchase', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...purchase,
  });
}

export function selectPurchases(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/trnsPurchase/selectTrnsPurchaseSales', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export interface StockMasterItem {
  itemCd: string;
  itemNm: string;
  stockTyCd: string; // 01=Opening Stock, 02=Adjustment, 03=Cycle count
  qty: number;
  rsdQty?: number;
  srnoNm?: string;
}

export function saveStockMaster(
  config: EbmConfig,
  data: { regrNm: string; regrId: string; modrNm?: string; modrId?: string; itemList: StockMasterItem[] }
): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/stockMaster/saveStockMaster', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...data,
  });
}

export function saveStockItems(
  config: EbmConfig,
  data: { sarNo: string; orgSarNo?: string; regTyCd: string; sarTyCd: string; ocrnDt: string; totItemCnt: number; totAmt: number; regrNm: string; regrId: string; itemList: StockMasterItem[] }
): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/stock/saveStockItems', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...data,
  });
}

export function selectStockItems(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/stock/selectStockItems', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

// ─── Imports ──────────────────────────────────────────────────────────────────

export function selectImportItems(config: EbmConfig, lastReqDt: string): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/imports/selectImportItems', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    lastReqDt,
  });
}

export function updateImportItems(config: EbmConfig, data: object): Promise<EbmResponse> {
  return vsdcPost(config.baseUrl, '/imports/updateImportItems', {
    tpin: config.tpin,
    bhfId: config.bhfId,
    ...data,
  });
}

// ─── Helper: Build saveSales payload from an order object ─────────────────────
// Rwanda VAT: Category B = 18% (standard), included in price (VAT-inclusive)

export function buildSalesFromOrder(
  order: {
    order_number?: string;
    customer_name?: string;
    customer_tin?: string;
    items: Array<{
      menuItemId?: string;
      menuItemName?: string;
      name?: string;
      quantity: number;
      unitPrice: number;
      totalPrice?: number;
    }>;
    total: number;
  },
  cisInvcNo: string,
  pmtTyCd: string = '01',
  rcptTyCd: 'S' | 'R' | 'T' = 'S',
  orgInvcNo?: string
): SaveSalesRequest {
  const now = new Date();
  const VAT_RATE = 18;

  const salesItemList: SalesItem[] = order.items.map((item, idx) => {
    const totAmt = Number(item.totalPrice ?? item.unitPrice * item.quantity);
    // Prices are VAT-inclusive: taxable = total / 1.18
    const taxblAmt = Math.round((totAmt / 1.18) * 100) / 100;
    const taxAmt = Math.round((totAmt - taxblAmt) * 100) / 100;

    return {
      itemSeq: idx + 1,
      itemCd: item.menuItemId || `ITEM${String(idx + 1).padStart(3, '0')}`,
      itemClsCd: '5020230101', // Food & Beverage – default HS code class
      itemNm: (item.menuItemName || item.name || 'Item').slice(0, 60),
      pkgUnitCd: 'NT',
      pkg: 0,
      qtyUnitCd: 'EA',
      qty: Number(item.quantity) || 1,
      prc: Number(item.unitPrice) || 0,
      splyAmt: totAmt,
      dcRt: 0,
      dcAmt: 0,
      vatCatCd: 'B',
      taxblAmt,
      taxAmt,
      totAmt,
    };
  });

  const totAmt = Number(order.total) || 0;
  const totTaxblAmt = Math.round((totAmt / 1.18) * 100) / 100;
  const totTaxAmt = Math.round((totAmt - totTaxblAmt) * 100) / 100;

  return {
    orgInvcNo: orgInvcNo ?? null,
    cisInvcNo,
    custTin: order.customer_tin ?? null,
    custNm: order.customer_name || 'Customer',
    rcptTyCd,
    pmtTyCd,
    salesSttsCd: '02',
    cfmDt: formatVsdcDateTime(now),
    salesDt: formatVsdcDate(now),
    totItemCnt: salesItemList.length,
    taxblAmtA: 0,
    taxblAmtB: totTaxblAmt,
    taxblAmtC: 0,
    taxblAmtD: 0,
    taxRtA: 0,
    taxRtB: VAT_RATE,
    taxRtC: 0,
    taxRtD: 0,
    taxAmtA: 0,
    taxAmtB: totTaxAmt,
    taxAmtC: 0,
    taxAmtD: 0,
    totTaxblAmt,
    totTaxAmt,
    totAmt,
    salesItemList,
  };
}
