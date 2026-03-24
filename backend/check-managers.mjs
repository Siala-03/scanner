import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scanner'
});

async function check() {
  const result = await pool.query('SELECT id, name, role, email FROM staff WHERE role = $1', ['manager']);
  console.log('Managers:', JSON.stringify(result.rows, null, 2));
  await pool.end();
}

check().catch(console.error);