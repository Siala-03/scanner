import { Router } from 'express';
import { HttpError } from '../http.js';
import { pool } from '../db.js';

export const printRouter = Router();

interface ReceiptRequest {
  orderId: string;
  tableNumber?: number;
  waiterName?: string;
  details?: any;
}

printRouter.post('/receipt', (req, res, next) => {
  try {
    const data = req.body as ReceiptRequest;
    if (!data || !data.orderId) {
      throw new HttpError(400, 'Missing orderId in print request');
    }

    // TODO: implement real printer push to network thermal printer.
    // Here we simulate and return success with details for debugging.
    console.log('Print receipt request received', {
      orderId: data.orderId,
      tableNumber: data.tableNumber,
      waiterName: data.waiterName
    });

    res.status(200).json({
      message: 'Print request accepted',
      data
    });
  } catch (err) {
    next(err);
  }
});

printRouter.get('/receipt/osdc/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const restaurantId = String(req.query.restaurantId || '').trim();
    if (!orderId) {
      throw new HttpError(400, 'Missing orderId');
    }
    if (!restaurantId) {
      throw new HttpError(400, 'Missing restaurantId');
    }

    const result = await pool.query(
      `SELECT i.order_id, i.rcpt_no, i.rcpt_sign, i.intrl_data, i.raw_response,
              i.fiscalized_at, c.tpin, c.bhf_id
       FROM ebm_invoices i
       JOIN ebm_config c ON c.restaurant_id = i.restaurant_id
       WHERE i.order_id = $1
         AND i.restaurant_id = $2
         AND i.invoice_type = 'S'
         AND i.status = 'success'
       ORDER BY i.fiscalized_at DESC NULLS LAST, i.created_at DESC
       LIMIT 1`,
      [orderId, restaurantId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Fiscal receipt not found');
    }

    const row = result.rows[0];
    let rawResponse: any = null;
    if (row.raw_response) {
      rawResponse = typeof row.raw_response === 'string' ? JSON.parse(row.raw_response) : row.raw_response;
    }

    const sdcDateTime =
      rawResponse?.data?.sdcDateTime ||
      rawResponse?.resultDt ||
      (row.fiscalized_at ? new Date(row.fiscalized_at).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) : null);

    const rcptNo = row.rcpt_no ?? null;
    const rcptSign = row.rcpt_sign ?? null;
    const qrData =
      row.tpin && row.bhf_id && rcptNo && sdcDateTime && rcptSign
        ? `${row.tpin}|${row.bhf_id}|${rcptNo}|${sdcDateTime}|${rcptSign}`
        : null;

    res.json({
      orderId: row.order_id,
      venueTin: row.tpin,
      branchId: row.bhf_id,
      curRcptNo: rcptNo,
      rcptSign,
      intrlData: row.intrl_data ?? null,
      sdcDateTime,
      qrData,
    });
  } catch (err) {
    next(err);
  }
});
