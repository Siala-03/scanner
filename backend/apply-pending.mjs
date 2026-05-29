import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, withClient } from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Get list of applied migrations
  const applied = await withClient(async (client) => {
    const r = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    return new Set(r.rows.map(x => x.id));
  });
  
  console.log(`Found ${applied.size} applied migrations\n`);
  
  // Get all migration files
  const allFiles = (await readdir(path.join(__dirname, 'migrations')))
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  
  // Filter to only pending ones
  const pending = allFiles.filter(f => !applied.has(f));
  
  console.log(`Total migration files: ${allFiles.length}`);
  console.log(`Pending migrations: ${pending.length}\n`);
  
  if (pending.length === 0) {
    console.log('✓ All migrations already applied!');
    await pool.end();
    return;
  }
  
  console.log('Pending migrations:');
  pending.forEach(f => console.log(`  - ${f}`));
  console.log('');
  
  // Apply pending migrations
  let count = 0;
  for (const file of pending) {
    const fullPath = path.join(__dirname, 'migrations', file);
    const sql = await readFile(fullPath, 'utf8');
    
    console.log(`Applying ${file}...`);
    
    try {
      await withClient(async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
          await client.query('COMMIT');
          count++;
          console.log(`  ✓ Success\n`);
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      });
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}\n`);
      // Continue with next migration
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Applied: ${count} migrations`);
  console.log(`Failed: ${pending.length - count} migrations`);
  
  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exitCode = 1;
});
