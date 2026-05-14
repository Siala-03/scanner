# EBM VSDC Integration - Local Deployment Implementation Plan

## Overview

This plan covers setting up the Rwanda Revenue Authority (RRA) EBM / VSDC integration using a **locally deployed VSDC server** on localhost, with an easy migration path to production when ready.

---

## Phase 1: Local VSDC Deployment (Development)

### 1.1 Prerequisites

- **VSDC WAR File**: Obtain from RRA or ALGO (certified provider)
  - File: `vsdc-[version].war`
  - Java 8+ installed locally
  - Tomcat or similar Java servlet container

- **RRA Credentials** (for testing):
  - TPIN (Taxpayer PIN)
  - Branch ID (bhfId) - usually `"000"` for single branch
  - Device Serial No (dvcSrlNo) - RRA-issued
  - Can use **sandbox/training credentials** initially

### 1.2 Local VSDC Setup

#### Option A: Docker (Recommended)

```dockerfile
# Dockerfile for local VSDC
FROM tomcat:9-jdk11

COPY vsdc-algo-8.2.war /usr/local/tomcat/webapps/ROOT.war

EXPOSE 8088

CMD ["catalina.sh", "run"]
```

Build and run:
```bash
docker build -t vsdc-local .
docker run -d -p 8088:8088 --name vsdc-local vsdc-local
```

**Verify deployment:**
```bash
curl http://localhost:8088/initializer/selectInitInfo
# Should return 200 OK
```

#### Option B: Direct Tomcat

1. Download Tomcat 9+
2. Place `vsdc-algo-8.2.war` in `$TOMCAT_HOME/webapps/ROOT.war`
3. Start Tomcat: `./catalina.sh run`
4. VSDC available at `http://localhost:8088`

### 1.3 Configure Backend for Localhost

**Step 1:** Update environment variables or `.env` file:

```env
EBM_BASE_URL=http://localhost:8088
EBM_ENV=sandbox
EBM_TPIN=YOUR_SANDBOX_TPIN
EBM_BHF_ID=000
EBM_DVC_SRL_NO=YOUR_SANDBOX_DEVICE_SERIAL
```

**Step 2:** Restart backend service:

```bash
npm run dev
# or production
npm start
```

### 1.4 Test Local VSDC Connection

Call the initialization endpoint:

```bash
curl -X POST http://localhost:3000/api/ebm/initialize \
  -H "Content-Type: application/json" \
  -d '{ "restaurantId": "test-restaurant" }'
```

**Expected response (success):**
```json
{
  "resultCd": "000",
  "resultMsg": "Success",
  "data": {
    "tpin": "YOUR_TPIN",
    "taxprNm": "Your Business Name",
    "bhfId": "000",
    "mgrNm": "Manager Name"
  }
}
```

**If failed:** Check VSDC logs and verify connectivity:
```bash
# Check VSDC is running
curl http://localhost:8088/
```

---

## Phase 2: Configuration Management

### 2.1 Multi-Environment Config

Store EBM config in database per restaurant:

```sql
-- Save localhost config for testing
INSERT INTO ebm_config (id, restaurant_id, tpin, bhf_id, dvc_srl_no, base_url, env, is_active)
VALUES (
  'ebm-cfg-001',
  'test-restaurant-001',
  'SANDBOX_TPIN_123',
  '000',
  'SANDBOX_DEVICE_001',
  'http://localhost:8088',
  'sandbox',
  true
);
```

### 2.2 Runtime Environment Variable

The backend reads from environment:

```typescript
// backend/src/services/ebmService.ts (excerpt)
const baseUrl = process.env.EBM_BASE_URL || 'http://localhost:8088';
const env = process.env.EBM_ENV || 'sandbox';
```

### 2.3 Manager Portal Configuration UI

Managers can configure EBM in the manager dashboard:

```http
POST /api/ebm/config
Content-Type: application/json

{
  "restaurantId": "test-restaurant-001",
  "tpin": "SANDBOX_TPIN_123",
  "bhfId": "000",
  "dvcSrlNo": "SANDBOX_DEVICE_001",
  "baseUrl": "http://localhost:8088",
  "env": "sandbox"
}
```

---

## Phase 3: Testing Fiscalization

### 3.1 Automated Testing (Localhost)

Every order completion triggers auto-fiscalization:

```typescript
// Example: Order transitions to "served"
PUT /api/orders/:orderId
{
  "status": "served"
}

// → Backend automatically calls:
//   POST /api/ebm/fiscalize/:orderId
```

**Check fiscal invoice record:**

```bash
curl http://localhost:3000/api/ebm/invoices?restaurantId=test-restaurant-001
```

Response:
```json
{
  "invoices": [
    {
      "id": "ebm-inv-001",
      "orderId": "order-123",
      "invoiceType": "S",
      "status": "success",
      "rcptNo": 1,
      "rcptSign": "ABC123...XYZ",
      "totAmt": 25000,
      "totTaxAmt": 3814,
      "fiscalizedAt": "2026-05-13T10:30:00Z"
    }
  ]
}
```

### 3.2 Manual Testing

Test refund fiscalization:

```bash
curl -X POST http://localhost:3000/api/ebm/fiscalize-refund/:orderId \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "test-restaurant-001",
    "paymentType": "01"
  }'
```

### 3.3 Sandbox Validation Mode

RRA provides validation mode (`env: "sandbox"`) for testing without affecting live data:

- Invoices are recorded but not counted against your fiscal quota
- Receipt numbers are sequential (training only)
- Same API contract as production

---

## Phase 4: Receipt Integration

### 4.1 Print Fiscal Data on Receipt

After successful fiscalization, the receipt must include:

```typescript
// src/utils/receipt.ts (excerpt)
interface ReceiptData {
  // ... existing fields
  ebmRcptNo?: number;          // Receipt number from VSDC
  ebmRcptSign?: string;         // Digital signature from VSDC
  ebmSdcId?: string;            // SDC device ID
  ebmVatAmount?: number;        // VAT breakdown
  ebmTaxableAmount?: number;    // Taxable amount
}

function buildReceiptHtml(data: ReceiptData): string {
  // ... existing receipt layout
  if (data.ebmRcptNo) {
    html += `
      <div class="fiscal-section">
        <p class="fiscal-header">RRA FISCAL RECEIPT</p>
        <p>Receipt No: ${data.ebmRcptNo}</p>
        <p>Signature: ${data.ebmRcptSign}</p>
        <p>SDC: ${data.ebmSdcId}</p>
        <p>Taxable: ${formatPrice(data.ebmTaxableAmount)}</p>
        <p>VAT (18%): ${formatPrice(data.ebmVatAmount)}</p>
      </div>
    `;
  }
  return html;
}
```

### 4.2 QR Code for Verification

Include RRA verification QR code on receipt:

```html
<div class="qr-verification">
  <img src="https://rra.gov.rw/verify?rcptNo=${rcptNo}&sign=${sign}" 
       alt="RRA Verification QR" />
</div>
```

---

## Phase 5: Fallback & Error Handling

### 5.1 VSDC Unavailable Scenario

If localhost VSDC is down, orders still complete but fiscalization is marked `failed`:

```typescript
// backend/src/services/ebmService.ts (excerpt)
try {
  const result = await fiscalizeSale(config, order);
  // Store result with status: "success"
} catch (err) {
  // Store result with status: "failed"
  // Log error for manual retry
  console.error('Fiscalization failed:', err.message);
}

// Order completes REGARDLESS of VSDC status
return { ...order, status: 'served' };
```

**Manager retry panel:**

```http
POST /api/ebm/retry
{
  "restaurantId": "test-restaurant-001",
  "invoiceId": "ebm-inv-failed-001"
}
```

---

## Phase 6: Migration to Production

### 6.1 Switch Configuration

When ready to go live, simply update environment or database config:

**Before (localhost):**
```json
{
  "baseUrl": "http://localhost:8088",
  "env": "sandbox"
}
```

**After (production):**
```json
{
  "baseUrl": "https://vsdc-prod.rra.gov.rw",
  "env": "production"
}
```

**Update credentials:**
- Obtain **production TPIN** from RRA
- Receive **production device serial**
- Use **production branch ID**

### 6.2 Production Validation Checklist

Before switching to production:

- [ ] All test orders fiscalize successfully on localhost
- [ ] Receipts print with EBM fiscal data
- [ ] Error handling tested (VSDC down, network error, etc.)
- [ ] Receipt archive stored in database
- [ ] Refund flow tested
- [ ] Manager dashboard shows invoice history
- [ ] Production credentials obtained from RRA
- [ ] Production VSDC URL confirmed with RRA
- [ ] Backup system in place (if VSDC becomes unavailable)

### 6.3 Cutover Steps

1. **Backup existing data:**
   ```sql
   SELECT * INTO ebm_invoices_backup FROM ebm_invoices;
   ```

2. **Update config:**
   ```sql
   UPDATE ebm_config 
   SET base_url = 'https://vsdc-prod.rra.gov.rw',
       env = 'production',
       tpin = 'PROD_TPIN',
       dvc_srl_no = 'PROD_DEVICE'
   WHERE restaurant_id = 'production-restaurant';
   ```

3. **Initialize production device:**
   ```bash
   curl -X POST http://localhost:3000/api/ebm/initialize \
     -H "Content-Type: application/json" \
     -d '{ "restaurantId": "production-restaurant" }'
   ```

4. **Verify response code is `"000"`**

5. **Start processing live orders**

---

## Deployment Architecture

### Development (Current)

```
┌─────────────────────────┐
│   POS Frontend          │
│   (React/TypeScript)    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Backend Server        │
│   (localhost:3000)      │
└────────────┬────────────┘
             │
             ▼ (POST /api/ebm/fiscalize)
┌─────────────────────────┐
│   Local VSDC Server     │
│   (localhost:8088)      │
│   [Docker Container]    │
└────────────┬────────────┘
             │
             ▼ (VSDC validation only)
   ┌─────────────────────┐
   │ RRA Sandbox (no I/O)│
   └─────────────────────┘
```

### Production (Future)

```
┌─────────────────────────┐
│   POS Frontend          │
│   (Production Domain)   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Backend Server        │
│   (Production Domain)   │
└────────────┬────────────┘
             │
             ▼ (POST /api/ebm/fiscalize)
┌─────────────────────────┐
│   RRA VSDC Server       │
│   (vsdc-prod.rra.gov.rw)│
└────────────┬────────────┘
             │
             ▼ (VSDC validation + archival)
┌─────────────────────────┐
│   RRA Central Server    │
│   (Fiscal Records)      │
└─────────────────────────┘
```

---

## Implementation Timeline

### Week 1: Setup
- [ ] Obtain VSDC WAR file from RRA/ALGO
- [ ] Deploy local VSDC (Docker or Tomcat)
- [ ] Get sandbox credentials from RRA
- [ ] Configure backend environment variables
- [ ] Test localhost connectivity

### Week 2-3: Integration
- [ ] Implement fiscalization on order completion
- [ ] Add fiscal data to receipts
- [ ] Build error handling & retry logic
- [ ] Create manager EBM config UI
- [ ] Test end-to-end flow

### Week 4: Testing & Validation
- [ ] Run 50+ test transactions
- [ ] Verify receipt printing
- [ ] Test refund flows
- [ ] Validate fallback scenarios
- [ ] Document any issues

### Week 5: Preparation for Production
- [ ] Obtain production credentials from RRA
- [ ] Set up production VSDC endpoint
- [ ] Run production cutover checklist
- [ ] Brief staff on fiscal receipt handling

### Week 6: Go-Live
- [ ] Switch to production config
- [ ] Monitor initial transactions closely
- [ ] Handle any RRA compliance questions
- [ ] Archive fiscal records per RRA policy

---

## API Endpoints (Already Implemented)

### Configuration

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/ebm/config?restaurantId=` | Fetch current config |
| `POST` | `/api/ebm/config` | Save/update config |
| `POST` | `/api/ebm/initialize` | Test VSDC connection & initialize |

### Fiscalization

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/ebm/fiscalize/:orderId` | Fiscalize a sale |
| `POST` | `/api/ebm/fiscalize-refund/:orderId` | Fiscalize a refund |
| `GET` | `/api/ebm/invoices?restaurantId=` | List fiscal invoices |
| `GET` | `/api/ebm/invoices/:id` | Get single invoice detail |

### Reference Data

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/ebm/codes` | Fetch tax/unit codes from VSDC |
| `POST` | `/api/ebm/item-classes` | Fetch HS code classifications |
| `POST` | `/api/ebm/branches` | Fetch branch list |

---

## Troubleshooting

### Issue: "Cannot connect to localhost:8088"

**Solution:**
```bash
# Check if VSDC container is running
docker ps | grep vsdc-local

# Restart VSDC
docker restart vsdc-local

# Check logs
docker logs vsdc-local
```

### Issue: "Invalid credentials" error from VSDC

**Solution:**
- Verify TPIN, bhfId, dvcSrlNo are correct
- Confirm credentials are for sandbox environment
- Request new sandbox credentials from RRA

### Issue: Invoices showing "failed" status

**Solution:**
```bash
# Check VSDC logs
curl http://localhost:8088/logs

# Manual retry
curl -X POST http://localhost:3000/api/ebm/retry \
  -d '{ "invoiceId": "ebm-inv-failed-001" }'
```

---

## Key Files Modified

- `backend/src/services/ebmService.ts` - VSDC API integration
- `backend/src/routes/ebm.ts` - REST endpoints
- `backend/migrations/XXX_ebm_tables.sql` - Database schema
- `src/utils/receipt.ts` - Fiscal receipt formatting
- `.env` / `backend/.env` - Configuration

---

## RRA Compliance Notes

- **Offline capability:** If VSDC goes down, orders complete but marked for batch sync
- **Invoice numbering:** VSDC assigns receipt numbers sequentially
- **VAT calculation:** Always use 18% standard rate for food/beverages
- **Audit trail:** All invoices logged in `ebm_invoices` table for RRA audits
- **Receipt retention:** Physical receipts must be retained per RRA policy (7+ years)

---

## Support & References

- RRA-ALGO VSDC API: https://documenter.getpostman.com/view/20074551/2s9YXe74Jr
- RRA Official Site: https://www.rra.gov.rw/
- VSDC Documentation: See `docs/EBM_INTEGRATION.md`
