import dotenv from 'dotenv';
import { z } from 'zod';

// Load backend-local env first, then root env as fallback for local setups.
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000), // 1 minute window
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10000), // 10k requests/min for busy restaurants
  DB_POOL_SIZE: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(60000),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(10000),
  DB_STARTUP_RETRIES: z.coerce.number().int().positive().default(3),
  DB_STARTUP_RETRY_DELAY: z.coerce.number().int().positive().default(3000)
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  PORT: process.env.PORT ?? 4000,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner',
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  SUPABASE_SERVICE_KEY:
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ?? (60 * 1000), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS ?? 10000, // 10k/min
  DB_POOL_SIZE: process.env.DB_POOL_SIZE ?? 20,
  DB_IDLE_TIMEOUT: process.env.DB_IDLE_TIMEOUT ?? 60000,
  DB_CONNECTION_TIMEOUT: process.env.DB_CONNECTION_TIMEOUT ?? 10000,
  DB_STARTUP_RETRIES: process.env.DB_STARTUP_RETRIES ?? 3,
  DB_STARTUP_RETRY_DELAY: process.env.DB_STARTUP_RETRY_DELAY ?? 3000
});
