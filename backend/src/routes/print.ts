import { Router } from 'express';
import { HttpError } from '../http.js';

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
