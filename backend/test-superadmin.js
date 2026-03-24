import { pool } from './dist/db.js';

const res = await pool.query('SELECT id, name, email, username, role FROM staff WHERE role = $1', ['superadmin']);
console.log('Superadmin accounts:', JSON.stringify(res.rows, null, 2));
process.exit(0);
