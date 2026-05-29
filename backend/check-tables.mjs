import { pool } from './src/db.js';

async function main() {
  const r = await pool.query('SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = $1)', ['ebm_fiscal_jobs']);
  console.log('ebm_fiscal_jobs table exists:', r.rows[0].exists);
  
  const r2 = await pool.query('SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = $1)', ['ebm_invoices']);
  console.log('ebm_invoices table exists:', r2.rows[0].exists);
  
  const r3 = await pool.query('SELECT id FROM schema_migrations WHERE id LIKE $1 ORDER BY id DESC LIMIT 5', ['%ebm%']);
  console.log('\nRecent EBM migrations:');
  r3.rows.forEach(row => console.log('  -', row.id));
  
  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
