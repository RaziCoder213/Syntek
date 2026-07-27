import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const leads = await pool.query('SELECT id, name, email, city, status, pipeline_stage FROM leads WHERE user_id = 19 ORDER BY id ASC');
console.log(`=== CURRENT LEADS FOR USER 19 (Total: ${leads.rowCount}) ===`);
console.table(leads.rows);

await pool.end();
