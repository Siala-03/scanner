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
import { menuRouter } from './routes/menu.js';
import { tablesRouter } from './routes/tables.js';
import { suppliersRouter } from './routes/suppliers.js';
import { purchaseOrdersRouter } from './routes/purchaseOrders.js';
import { movementsRouter } from './routes/movements.js';
import { wasteRouter } from './routes/waste.js';
import { ordersRouter } from './routes/orders.js';
import { initSocket } from './socket.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

// Auto-run migrations on startup
async function runMigrations() {
  try {
    const client = await pool.connect();
    try {
      // Create migrations table if not exists
      await client.query(`
        create table if not exists schema_migrations (
          id text primary key,
          applied_at timestamptz not null default now()
        )
      `);
      
      // Get already applied migrations
      const result = await client.query(`select id from schema_migrations`);
      const applied = new Set(result.rows.map((r) => r.id));
      
      // Get migration files
      const files = (await readdir(migrationsDir))
        .filter((f) => f.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));
      
      // Apply pending migrations
      for (const file of files) {
        if (applied.has(file)) continue;
        const fullPath = path.join(migrationsDir, file);
        const sql = await readFile(fullPath, 'utf8');
        logger.info(`Running migration: ${file}`);
        await client.query('begin');
        try {
          await client.query(sql);
          await client.query(`insert into schema_migrations (id) values ($1)`, [file]);
          await client.query('commit');
          logger.info(`Migration complete: ${file}`);
        } catch (e) {
          await client.query('rollback');
          throw e;
        }
      }
      logger.info('All migrations complete');
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Migration failed', { err });
    // Don't exit - let the server start anyway
  }
}

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

// Security headers
app.use(helmet());

// Response compression
app.use(compression());

// CORS configuration - allow all origins for production flexibility
app.use(
  cors({
    origin: true, // Allow all origins in production
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

// Health check with database test
app.get('/health/db', async (_req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    logger.error('Database health check failed', { err });
    res.status(500).json({ ok: false, database: 'disconnected', error: String(err) });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/tables', tablesRouter);
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
      logger.warn('HTTP Error', { status: err.status, message: err.message, details: err.details });
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    
    // Log detailed error information
    if (err instanceof Error) {
      logger.error('Unhandled error', { 
        message: err.message, 
        stack: err.stack,
        name: err.name 
      });
    } else {
      logger.error('Unhandled non-error exception', { err });
    }
    
    res.status(500).json({ error: 'Internal Server Error' });
  }
);

httpServer.listen(env.PORT, async () => {
  logger.info('API server started', { port: env.PORT });
  logger.info('WebSocket server ready');
  
  // Run migrations on startup
  await runMigrations();
});

// Graceful shutdown handling
function gracefulShutdown(signal: string) {
  logger.info('Received shutdown signal, starting graceful shutdown', { signal });
  
  httpServer.close(async (err) => {
    if (err) {
      logger.error('Error during server close', { err });
      process.exit(1);
    }
    
    try {
      await pool.end();
      logger.info('Database connections closed');
    } catch (dbErr) {
      logger.error('Error closing database connections', { err: dbErr });
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
