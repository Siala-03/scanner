import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
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
import { logger } from './logger.js';
import { pool } from './db.js';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

// Security headers
app.use(helmet());

// Response compression
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: false
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Parse JSON bodies
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
      logger.warn({ status: err.status, message: err.message, details: err.details }, 'HTTP Error');
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal Server Error' });
  }
);

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server started');
  logger.info('WebSocket server ready');
});

// Graceful shutdown handling
function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
  
  httpServer.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }
    
    try {
      await pool.end();
      logger.info('Database connections closed');
    } catch (dbErr) {
      logger.error({ err: dbErr }, 'Error closing database connections');
    }
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force exit after 30 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
