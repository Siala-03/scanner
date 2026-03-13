import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_SIZE,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT
});

// Log pool events in development
if (env.NODE_ENV !== 'production') {
  pool.on('connect', () => {
    // console.log('New database connection');
  });
  
pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
  });
}

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

