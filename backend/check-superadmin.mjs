import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkSuperadmin() {
  const result = await pool.query('SELECT id, name, email, role FROM staff WHERE role = $1', ['superadmin']);
  console.log('Superadmin accounts:', JSON.stringify(result.rows, null, 2));
  await pool.end();
}

checkSuperadmin().catch(console.error);
