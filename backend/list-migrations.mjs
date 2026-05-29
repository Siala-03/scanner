import { pool, withClient } from './src/db.js';

async function main() {
  const result = await withClient(async (client) => {
    const r = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    return r.rows.map(x => x.id);
  });
  
  console.log('Applied migrations:');
  result.forEach((id, i) => {
    console.log(`  ${i + 1}. ${id}`);
  });
  
  console.log(`\nTotal: ${result.length}`);
  
  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
