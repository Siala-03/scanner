import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, withClient } from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Check what's already applied
  const applied = await withClient(async (client) => {
    const r = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    return new Set(r.rows.map(x => x.id));
  });
  
  console.log(`Found ${applied.size} applied migrations`);
  console.log(`Applied: ${Array.from(applied).sort().join(', ')}`);
  
  // Get all migration files
  const files = (await readdir(path.join(__dirname, 'migrations')))
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  
  console.log(`Total migration files: ${files.length}`);
  
  // Apply pending migrations
  let count = 0;
  let skipped = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ○ ${file} (already applied)`);
      skipped++;
      continue;
    }
    
    const fullPath = path.join(__dirname, 'migrations', file);
    const sql = await readFile(fullPath, 'utf8');
    
    console.log(`\nApplying ${file}...`);
    
    try {
      await withClient(async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
          await client.query('COMMIT');
          count++;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      });
      console.log(`  ✓ ${file}`);
    } catch (e) {
      console.error(`  ✗ ${file}: ${e.message}`);
      // Don't throw - continue with next migration
      console.log(`  Skipping due to error, continuing...`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Applied: ${count} new migrations`);
  console.log(`Skipped: ${skipped} already applied`);
  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exitCode = 1;
});
