import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await pool.query("UPDATE campaign_settings SET portfolio_url = 'trynoryvex.com' WHERE user_id = 19 OR portfolio_url LIKE '%noryvex.com%'");
console.log("✓ Updated campaign_settings portfolio_url in database to 'trynoryvex.com'");

await pool.end();
