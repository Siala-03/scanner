import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withClient } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

async function ensureMigrationsTable() {
  await withClient(async (client) => {
    await client.query(`
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);
  });
}

async function getAppliedIds(): Promise<Set<string>> {
  return await withClient(async (client) => {
    const r = await client.query(`select id from schema_migrations`);
    return new Set(r.rows.map((x) => x.id));
  });
}

async function applyMigration(id: string, sql: string) {
  await withClient(async (client) => {
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(`insert into schema_migrations (id) values ($1)`, [id]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  });
}

async function main() {
  await ensureMigrationsTable();
  const applied = await getAppliedIds();

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(migrationsDir, file);
    const sql = await readFile(fullPath, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Applying ${file}...`);
    await applyMigration(file, sql);
  }

  // eslint-disable-next-line no-console
  console.log('Done.');
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});

