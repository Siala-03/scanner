import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { inventoryRouter } from './routes/inventory.js';
import simpleInventoryRouter from './routes/simple-inventory.js';
import { menuRouter } from './routes/menu.js';
import { tablesRouter } from './routes/tables.js';
import { suppliersRouter } from './routes/suppliers.js';
import { purchaseOrdersRouter } from './routes/purchaseOrders.js';
import { supplierAuthRouter } from './routes/supplierAuth.js';
import { supplierPortalRouter } from './routes/supplierPortal.js';
import { movementsRouter } from './routes/movements.js';
import { wasteRouter } from './routes/waste.js';
import { loyaltyRouter } from './routes/loyalty.js';
import { ordersRouter } from './routes/orders.js';
import kpisRouter from './routes/kpis.js';
import { printRouter } from './routes/print.js';
import { forecastingRouter } from './routes/forecasting.js';
import { locationsRouter } from './routes/locations.js';
import { recipesRouter } from './routes/recipes.js';
import { cycleCountRouter } from './routes/cycleCounts.js';
import { tableSessionsRouter } from './routes/tableSessions.js';
import expensesRouter from './routes/expenses.js';
import { aiRouter } from './routes/ai.js';
import { restaurantsRouter } from './routes/restaurants.js';
import creditRouter from './routes/credit.js';
import { promotionsRouter } from './routes/promotions.js';
import { reservationsRouter } from './routes/reservations.js';
import { schedulesRouter } from './routes/schedules.js';
import { reviewsRouter } from './routes/reviews.js';
import { ebmRouter } from './routes/ebm.js';
import { startEbmFiscalWorker } from './services/ebmFiscalQueue.js';
import { OsdcSyncManager } from './services/osdcSyncManager.js';
import { initSocket } from './socket.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

// Delay helper for retries
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Auto-run migrations on startup with retry logic
async function runMigrations() {
  const maxRetries = env.DB_STARTUP_RETRIES;
  const retryDelay = env.DB_STARTUP_RETRY_DELAY;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      return; // Success, exit the retry loop
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`Migration attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
      
      if (attempt < maxRetries) {
        logger.info(`Retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
      } else {
        logger.error('Migration failed after all retries', { 
          error: errorMsg,
          stack: err instanceof Error ? err.stack : undefined
        });
        // Don't exit - let the server start anyway
      }
    }
  }
}

const superadminAccounts = [
  {
    id: 'superadmin-002',
    name: 'Servv Superadmin One',
    email: 'servv.admin1@servv.com',
    phone: '+11000000001',
    username: 'servv_admin_1',
    password: 'ServvAdmin1!'
  },
  {
    id: 'superadmin-003',
    name: 'Servv Superadmin Two',
    email: 'servv.admin2@servv.com',
    phone: '+11000000002',
    username: 'servv_admin_2',
    password: 'ServvAdmin2!'
  },
  {
    id: 'superadmin-004',
    name: 'Servv Superadmin Three',
    email: 'servv.admin3@servv.com',
    phone: '+11000000003',
    username: 'servv_admin_3',
    password: 'ServvAdmin3!'
  }
];

async function ensureSuperadminAccounts() {
  const maxRetries = env.DB_STARTUP_RETRIES;
  const retryDelay = env.DB_STARTUP_RETRY_DELAY;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      try {
        for (const account of superadminAccounts) {
          const hash = await bcrypt.hash(account.password, 10);

          await client.query('begin');
          try {
            await client.query(
              `INSERT INTO staff
                (id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id)
               VALUES ($1, $2, 'superadmin', $3, $4, true, '{}', '{}', now(), 'default_restaurant')
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 role = 'superadmin',
                 email = EXCLUDED.email,
                 phone = EXCLUDED.phone`,
              [account.id, account.name, account.email, account.phone]
            );

            await client.query(
              `INSERT INTO staff_credentials (staff_id, username, password_hash, restaurant_id)
               VALUES ($1, $2, $3, 'default_restaurant')
               ON CONFLICT (restaurant_id, username) DO UPDATE SET
                 staff_id = EXCLUDED.staff_id,
                 password_hash = EXCLUDED.password_hash`,
              [account.id, account.username, hash]
            );

            await client.query('commit');
          } catch (err) {
            await client.query('rollback');
            throw err; // Re-throw to trigger retry
          }
        }
        return; // Success, exit the retry loop
      } finally {
        client.release();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`Ensure superadmin accounts attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
      
      if (attempt < maxRetries) {
        logger.info(`Retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
      } else {
        logger.error('Failed to ensure superadmin accounts after all retries', { 
          error: errorMsg,
          stack: err instanceof Error ? err.stack : undefined
        });
        // Don't exit - let the server start anyway
      }
    }
  }
}

const app = express();
const httpServer = createServer(app);
let stopEbmFiscalWorker: (() => void) | null = null;
let stopOsdcSyncManager: (() => void) | null = null;

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
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/menu', menuRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/supplier-auth', supplierAuthRouter);
app.use('/api/supplier-portal', supplierPortalRouter);
app.use('/api/movements', movementsRouter);
app.use('/api/waste', wasteRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/kpis', kpisRouter);
app.use('/api/print', printRouter);
app.use('/api/forecasting', forecastingRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/cycle-counts', cycleCountRouter);
app.use('/api/table-sessions', tableSessionsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/restaurants', restaurantsRouter);
app.use('/api/credit', creditRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/ebm', ebmRouter);

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
  await ensureSuperadminAccounts();
  stopEbmFiscalWorker = startEbmFiscalWorker();
  logger.info('EBM fiscal worker started');
  const osdcSyncManager = new OsdcSyncManager(pool);
  stopOsdcSyncManager = osdcSyncManager.startScheduler();
  logger.info('OSDC incremental sync manager started');
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
      if (stopEbmFiscalWorker) {
        stopEbmFiscalWorker();
        stopEbmFiscalWorker = null;
      }
      if (stopOsdcSyncManager) {
        stopOsdcSyncManager();
        stopOsdcSyncManager = null;
      }
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
