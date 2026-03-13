import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(2000)
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  PORT: process.env.PORT ?? 4000,
  DATABASE_URL: process.env.DATABASE_URL,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ?? (15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS ?? 100,
  DB_POOL_SIZE: process.env.DB_POOL_SIZE ?? 20,
  DB_IDLE_TIMEOUT: process.env.DB_IDLE_TIMEOUT ?? 30000,
  DB_CONNECTION_TIMEOUT: process.env.DB_CONNECTION_TIMEOUT ?? 2000
});
