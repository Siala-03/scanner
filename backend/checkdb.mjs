import pkg from 'pg';
const { Client } = pkg;
const c = new Client({ connectionString: 'postgres://scanner:scanner@localhost:5432/scanner' });
(async () => {
  try {
    await c.connect();
    const tableRes = await c.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_records') AS exists_table");
    const colRes = await c.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_records' AND column_name='restaurant_id') AS has_restaurant");
    let sample;
    try {
      sample = await c.query('SELECT * FROM inventory_records LIMIT 1');
    } catch (e) {
      sample = { error: e.message };
    }
    console.log(JSON.stringify({ table_exists: tableRes.rows[0].exists_table, has_restaurant_id: colRes.rows[0].has_restaurant, sample_record: sample.rows || sample }));
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  } finally {
    await c.end();
  }
})();
