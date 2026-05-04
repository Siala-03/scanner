# RRA EBM / VSDC Integration

Rwanda Revenue Authority Electronic Billing Machine integration using the VSDC (Virtual Sales Data Controller) API.

**API Reference:** [RRA-ALGO EBM Integration API v8.2](https://documenter.getpostman.com/view/20074551/2s9YXe74Jr)

---

## Overview

The VSDC is a middleware layer between this POS system and the RRA central EBM server. Every completed sale must be **fiscalized** — submitted to VSDC which signs it and returns a receipt number and signature that must appear on the printed receipt.

```
POS → POST /api/ebm/fiscalize/:orderId → VSDC Server → RRA Central Server
                                            ↓
                                    rcptSign + rcptNo stored on order
```

Auto-fiscalization fires when an order status changes to `served` or `completed`. Manual fiscalization is also available.

---

## Prerequisites

| Requirement | Where to get it |
|-------------|-----------------|
| TPIN | Rwanda Revenue Authority registration |
| Branch ID (`bhfId`) | RRA (usually `"000"` for single-branch) |
| Device Serial No (`dvcSrlNo`) | RRA issued with VSDC approval |
| VSDC server URL | Deploy RRA WAR file locally, or use ALGO hosted endpoint |

---

## Setup

### 1. Deploy VSDC server

The VSDC is a Java WAR file provided by RRA (or a certified third-party like ALGO). Deploy it on a server accessible from the backend. Default port is `8088`.

### 2. Save EBM configuration

```http
POST /api/ebm/config
Content-Type: application/json

{
  "restaurantId": "your-restaurant-id",
  "tpin": "YOUR_TPIN",
  "bhfId": "000",
  "dvcSrlNo": "YOUR_DEVICE_SERIAL",
  "baseUrl": "http://your-vsdc-server:8088",
  "env": "production"
}
```

### 3. Initialize device

Call once to register the device with RRA and verify credentials:

```http
POST /api/ebm/initialize
Content-Type: application/json

{ "restaurantId": "your-restaurant-id" }
```

**Success response:**
```json
{
  "resultCd": "000",
  "resultMsg": "Success",
  "resultDt": "20240501120000",
  "data": {
    "tpin": "YOUR_TPIN",
    "taxprNm": "Your Business Name",
    "bhfId": "000",
    "bhfNm": "Main Branch",
    "mgrNm": "Manager Name",
    "mgrTelNo": "+250700000000"
  }
}
```

A `resultCd` of `"000"` means the device is live. Any other code indicates a credentials or connectivity problem.

---

## How Fiscalization Works

### Automatic (recommended)

Every order that transitions to `served` or `completed` is automatically fiscalized in the background. It never blocks the order status response — if VSDC is unavailable, the order still completes and the fiscalization is recorded as `failed` in `ebm_invoices` for retry.

### Manual

```http
POST /api/ebm/fiscalize/:orderId
Content-Type: application/json

{
  "restaurantId": "your-restaurant-id",
  "paymentType": "01",
  "custTin": "CUSTOMER_TIN_OPTIONAL"
}
```

### Refund

```http
POST /api/ebm/fiscalize-refund/:orderId
Content-Type: application/json

{
  "restaurantId": "your-restaurant-id",
  "paymentType": "01"
}
```

Requires the original order to already have a successful `"S"` invoice. The refund (`"R"`) invoice references the original `cisInvcNo`.

---

## Rwanda VAT Rules

| Category | Code | Rate | Use case |
|----------|------|------|----------|
| Standard | `B` | 18% | All regular sales (food, beverages, services) |
| Exempt | `A` | 0% | Exempt goods/services |
| Export | `C` | 0% | Exported goods |
| Non-Taxable | `D` | 0% | Outside VAT scope |

Most restaurant sales use **Category B (18%)**.

Prices in this system are **VAT-inclusive**. The service calculates:
```
taxableAmount = totalPrice / 1.18
vatAmount     = totalPrice - taxableAmount
```

### Payment type codes

| Code | Method |
|------|--------|
| `01` | Cash |
| `02` | Credit / Debit card |
| `03` | Cheque |
| `04` | Mobile Money (MTN MoMo, Airtel) |
| `05` | Other |

---

## API Reference

All endpoints are prefixed with `/api/ebm`.

### Configuration

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/config?restaurantId=` | Get saved EBM config |
| `POST` | `/config` | Save or update EBM config |
| `POST` | `/initialize` | Initialize/verify device with VSDC |

### Reference Data (from VSDC)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/codes` | `{ restaurantId, lastReqDt? }` | Tax/unit code lists |
| `POST` | `/item-classes` | `{ restaurantId, lastReqDt? }` | HS code classification list |
| `POST` | `/notices` | `{ restaurantId, lastReqDt? }` | RRA system notices |
| `POST` | `/branches` | `{ restaurantId, lastReqDt? }` | Branch list |

`lastReqDt` format: `"YYYYMMDDHHmmss"`. Omit to fetch all records.

### Customer

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/customer` | `{ restaurantId, custTin }` | Look up customer by TIN |

### Items

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/items/save` | Register a new item with VSDC |
| `PUT` | `/items/update` | Update existing item |
| `GET` | `/items?restaurantId=` | List all registered items |
| `GET` | `/items/:itemCd?restaurantId=` | Get a specific item |

### Sales

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/fiscalize/:orderId` | `{ restaurantId, paymentType?, custTin? }` | Fiscalize a completed sale |
| `POST` | `/fiscalize-refund/:orderId` | `{ restaurantId, paymentType? }` | Fiscalize a refund |
| `POST` | `/sales` | Raw `saveSales` payload | Direct VSDC passthrough |
| `GET` | `/sales/invoice?restaurantId=&invcNo=` | — | Retrieve invoice from VSDC |
| `POST` | `/sales/principals` | `{ restaurantId, lastReqDt? }` | RVAT principal list |

### Purchases

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/purchases/save` | `{ restaurantId, ...purchaseData }` | Record a purchase with VSDC |
| `POST` | `/purchases/select` | `{ restaurantId, lastReqDt? }` | Retrieve purchase history |

### Stock

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stock/master` | Update stock master quantities |
| `POST` | `/stock/save` | Record stock movements |
| `GET` | `/stock?restaurantId=` | List stock items from VSDC |

### Imports

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/imports?restaurantId=` | Get import items from VSDC |
| `PUT` | `/imports/update` | Update import item status |

### Fiscal Invoice Records (local DB)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/invoices?restaurantId=&status=&limit=&offset=` | List all fiscal invoices |
| `GET` | `/invoices/:id` | Get a single fiscal invoice record |

---

## Database Schema

### `ebm_config`

Stores per-restaurant VSDC credentials.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Auto-generated |
| `restaurant_id` | TEXT UNIQUE | Links to `restaurants` |
| `tpin` | TEXT | Taxpayer ID from RRA |
| `bhf_id` | TEXT | Branch ID (default `"000"`) |
| `dvc_srl_no` | TEXT | Device serial number from RRA |
| `base_url` | TEXT | VSDC server URL |
| `env` | TEXT | `sandbox` or `production` |
| `is_active` | BOOLEAN | Enable/disable EBM for this restaurant |
| `last_req_dt` | TEXT | Last VSDC request timestamp |
| `initialized_at` | TIMESTAMPTZ | When device was last initialized |

### `ebm_invoices`

Audit trail of every fiscalization attempt.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | App-generated (`ebm-xxxxx`) |
| `restaurant_id` | TEXT | Restaurant |
| `order_id` | TEXT | Source order |
| `invoice_type` | TEXT | `S`=Sale, `R`=Refund, `T`=Training |
| `cis_invc_no` | TEXT | Our invoice number sent to VSDC |
| `org_invc_no` | TEXT | Original invoice no. (refunds only) |
| `rcpt_no` | INTEGER | Receipt number from VSDC |
| `rcpt_sign` | TEXT | Digital signature from VSDC |
| `intrl_data` | TEXT | Internal data hash from VSDC |
| `sdc_id` | TEXT | SDC device ID from VSDC |
| `tot_rcpt_no` | INTEGER | Running total receipt count |
| `cust_tin` | TEXT | Customer TIN (if provided) |
| `tot_amt` | NUMERIC | Total invoice amount (RWF) |
| `tot_taxbl_amt` | NUMERIC | Taxable amount |
| `tot_tax_amt` | NUMERIC | VAT amount |
| `raw_request` | JSONB | Full request payload sent to VSDC |
| `raw_response` | JSONB | Full VSDC response |
| `status` | TEXT | `pending`, `success`, `failed` |
| `error_msg` | TEXT | Error message if failed |
| `fiscalized_at` | TIMESTAMPTZ | When VSDC returned success |

### Orders table (added columns)

| Column | Type | Description |
|--------|------|-------------|
| `ebm_invoice_id` | TEXT | Links to `ebm_invoices.id` |
| `ebm_rcpt_sign` | TEXT | Receipt signature (print on receipt) |
| `ebm_rcpt_no` | INTEGER | Receipt number (print on receipt) |
| `ebm_fiscalized_at` | TIMESTAMPTZ | When fiscalization succeeded |

---

## Receipt Requirements

RRA requires the following to appear on every fiscal receipt:

- Receipt number (`ebm_rcpt_no`)
- Digital signature (`ebm_rcpt_sign`)  
- SDC ID (`sdc_id` from `ebm_invoices`)
- VAT breakdown (taxable amount + VAT amount)
- Verification URL (for QR code scanning)

---

## VSDC Response Codes

| Code | Meaning |
|------|---------|
| `000` | Success |
| `001` | Invalid TPIN |
| `002` | Invalid branch ID |
| `003` | Invalid device serial |
| `010` | Duplicate invoice number |
| `800`+ | Server / connectivity error |

---

## Environment Variables

Add to `backend/.env`:

```env
# VSDC base URL (sandbox runs locally, production is RRA-issued)
EBM_SANDBOX_URL=http://localhost:8088
EBM_PROD_URL=https://ebm.rra.gov.rw
EBM_ENV=sandbox
```

Per-restaurant credentials are stored in the `ebm_config` database table, not in environment variables.

---

## Source Files

| File | Description |
|------|-------------|
| `backend/src/services/ebmService.ts` | VSDC API client — all 25 endpoints |
| `backend/src/routes/ebm.ts` | Express route handlers |
| `backend/src/routes/orders.ts` | Auto-fiscalization on order completion |
| `src/api/ebm.ts` | Frontend TypeScript API client |
| `backend/migrations/037_ebm_fiscal.sql` | Database schema |
