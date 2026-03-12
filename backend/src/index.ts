import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { env } from './env.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { inventoryRouter } from './routes/inventory.js';
import { suppliersRouter } from './routes/suppliers.js';
import { purchaseOrdersRouter } from './routes/purchaseOrders.js';
import { movementsRouter } from './routes/movements.js';
import { wasteRouter } from './routes/waste.js';
import { ordersRouter } from './routes/orders.js';
import { initSocket } from './socket.js';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

app.use(helmet());
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: false
  })
);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/movements', movementsRouter);
app.use('/api/waste', wasteRouter);
app.use('/api/orders', ordersRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
);

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${env.PORT}`);
  // eslint-disable-next-line no-console
  console.log(`WebSocket server ready`);
});
