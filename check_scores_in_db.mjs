import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const res = await pool.query('SELECT id, name, email, qualification_score, tier, status FROM leads WHERE user_id = 19 ORDER BY id DESC LIMIT 15');
console.log('=== CURRENT LEADS IN DB FOR USER 19 ===');
console.table(res.rows);

await pool.end();
