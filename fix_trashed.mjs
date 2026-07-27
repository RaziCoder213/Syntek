import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await pool.query("UPDATE leads SET pipeline_stage = 'Archived' WHERE user_id = 19 AND status = 'trashed'");

const summary = await pool.query('SELECT status, pipeline_stage, COUNT(*) FROM leads WHERE user_id = 19 GROUP BY status, pipeline_stage ORDER BY count DESC');
console.table(summary.rows);

await pool.end();
