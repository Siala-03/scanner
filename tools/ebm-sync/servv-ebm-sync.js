#!/usr/bin/env node
/**
 * SERVV EBM Local Sync Script
 * Runs on the Windows PC where VSDC is installed.
 * Fetches pending invoices from SERVV, sends them to local VSDC, reports results back.
 *
 * Setup:
 *   1. Install Node.js (https://nodejs.org) on the Windows PC
 *   2. Edit the CONFIG section below with your restaurant credentials
 *   3. Run manually:          node servv-ebm-sync.js
 *   4. Schedule automatically: Task Scheduler → every 2 hours → node C:\servv-sync\servv-ebm-sync.js
 */

// ─── CONFIG (edit these) ──────────────────────────────────────────────────────
const CONFIG = {
  servvApiUrl:  'https://your-backend.example.com',  // Your SERVV backend URL
  restaurantId: 'YOUR_RESTAURANT_ID',                // From SERVV manager settings
  vsdcUrl:      'http://localhost:8088',             // Local VSDC address (rarely changes)
};
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https');
const http  = require('http');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const body   = options.body ? JSON.stringify(options.body) : undefined;

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': body ? Buffer.byteLength(body) : 0,
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function sync() {
  const startedAt = new Date().toISOString();
  console.log(`\n[${startedAt}] SERVV EBM Sync started`);
  console.log(`  SERVV API : ${CONFIG.servvApiUrl}`);
  console.log(`  Restaurant: ${CONFIG.restaurantId}`);
  console.log(`  VSDC      : ${CONFIG.vsdcUrl}\n`);

  // 1. Fetch pending invoices from SERVV
  let pending;
  try {
    const res = await request(
      `${CONFIG.servvApiUrl}/api/ebm/pending?restaurantId=${encodeURIComponent(CONFIG.restaurantId)}`
    );
    if (res.status !== 200) {
      console.error(`✗ Failed to fetch pending invoices: HTTP ${res.status}`, res.body);
      process.exit(1);
    }
    pending = res.body;
  } catch (err) {
    console.error('✗ Cannot reach SERVV API:', err.message);
    process.exit(1);
  }

  if (!pending.length) {
    console.log('✓ No pending invoices. Nothing to sync.');
    return;
  }

  console.log(`Found ${pending.length} pending invoice(s). Sending to VSDC...\n`);

  // 2. Send each to local VSDC
  const results = [];
  for (const invoice of pending) {
    process.stdout.write(`  → ${invoice.cis_invc_no} (${invoice.invoice_type}) ... `);

    const endpoint = invoice.invoice_type === 'S' || invoice.invoice_type === 'R'
      ? '/trnsSales/saveSales'
      : '/trnsSales/saveSales';

    try {
      const res = await request(`${CONFIG.vsdcUrl}${endpoint}`, {
        method: 'POST',
        body:   invoice.raw_request,
      });

      const vsdcResult = res.body;
      if (vsdcResult.resultCd === '000') {
        console.log(`✓ rcptNo=${vsdcResult.data?.rcptNo}`);
      } else {
        console.log(`✗ ${vsdcResult.resultCd}: ${vsdcResult.resultMsg}`);
      }
      results.push({ invoiceId: invoice.id, vsdcResult });
    } catch (err) {
      console.log(`✗ VSDC error: ${err.message}`);
      results.push({
        invoiceId: invoice.id,
        vsdcResult: { resultCd: 'ERR', resultMsg: err.message },
      });
    }
  }

  // 3. Report results back to SERVV
  console.log('\nReporting results to SERVV...');
  try {
    const res = await request(`${CONFIG.servvApiUrl}/api/ebm/sync-result`, {
      method: 'POST',
      body:   { restaurantId: CONFIG.restaurantId, results },
    });
    if (res.status === 200) {
      const { updated, failed } = res.body;
      console.log(`✓ Sync complete: ${updated} succeeded, ${failed} failed`);
    } else {
      console.error(`✗ Failed to report results: HTTP ${res.status}`, res.body);
    }
  } catch (err) {
    console.error('✗ Cannot reach SERVV API to report results:', err.message);
  }
}

sync().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
