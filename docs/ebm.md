# EBM / Fiscal Integration Guide

SERVV supports Rwanda Revenue Authority (RRA) fiscal device integration for compliant invoice generation.

---

## Overview

| Mode | What it is | When to use |
|------|-----------|-------------|
| **OSDC** (Online SDC) | RRA cloud API for certified private billing systems | Once OSDC-certified (cloud-to-cloud, no hardware needed) |
| **Local VSDC** | Java WAR file running at `localhost:8088` on a Windows PC | If you have a local RRA VSDC device issued before OSDC |

EBM is **optional**. Outlets without EBM configured operate normally — fiscalization calls are silently skipped.

---

## Setup in SERVV

Go to **Setup → Fiscal (EBM)** in the manager portal.

### 1. Select Mode

| Option | URL auto-filled |
|--------|----------------|
| Online EBM (OSDC) | RRA OSDC endpoint |
| Local VSDC | `http://localhost:8088` |

### 2. Enter Credentials

| Field | Description |
|-------|-------------|
| TPIN | Your 9-digit taxpayer ID from RRA |
| Branch ID (BHF ID) | Branch identifier (usually `00` for single location) |
| Device Serial | Serial number of your SDC device |
| Environment | `Sandbox` for testing, `Production` for live |

### 3. Save & Initialize

- Click **Save Settings** to persist credentials
- Click **Initialize Device** to register with RRA — this exchanges your credentials for a security token
- Status shows `Active` / `Inactive` / `Error`

---

## How Fiscalization Works

Every confirmed payment automatically triggers fiscalization:

1. Cashier or supervisor confirms payment
2. SERVV sends the invoice to the EBM device (OSDC or VSDC)
3. RRA returns a **CIS Invoice Number** and **digital signature**
4. These are stored with the order and printed on the receipt

If EBM is not configured or the call fails, the sale completes normally — no disruption.

---

## Fiscal Invoice History

In the EBM settings page, the **Invoice History** section shows all fiscalized invoices:

- Date, invoice number, amount, VAT
- Status: `sent` / `error` / `pending`
- Expand any row to see full RRA response including the receipt signature

---

## Local VSDC — Automated Sync

Because SERVV's backend runs in the cloud (Render/Railway) and the VSDC runs on `localhost:8088`, direct connection is not possible. SERVV uses a **batch sync approach**:

1. Confirmed orders queue as "pending" invoices in the cloud database
2. A sync script on the Windows PC fetches pending invoices, sends them to the local VSDC, and reports results back

### One-Click Installer

In **Setup → Fiscal (EBM)**, scroll to **Local VSDC Sync** and click **Download Installer**.

This generates a `ServvEBM-Install.bat` file with your credentials pre-configured.

**To install:**
1. Download the `.bat` file
2. Double-click it (run as Administrator if prompted)
3. The installer:
   - Creates `%APPDATA%\ServvEBMSync\sync.ps1`
   - Registers a Windows Scheduled Task that runs every 2 hours silently
   - Runs an immediate first sync

**Requirements:**
- Windows 10 or later
- PowerShell 5+ (included in Windows 10)
- Local VSDC running at `http://localhost:8088`
- Internet access to reach the SERVV API

### Manual Sync

To run a sync immediately without waiting for the scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File "%APPDATA%\ServvEBMSync\sync.ps1"
```

---

## OSDC Certification

To use OSDC (recommended for new deployments), SERVV must be certified by RRA:

1. Email `cis_sdc_certification@rra.gov.rw` with:
   - Software documentation (architecture overview, API integration spec)
   - SLA templates
   - Test cases and test results from sandbox
2. RRA reviews and issues an OSDC base URL + production credentials
3. Update the OSDC URL in **Setup → Fiscal (EBM)** → select Online EBM mode

Typical certification timeline: **4–12 weeks** depending on RRA queue.

---

## VAT Calculation

SERVV applies RRA-specified VAT categories:

| Category | Rate | When |
|----------|------|------|
| A | 18% | Standard taxable items |
| B | 0% | Zero-rated (e.g. basic food items) |
| C | Exempt | Exempt items |
| D | 0% | Exported services |

VAT is calculated per line item. The fiscal invoice includes the breakdown by category.

---

## Payment Type Codes

| Payment method | RRA code |
|---------------|----------|
| Cash | `01` |
| Card | `02` |
| Mobile Money | `04` |
| Credit | `05` |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Status stays `Inactive` | Credentials not initialized | Click **Initialize Device** |
| `TPIN not found` error | Wrong TPIN or not registered with RRA | Verify TPIN at RRA portal |
| Invoices stuck as `pending` | VSDC sync not running | Run manual sync or check Task Scheduler |
| `Connection refused` on VSDC | VSDC service not running | Start VSDC service on Windows PC |
| Invoices show `error` status | RRA rejected the invoice | Expand the row to read the RRA error message |
