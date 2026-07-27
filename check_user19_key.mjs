import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const res = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19 LIMIT 1');
console.log('User 19 settings row count:', res.rowCount);
if (res.rowCount > 0) {
  console.log('Settings keys:', Object.keys(res.rows[0]));
}

await pool.end();
