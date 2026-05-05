import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import {
  selectInitInfo,
  selectCodeList,
  selectItemsClass,
  selectNotices,
  selectBranches,
  selectCustomer,
  saveItem,
  updateItem,
  selectItems,
  selectItem,
  saveSales,
  savePurchase,
  selectPurchases,
  selectInvoice,
  selectPrincipals,
  saveStockMaster,
  saveStockItems,
  SaveSalesData,
  selectStockItems,
  selectImportItems,
  updateImportItems,
  buildSalesFromOrder,
  EbmConfig,
} from '../services/ebmService.js';

const router = Router();

// ─── Config helpers ───────────────────────────────────────────────────────────

async function getEbmConfig(restaurantId: string): Promise<EbmConfig | null> {
  const result = await pool.query(
    'SELECT * FROM ebm_config WHERE restaurant_id = $1 AND is_active = true LIMIT 1',
    [restaurantId]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return { tpin: r.tpin, bhfId: r.bhf_id, dvcSrlNo: r.dvc_srl_no, baseUrl: r.base_url };
}

function requireRestaurantId(req: Request, res: Response): string | null {
  const id = (req.query.restaurantId || req.body?.restaurantId) as string;
  if (!id) { res.status(400).json({ error: 'restaurantId is required' }); return null; }
  return id;
}

// ─── EBM Configuration ────────────────────────────────────────────────────────

// GET /api/ebm/config?restaurantId=
router.get('/config', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;

    const result = await pool.query(
      `SELECT id, restaurant_id, tpin, bhf_id, dvc_srl_no, base_url, env,
              is_active, last_req_dt, initialized_at, created_at, updated_at
       FROM ebm_config WHERE restaurant_id = $1`,
      [restaurantId]
    );
    res.json(result.rows[0] ?? null);
  } catch (err) {
    console.error('GET /ebm/config error:', err);
    res.status(500).json({ error: 'Failed to fetch EBM config' });
  }
});

// POST /api/ebm/config – upsert configuration
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { restaurantId, tpin, bhfId, dvcSrlNo, baseUrl, env } = req.body;
    if (!restaurantId || !tpin || !bhfId || !dvcSrlNo) {
      return res.status(400).json({ error: 'restaurantId, tpin, bhfId, dvcSrlNo are required' });
    }

    const result = await pool.query(
      `INSERT INTO ebm_config (restaurant_id, tpin, bhf_id, dvc_srl_no, base_url, env, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, now())
       ON CONFLICT (restaurant_id) DO UPDATE SET
         tpin        = EXCLUDED.tpin,
         bhf_id      = EXCLUDED.bhf_id,
         dvc_srl_no  = EXCLUDED.dvc_srl_no,
         base_url    = EXCLUDED.base_url,
         env         = EXCLUDED.env,
         is_active   = true,
         updated_at  = now()
       RETURNING *`,
      [restaurantId, tpin, bhfId, dvcSrlNo, baseUrl || 'http://localhost:8088', env || 'sandbox']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /ebm/config error:', err);
    res.status(500).json({ error: 'Failed to save EBM config' });
  }
});

// ─── Device Initialization ────────────────────────────────────────────────────

// POST /api/ebm/initialize
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;

    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found. Save configuration first.' });

    const result = await selectInitInfo(config);

    if (result.resultCd === '000') {
      await pool.query(
        `UPDATE ebm_config SET initialized_at = now(), last_req_dt = $1, updated_at = now()
         WHERE restaurant_id = $2`,
        [result.resultDt, restaurantId]
      );
    }

    res.json(result);
  } catch (err) {
    console.error('POST /ebm/initialize error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to initialize EBM device' });
  }
});

// ─── Reference Data ───────────────────────────────────────────────────────────

// POST /api/ebm/codes
router.post('/codes', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectCodeList(config, req.body.lastReqDt || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch codes' });
  }
});

// POST /api/ebm/item-classes
router.post('/item-classes', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectItemsClass(config, req.body.lastReqDt || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch item classes' });
  }
});

// POST /api/ebm/notices
router.post('/notices', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectNotices(config, req.body.lastReqDt || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch notices' });
  }
});

// POST /api/ebm/branches
router.post('/branches', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectBranches(config, req.body.lastReqDt || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch branches' });
  }
});

// ─── Customer Lookup ──────────────────────────────────────────────────────────

// POST /api/ebm/customer
router.post('/customer', async (req: Request, res: Response) => {
  try {
    const { restaurantId, custTin } = req.body;
    if (!restaurantId || !custTin) {
      return res.status(400).json({ error: 'restaurantId and custTin are required' });
    }
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectCustomer(config, custTin));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch customer' });
  }
});

// ─── Items ────────────────────────────────────────────────────────────────────

// POST /api/ebm/items/save
router.post('/items/save', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...itemData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await saveItem(config, itemData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save item' });
  }
});

// PUT /api/ebm/items/update
router.put('/items/update', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...itemData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await updateItem(config, itemData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update item' });
  }
});

// GET /api/ebm/items?restaurantId=&lastReqDt=
router.get('/items', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectItems(config, (req.query.lastReqDt as string) || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch items' });
  }
});

// GET /api/ebm/items/:itemCd?restaurantId=
router.get('/items/:itemCd', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectItem(config, req.params.itemCd));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch item' });
  }
});

// ─── Sales Fiscalization ──────────────────────────────────────────────────────

// POST /api/ebm/fiscalize/:orderId
router.post('/fiscalize/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { restaurantId, paymentType, custTin } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    if (typeof order.items === 'string') order.items = JSON.parse(order.items);

    // Prevent double-fiscalization
    const existing = await pool.query(
      "SELECT id FROM ebm_invoices WHERE order_id = $1 AND status = 'success' AND invoice_type = 'S' LIMIT 1",
      [orderId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Order already fiscalized', invoiceId: existing.rows[0].id });
    }

    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found. Configure EBM settings first.' });

    const cisInvcNo = order.order_number || `INV-${orderId.slice(-8).toUpperCase()}`;
    const salesData = buildSalesFromOrder(
      { ...order, customer_tin: custTin },
      cisInvcNo,
      paymentType || '01',
      'S'
    );

    const invoiceId = `ebm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    await pool.query(
      `INSERT INTO ebm_invoices
         (id, restaurant_id, order_id, invoice_type, cis_invc_no, cust_tin, cust_nm,
          pmt_ty_cd, tot_amt, tot_taxbl_amt, tot_tax_amt, raw_request, status)
       VALUES ($1,$2,$3,'S',$4,$5,$6,$7,$8,$9,$10,$11,'pending')`,
      [invoiceId, restaurantId, orderId, cisInvcNo, custTin || null,
       salesData.custNm, salesData.pmtTyCd, salesData.totAmt,
       salesData.totTaxblAmt, salesData.totTaxAmt, JSON.stringify(salesData)]
    );

    let vsdcResult;
    try {
      vsdcResult = await saveSales(config, salesData);
    } catch (apiErr) {
      await pool.query(
        "UPDATE ebm_invoices SET status='failed', error_msg=$1 WHERE id=$2",
        [String(apiErr), invoiceId]
      );
      throw apiErr;
    }

    if (vsdcResult.resultCd === '000') {
      const d = (vsdcResult.data || {}) as SaveSalesData;
      await pool.query(
        `UPDATE ebm_invoices
         SET status='success', rcpt_no=$1, intrl_data=$2, rcpt_sign=$3,
             sdc_id=$4, tot_rcpt_no=$5, raw_response=$6, fiscalized_at=now()
         WHERE id=$7`,
        [d.rcptNo, d.intrlData, d.rcptSign, d.sdcId, d.totRcptNo, JSON.stringify(vsdcResult), invoiceId]
      );
      await pool.query(
        `UPDATE orders
         SET ebm_invoice_id=$1, ebm_rcpt_sign=$2, ebm_rcpt_no=$3, ebm_fiscalized_at=now(), updated_at=now()
         WHERE id=$4`,
        [invoiceId, d.rcptSign, d.rcptNo, orderId]
      );
    } else {
      await pool.query(
        "UPDATE ebm_invoices SET status='failed', error_msg=$1, raw_response=$2 WHERE id=$3",
        [vsdcResult.resultMsg, JSON.stringify(vsdcResult), invoiceId]
      );
    }

    res.json({ invoiceId, vsdcResult });
  } catch (err) {
    console.error('POST /ebm/fiscalize error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fiscalize order' });
  }
});

// POST /api/ebm/fiscalize-refund/:orderId
router.post('/fiscalize-refund/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { restaurantId, paymentType } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    if (typeof order.items === 'string') order.items = JSON.parse(order.items);

    const origInvoice = await pool.query(
      "SELECT * FROM ebm_invoices WHERE order_id=$1 AND status='success' AND invoice_type='S' LIMIT 1",
      [orderId]
    );
    if (origInvoice.rows.length === 0) {
      return res.status(404).json({ error: 'Original fiscal invoice not found for this order' });
    }
    const orig = origInvoice.rows[0];

    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });

    const refundInvNo = `REF-${orig.cis_invc_no}`;
    const salesData = buildSalesFromOrder(order, refundInvNo, paymentType || '01', 'R', orig.cis_invc_no);

    const invoiceId = `ebm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    await pool.query(
      `INSERT INTO ebm_invoices
         (id, restaurant_id, order_id, invoice_type, cis_invc_no, org_invc_no,
          pmt_ty_cd, tot_amt, tot_taxbl_amt, tot_tax_amt, raw_request, status)
       VALUES ($1,$2,$3,'R',$4,$5,$6,$7,$8,$9,$10,'pending')`,
      [invoiceId, restaurantId, orderId, refundInvNo, orig.cis_invc_no,
       salesData.pmtTyCd, salesData.totAmt, salesData.totTaxblAmt,
       salesData.totTaxAmt, JSON.stringify(salesData)]
    );

    let vsdcResult;
    try {
      vsdcResult = await saveSales(config, salesData);
    } catch (apiErr) {
      await pool.query(
        "UPDATE ebm_invoices SET status='failed', error_msg=$1 WHERE id=$2",
        [String(apiErr), invoiceId]
      );
      throw apiErr;
    }

    if (vsdcResult.resultCd === '000') {
      const d = (vsdcResult.data || {}) as SaveSalesData;
      await pool.query(
        `UPDATE ebm_invoices
         SET status='success', rcpt_no=$1, intrl_data=$2, rcpt_sign=$3,
             sdc_id=$4, tot_rcpt_no=$5, raw_response=$6, fiscalized_at=now()
         WHERE id=$7`,
        [d.rcptNo, d.intrlData, d.rcptSign, d.sdcId, d.totRcptNo, JSON.stringify(vsdcResult), invoiceId]
      );
    } else {
      await pool.query(
        "UPDATE ebm_invoices SET status='failed', error_msg=$1, raw_response=$2 WHERE id=$3",
        [vsdcResult.resultMsg, JSON.stringify(vsdcResult), invoiceId]
      );
    }

    res.json({ invoiceId, vsdcResult });
  } catch (err) {
    console.error('POST /ebm/fiscalize-refund error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fiscalize refund' });
  }
});

// POST /api/ebm/sales – raw saveSales passthrough
router.post('/sales', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...salesData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await saveSales(config, salesData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save sales' });
  }
});

// GET /api/ebm/sales/invoice?restaurantId=&invcNo=
router.get('/sales/invoice', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const { invcNo } = req.query;
    if (!invcNo) return res.status(400).json({ error: 'invcNo is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectInvoice(config, invcNo as string));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch invoice' });
  }
});

// POST /api/ebm/sales/principals
router.post('/sales/principals', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectPrincipals(config, req.body.lastReqDt || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch principals' });
  }
});

// ─── Purchases ────────────────────────────────────────────────────────────────

// POST /api/ebm/purchases/save
router.post('/purchases/save', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...purchaseData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await savePurchase(config, purchaseData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save purchase' });
  }
});

// POST /api/ebm/purchases/select
router.post('/purchases/select', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectPurchases(config, req.body.lastReqDt || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch purchases' });
  }
});

// ─── Stock ────────────────────────────────────────────────────────────────────

// POST /api/ebm/stock/master
router.post('/stock/master', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...stockData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await saveStockMaster(config, stockData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save stock master' });
  }
});

// POST /api/ebm/stock/save
router.post('/stock/save', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...stockData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await saveStockItems(config, stockData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save stock items' });
  }
});

// GET /api/ebm/stock?restaurantId=&lastReqDt=
router.get('/stock', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectStockItems(config, (req.query.lastReqDt as string) || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch stock items' });
  }
});

// ─── Imports ──────────────────────────────────────────────────────────────────

// GET /api/ebm/imports?restaurantId=&lastReqDt=
router.get('/imports', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await selectImportItems(config, (req.query.lastReqDt as string) || '20000101000000'));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch import items' });
  }
});

// PUT /api/ebm/imports/update
router.put('/imports/update', async (req: Request, res: Response) => {
  try {
    const { restaurantId, ...importData } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const config = await getEbmConfig(restaurantId);
    if (!config) return res.status(404).json({ error: 'EBM config not found' });
    res.json(await updateImportItems(config, importData));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update import items' });
  }
});

// ─── Fiscal Invoice Records ───────────────────────────────────────────────────

// GET /api/ebm/invoices?restaurantId=&status=&limit=&offset=
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;

    const { status, limit = '50', offset = '0' } = req.query;
    const params: unknown[] = [restaurantId];
    let query = 'SELECT * FROM ebm_invoices WHERE restaurant_id = $1';

    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /ebm/invoices error:', err);
    res.status(500).json({ error: 'Failed to fetch EBM invoices' });
  }
});

// GET /api/ebm/invoices/:id
router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM ebm_invoices WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// ─── Local VSDC batch sync result ────────────────────────────────────────────
// Called by the local sync script after it has processed pending invoices
// POST /api/ebm/sync-result
router.post('/sync-result', async (req: Request, res: Response) => {
  try {
    const { restaurantId, results } = req.body;
    if (!restaurantId || !Array.isArray(results)) {
      return res.status(400).json({ error: 'restaurantId and results[] are required' });
    }

    const updated: string[] = [];
    const failed: string[] = [];

    for (const r of results) {
      const { invoiceId, vsdcResult } = r as { invoiceId: string; vsdcResult: any };
      if (!invoiceId || !vsdcResult) continue;

      if (vsdcResult.resultCd === '000') {
        const d = vsdcResult.data || {};
        await pool.query(
          `UPDATE ebm_invoices
           SET status='success', rcpt_no=$1, intrl_data=$2, rcpt_sign=$3,
               sdc_id=$4, tot_rcpt_no=$5, raw_response=$6, fiscalized_at=now()
           WHERE id=$7 AND restaurant_id=$8`,
          [d.rcptNo, d.intrlData, d.rcptSign, d.sdcId, d.totRcptNo,
           JSON.stringify(vsdcResult), invoiceId, restaurantId]
        );
        // Stamp the order too
        await pool.query(
          `UPDATE orders
           SET ebm_invoice_id=$1, ebm_rcpt_sign=$2, ebm_rcpt_no=$3, ebm_fiscalized_at=now(), updated_at=now()
           WHERE id = (SELECT order_id FROM ebm_invoices WHERE id=$1)`,
          [invoiceId, d.rcptSign, d.rcptNo]
        );
        updated.push(invoiceId);
      } else {
        await pool.query(
          `UPDATE ebm_invoices SET status='failed', error_msg=$1, raw_response=$2 WHERE id=$3 AND restaurant_id=$4`,
          [vsdcResult.resultMsg, JSON.stringify(vsdcResult), invoiceId, restaurantId]
        );
        failed.push(invoiceId);
      }
    }

    res.json({ updated: updated.length, failed: failed.length, updatedIds: updated });
  } catch (err) {
    console.error('POST /ebm/sync-result error:', err);
    res.status(500).json({ error: 'Failed to process sync results' });
  }
});

// GET /api/ebm/pending?restaurantId= – lightweight list for sync script
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const restaurantId = requireRestaurantId(req, res);
    if (!restaurantId) return;
    const result = await pool.query(
      `SELECT id, cis_invc_no, org_invc_no, invoice_type, raw_request
       FROM ebm_invoices
       WHERE restaurant_id = $1 AND status = 'pending'
       ORDER BY created_at ASC LIMIT 100`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending invoices' });
  }
});

export const ebmRouter = router;
