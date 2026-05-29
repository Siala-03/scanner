import { pool } from '../db.js';
import { buildSalesFromOrder, osdcSaveSales, saveSales, type EbmConfig } from './ebmService.js';
import { mapToOsdcSalesPayload, orderRowToOsdcTransaction } from './osdcPayloadMapper.js';
import { ReceiptCounter } from './receiptCounter.js';
import { CmcKeyManager } from './cmcKeyManager.js';
import { handleOsdcResponse } from './osdcErrorHandler.js';
import { logger } from '../logger.js';

const WORKER_LOCK_ID = 90210021;
const MAX_ATTEMPTS = 5;
const RETRY_MINUTES = [1, 2, 5, 10, 20];
const receiptCounter = new ReceiptCounter(pool);
const cmcKeyManager = new CmcKeyManager(pool);

export interface EnqueueSalesFiscalizationInput {
  restaurantId: string;
  orderId: string;
  paymentType?: string;
  custTin?: string;
  intentKey?: string;
}

export interface EnqueueFiscalizationResult {
  jobId: string | null;
  invoiceId?: string;
  intentKey: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'needs_review';
}

interface FiscalJobRow {
  id: string;
  restaurant_id: string;
  order_id: string;
  invoice_type: 'S' | 'R' | 'T';
  payment_type?: string | null;
  cust_tin?: string | null;
  intent_key: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'needs_review';
  attempts: number;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePaymentType(value: string | undefined): string {
  return value && value.trim() ? value.trim() : '01';
}

function defaultIntentKey(orderId: string): string {
  return `sale:${orderId}`;
}

async function getEbmConfig(restaurantId: string): Promise<EbmConfig | null> {
  const result = await pool.query(
    'SELECT * FROM ebm_config WHERE restaurant_id = $1 AND is_active = true LIMIT 1',
    [restaurantId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  let cmcKey: string | undefined = row.cmc_key || undefined;

  // Fall back to device_keys table (encrypted storage set via settings UI)
  if (!cmcKey) {
    try {
      const keyRow = await pool.query(
        `SELECT cmc_key_enc, expires_at
         FROM device_keys
         WHERE restaurant_id = $1 AND tin = $2 AND bhf_id = $3
         LIMIT 1`,
        [restaurantId, row.tpin, row.bhf_id]
      );
      const deviceKey = keyRow.rows[0];
      if (deviceKey?.cmc_key_enc && new Date(deviceKey.expires_at) > new Date()) {
        cmcKey = cmcKeyManager.decrypt(deviceKey.cmc_key_enc);
      }
    } catch (err) {
      console.warn('[ebmFiscalQueue] device_keys lookup failed, continuing without cmcKey', err);
    }
  }

  return {
    tpin: row.tpin,
    bhfId: row.bhf_id,
    dvcSrlNo: row.dvc_srl_no,
    baseUrl: row.base_url,
    cmcKey,
  };
}

async function markJobSuccess(jobId: string, invoiceId: string): Promise<void> {
  await pool.query(
    `UPDATE ebm_fiscal_jobs
     SET status = 'success',
         result_invoice_id = $2,
         processed_at = now(),
         updated_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL
     WHERE id = $1`,
    [jobId, invoiceId]
  );
}

async function markJobFailure(job: FiscalJobRow, errorMessage: string): Promise<void> {
  const retryMinutes = RETRY_MINUTES[Math.min(job.attempts, RETRY_MINUTES.length - 1)];
  const terminal = job.attempts >= MAX_ATTEMPTS;
  const nextStatus = terminal ? 'needs_review' : 'failed';

  await pool.query(
    `UPDATE ebm_fiscal_jobs
     SET status = $2,
         last_error = $3,
         next_attempt_at = CASE WHEN $2 = 'failed' THEN now() + ($4::text || ' minutes')::interval ELSE next_attempt_at END,
         processed_at = CASE WHEN $2 = 'needs_review' THEN now() ELSE processed_at END,
         updated_at = now(),
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1`,
    [job.id, nextStatus, errorMessage.slice(0, 2000), retryMinutes]
  );
}

async function markJobNeedsReview(job: FiscalJobRow, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE ebm_fiscal_jobs
     SET status = 'needs_review',
         last_error = $2,
         processed_at = now(),
         updated_at = now(),
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1`,
    [job.id, errorMessage.slice(0, 2000)]
  );
}

export async function enqueueSalesFiscalizationJob(input: EnqueueSalesFiscalizationInput): Promise<EnqueueFiscalizationResult> {
  const restaurantId = String(input.restaurantId || '').trim();
  const orderId = String(input.orderId || '').trim();
  if (!restaurantId || !orderId) {
    throw new Error('restaurantId and orderId are required');
  }

  const intentKey = (input.intentKey && input.intentKey.trim()) || defaultIntentKey(orderId);

  const successExisting = await pool.query(
    "SELECT id FROM ebm_invoices WHERE order_id = $1 AND invoice_type = 'S' AND status = 'success' LIMIT 1",
    [orderId]
  );
  if (successExisting.rows.length > 0) {
    return {
      jobId: null,
      invoiceId: successExisting.rows[0].id,
      intentKey,
      status: 'success',
    };
  }

  const payload = {
    paymentType: normalizePaymentType(input.paymentType),
    custTin: input.custTin || null,
  };

  const jobId = makeId('efj');
  const insert = await pool.query(
    `INSERT INTO ebm_fiscal_jobs
      (id, restaurant_id, order_id, invoice_type, payment_type, cust_tin, intent_key, status, attempts, payload, next_attempt_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'S', $4, $5, $6, 'pending', 0, $7::jsonb, now(), now(), now())
     ON CONFLICT (intent_key)
     DO UPDATE SET
       updated_at = now(),
       payment_type = COALESCE(ebm_fiscal_jobs.payment_type, EXCLUDED.payment_type),
       cust_tin = COALESCE(ebm_fiscal_jobs.cust_tin, EXCLUDED.cust_tin)
     RETURNING id, status`,
    [
      jobId,
      restaurantId,
      orderId,
      payload.paymentType,
      payload.custTin,
      intentKey,
      JSON.stringify(payload),
    ]
  );

  return {
    jobId: insert.rows[0].id,
    intentKey,
    status: insert.rows[0].status,
  };
}

async function acquireNextSalesJob(workerId: string): Promise<FiscalJobRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lock = await client.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [WORKER_LOCK_ID]);
    if (!lock.rows[0]?.locked) {
      await client.query('ROLLBACK');
      return null;
    }

    const picked = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM ebm_fiscal_jobs
         WHERE invoice_type = 'S'
           AND status IN ('pending', 'failed')
           AND next_attempt_at <= now()
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE ebm_fiscal_jobs j
          SET status = 'processing',
              attempts = attempts + 1,
              locked_at = now(),
              locked_by = $1,
              updated_at = now()
         FROM candidate
        WHERE j.id = candidate.id
       RETURNING j.*`,
      [workerId]
    );

    await client.query('COMMIT');
    return picked.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function processEbmFiscalQueueOnce(workerId = 'fiscal-worker'): Promise<boolean> {
  const job = await acquireNextSalesJob(workerId);
  if (!job) return false;

  try {
    const existingSuccess = await pool.query(
      "SELECT id, rcpt_sign, rcpt_no FROM ebm_invoices WHERE order_id = $1 AND invoice_type = 'S' AND status = 'success' LIMIT 1",
      [job.order_id]
    );
    if (existingSuccess.rows.length > 0) {
      const inv = existingSuccess.rows[0];
      await pool.query(
        `UPDATE orders
         SET ebm_invoice_id = COALESCE(ebm_invoice_id, $1),
             ebm_rcpt_sign = COALESCE(ebm_rcpt_sign, $2),
             ebm_rcpt_no = COALESCE(ebm_rcpt_no, $3),
             ebm_fiscalized_at = COALESCE(ebm_fiscalized_at, now()),
             updated_at = now()
         WHERE id = $4`,
        [inv.id, inv.rcpt_sign ?? null, inv.rcpt_no ?? null, job.order_id]
      );
      await markJobSuccess(job.id, inv.id);
      return true;
    }

    const config = await getEbmConfig(job.restaurant_id);
    if (!config) {
      await markJobFailure(job, 'EBM config not found or inactive');
      return true;
    }

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [job.order_id]);
    if (orderResult.rows.length === 0) {
      await markJobFailure(job, 'Order not found');
      return true;
    }

    const order = orderResult.rows[0];
    const itemsRaw = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const orderItems = Array.isArray(itemsRaw) ? itemsRaw : [];

    const cisInvcNo = order.order_number || `INV-${job.order_id.slice(-8).toUpperCase()}`;
    // OSDC path: use OSDC mapper when config has cmcKey (compliance mode)
    // Legacy path: fall back to buildSalesFromOrder for devices not yet on OSDC
    const paymentType = normalizePaymentType(job.payment_type ?? undefined);
    const useOsdc = !!(config.cmcKey);

    // Allocate next crash-safe OSDC invoice sequence number per restaurant + branch + day.
    let invcNo: number | null = null;
    if (useOsdc) {
      invcNo = await receiptCounter.getNext(job.restaurant_id, config.bhfId);
    }

    const osdcTx = useOsdc
      ? orderRowToOsdcTransaction(
          { ...order, items: orderItems, customer_tin: job.cust_tin || undefined },
          config,
          paymentType,
        )
      : null;

    const osdcPayload = useOsdc && osdcTx && invcNo
      ? mapToOsdcSalesPayload(osdcTx, config.cmcKey!, invcNo)
      : null;

    // Legacy payload (used when OSDC not available)
    const salesData = !useOsdc
      ? buildSalesFromOrder(
          { ...order, items: orderItems, customer_tin: job.cust_tin || undefined },
          cisInvcNo,
          paymentType,
          'S',
        )
      : null;

    let invoiceId = makeId('ebm');
    const insertedInvoice = await pool.query(
      `INSERT INTO ebm_invoices
         (id, restaurant_id, order_id, invoice_type, cis_invc_no, cust_tin, cust_nm,
          pmt_ty_cd, tot_amt, tot_taxbl_amt, tot_tax_amt, raw_request, status, fiscal_intent_key, osdc_invc_no)
       VALUES ($1,$2,$3,'S',$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13)
       ON CONFLICT (fiscal_intent_key) WHERE fiscal_intent_key IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        invoiceId,
        job.restaurant_id,
        job.order_id,
        cisInvcNo,
        job.cust_tin || null,
        osdcPayload?.custNm ?? salesData?.custNm ?? null,
        osdcPayload?.pmtTyCd ?? salesData?.pmtTyCd ?? paymentType,
        osdcPayload?.totAmt ?? salesData?.totAmt ?? 0,
        osdcPayload?.totTaxblAmt ?? salesData?.totTaxblAmt ?? 0,
        osdcPayload?.totTaxAmt ?? salesData?.totTaxAmt ?? 0,
        JSON.stringify(osdcPayload ?? salesData),
        job.intent_key,
        invcNo ?? null,
      ]
    );

    if (insertedInvoice.rows.length === 0) {
      const existingInvoice = await pool.query(
        'SELECT id, status FROM ebm_invoices WHERE fiscal_intent_key = $1 LIMIT 1',
        [job.intent_key]
      );
      if (existingInvoice.rows.length > 0) {
        invoiceId = existingInvoice.rows[0].id;
      }
    }

    const vsdcResult = osdcPayload
      ? await osdcSaveSales(config, osdcPayload)
      : await saveSales(config, salesData!);

    if (vsdcResult.resultCd !== '000') {
      await pool.query(
        `UPDATE ebm_invoices
         SET status='failed',
             error_msg=$1,
             raw_response=$2
         WHERE id=$3`,
        [vsdcResult.resultMsg || 'Fiscalization failed', JSON.stringify(vsdcResult), invoiceId]
      );

      const responseCode = String(vsdcResult.resultCd || 'ERR');
      const payload = osdcPayload ?? salesData;
      await handleOsdcResponse(responseCode, payload, job.id, {
        onRetry: async () => {
          await markJobFailure(job, `${responseCode}: ${vsdcResult.resultMsg || 'Fiscalization failed'}`);
        },
        onReauth: async () => {
          try {
            await cmcKeyManager.rotateKey(job.restaurant_id, config.tpin, config.bhfId, config.dvcSrlNo);
          } catch (reauthErr) {
            logger.error('OSDC reauth failed', {
              txId: job.id,
              error: reauthErr instanceof Error ? reauthErr.message : String(reauthErr),
            });
          }
          await markJobFailure(job, `${responseCode}: device reauth triggered`);
        },
        onHold: async () => {
          await markJobNeedsReview(job, `${responseCode}: ${vsdcResult.resultMsg || 'Held for manual review'}`);
        },
        onFail: async () => {
          await markJobNeedsReview(job, `${responseCode}: ${vsdcResult.resultMsg || 'Permanent fiscalization failure'}`);
        },
        onSkip: async () => {
          await markJobNeedsReview(job, `${responseCode}: skipped by OSDC`);
        },
        alertAdmin: async (message: string) => {
          logger.error('OSDC admin alert', { txId: job.id, message });
        },
      });

      return true;
    }

    const data = (vsdcResult.data || {}) as any;
    await pool.query(
      `UPDATE ebm_invoices
       SET status='success',
           rcpt_no=$1,
           intrl_data=$2,
           rcpt_sign=$3,
           sdc_id=$4,
           tot_rcpt_no=$5,
           raw_response=$6,
           fiscalized_at=now(),
           error_msg=NULL
       WHERE id=$7`,
      [
        data?.rcptNo,
        data?.intrlData,
        data?.rcptSign,
        data?.sdcId,
        data?.totRcptNo,
        JSON.stringify(vsdcResult),
        invoiceId,
      ]
    );

    await pool.query(
      `UPDATE orders
       SET ebm_invoice_id = $1,
           ebm_rcpt_sign = $2,
           ebm_rcpt_no = $3,
           ebm_fiscalized_at = now(),
           updated_at = now()
       WHERE id = $4`,
      [invoiceId, data?.rcptSign ?? null, data?.rcptNo ?? null, job.order_id]
    );

    await markJobSuccess(job.id, invoiceId);
    return true;
  } catch (err) {
    await markJobFailure(job, err instanceof Error ? err.message : String(err));
    return true;
  }
}

export function startEbmFiscalWorker(intervalMs = 4000): () => void {
  let active = true;
  let running = false;

  const tick = async () => {
    if (!active || running) return;
    running = true;
    try {
      // Drain a small batch each tick.
      for (let i = 0; i < 5; i += 1) {
        const processed = await processEbmFiscalQueueOnce('fiscal-worker');
        if (!processed) break;
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  void tick();

  return () => {
    active = false;
    clearInterval(timer);
  };
}
