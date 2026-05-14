import { apiRequest } from './http';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EbmConfig {
  id?: string;
  restaurant_id: string;
  tpin: string;
  bhf_id: string;
  dvc_srl_no: string;
  base_url: string;
  env: 'sandbox' | 'production';
  is_active: boolean;
  last_req_dt?: string;
  initialized_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EbmConfigInput {
  restaurantId: string;
  tpin: string;
  bhfId: string;
  dvcSrlNo: string;
  baseUrl?: string;
  env?: 'sandbox' | 'production';
}

export interface EbmInvoice {
  id: string;
  restaurant_id: string;
  order_id?: string;
  invoice_type: 'S' | 'R' | 'T';
  cis_invc_no: string;
  org_invc_no?: string;
  rcpt_no?: number;
  intrl_data?: string;
  rcpt_sign?: string;
  sdc_id?: string;
  tot_rcpt_no?: number;
  cust_tin?: string;
  cust_nm?: string;
  pmt_ty_cd?: string;
  tot_amt: number;
  tot_taxbl_amt?: number;
  tot_tax_amt?: number;
  status: 'pending' | 'success' | 'failed';
  error_msg?: string;
  fiscalized_at?: string;
  created_at: string;
}

export interface EbmVsdcResponse<T = Record<string, unknown>> {
  resultCd: string;
  resultMsg: string;
  resultDt: string;
  data?: T;
}

export interface FiscalizeResult {
  invoiceId: string;
  vsdcResult: EbmVsdcResponse<{
    rcptNo: number;
    intrlData: string;
    rcptSign: string;
    sdcId: string;
    totRcptNo: number;
  }>;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export const getEbmConfig = (restaurantId: string) =>
  apiRequest<EbmConfig | null>(`/api/ebm/config?restaurantId=${encodeURIComponent(restaurantId)}`);

export const saveEbmConfig = (config: EbmConfigInput) =>
  apiRequest<EbmConfig>('/api/ebm/config', { method: 'POST', json: config });

export const getEbmMockStatus = () =>
  apiRequest<{ mockMode: boolean }>('/api/ebm/mock-status');

// ─── Device Initialization ────────────────────────────────────────────────────

export const initializeEbmDevice = (restaurantId: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/initialize', { method: 'POST', json: { restaurantId } });

// ─── Reference Data ───────────────────────────────────────────────────────────

export const getEbmCodes = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/codes', { method: 'POST', json: { restaurantId, lastReqDt } });

export const getEbmItemClasses = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/item-classes', { method: 'POST', json: { restaurantId, lastReqDt } });

export const getEbmNotices = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/notices', { method: 'POST', json: { restaurantId, lastReqDt } });

export const getEbmBranches = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/branches', { method: 'POST', json: { restaurantId, lastReqDt } });

// ─── Customer Lookup ──────────────────────────────────────────────────────────

export const getCustomerByTin = (restaurantId: string, custTin: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/customer', { method: 'POST', json: { restaurantId, custTin } });

// ─── Items ────────────────────────────────────────────────────────────────────

export const saveEbmItem = (restaurantId: string, item: Record<string, unknown>) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/items/save', { method: 'POST', json: { restaurantId, ...item } });

export const updateEbmItem = (restaurantId: string, item: Record<string, unknown>) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/items/update', { method: 'PUT', json: { restaurantId, ...item } });

export const getEbmItems = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>(
    `/api/ebm/items?restaurantId=${encodeURIComponent(restaurantId)}${lastReqDt ? `&lastReqDt=${lastReqDt}` : ''}`
  );

export const getEbmItem = (restaurantId: string, itemCd: string) =>
  apiRequest<EbmVsdcResponse>(
    `/api/ebm/items/${encodeURIComponent(itemCd)}?restaurantId=${encodeURIComponent(restaurantId)}`
  );

// ─── Sales Fiscalization ──────────────────────────────────────────────────────

export const fiscalizeOrder = (
  orderId: string,
  params: { restaurantId: string; paymentType?: string; custTin?: string }
) =>
  apiRequest<FiscalizeResult>(`/api/ebm/fiscalize/${orderId}`, { method: 'POST', json: params });

export const fiscalizeRefund = (
  orderId: string,
  params: { restaurantId: string; paymentType?: string }
) =>
  apiRequest<FiscalizeResult>(`/api/ebm/fiscalize-refund/${orderId}`, { method: 'POST', json: params });

export const getEbmInvoiceFromVsdc = (restaurantId: string, invcNo: string) =>
  apiRequest<EbmVsdcResponse>(
    `/api/ebm/sales/invoice?restaurantId=${encodeURIComponent(restaurantId)}&invcNo=${encodeURIComponent(invcNo)}`
  );

// ─── Purchases ────────────────────────────────────────────────────────────────

export const saveEbmPurchase = (restaurantId: string, purchase: Record<string, unknown>) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/purchases/save', { method: 'POST', json: { restaurantId, ...purchase } });

export const getEbmPurchases = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/purchases/select', {
    method: 'POST',
    json: { restaurantId, lastReqDt },
  });

// ─── Stock ────────────────────────────────────────────────────────────────────

export const saveEbmStockMaster = (restaurantId: string, data: Record<string, unknown>) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/stock/master', { method: 'POST', json: { restaurantId, ...data } });

export const saveEbmStockItems = (restaurantId: string, data: Record<string, unknown>) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/stock/save', { method: 'POST', json: { restaurantId, ...data } });

export const getEbmStock = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>(
    `/api/ebm/stock?restaurantId=${encodeURIComponent(restaurantId)}${lastReqDt ? `&lastReqDt=${lastReqDt}` : ''}`
  );

// ─── Imports ──────────────────────────────────────────────────────────────────

export const getEbmImports = (restaurantId: string, lastReqDt?: string) =>
  apiRequest<EbmVsdcResponse>(
    `/api/ebm/imports?restaurantId=${encodeURIComponent(restaurantId)}${lastReqDt ? `&lastReqDt=${lastReqDt}` : ''}`
  );

export const updateEbmImports = (restaurantId: string, data: Record<string, unknown>) =>
  apiRequest<EbmVsdcResponse>('/api/ebm/imports/update', { method: 'PUT', json: { restaurantId, ...data } });

// ─── Fiscal Invoice Records (local DB) ───────────────────────────────────────

export const getEbmInvoices = (
  restaurantId: string,
  params?: { status?: string; limit?: number; offset?: number }
) => {
  const qs = new URLSearchParams({ restaurantId });
  if (params?.status) qs.set('status', params.status);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  return apiRequest<EbmInvoice[]>(`/api/ebm/invoices?${qs}`);
};

export const getEbmInvoice = (id: string) =>
  apiRequest<EbmInvoice>(`/api/ebm/invoices/${id}`);
