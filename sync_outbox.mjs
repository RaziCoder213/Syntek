import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const s = await pool.query("SELECT * FROM campaign_settings WHERE user_id = 19");
if (s.rows.length > 0) {
  const row = s.rows[0];
  const ob = await pool.query("SELECT * FROM user_outboxes WHERE user_id = 19 AND email = $1", [row.gmail_user]);
  if (ob.rows.length === 0) {
    console.log("Inserting outbox for user 19...");
    await pool.query(
      "INSERT INTO user_outboxes (user_id, email, password, daily_sent_limit, smtp_host, smtp_port, imap_host, imap_port, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)",
      [19, row.gmail_user, row.gmail_pass, 50, "mail.privateemail.com", 587, "mail.privateemail.com", 993]
    );
    console.log("Outbox inserted successfully!");
  } else {
    console.log("Updating outbox for user 19...");
    await pool.query(
      "UPDATE user_outboxes SET smtp_host = $1, smtp_port = $2, imap_host = $3, imap_port = $4, password = $5, is_active = TRUE WHERE user_id = 19 AND email = $6",
      ["mail.privateemail.com", 587, "mail.privateemail.com", 993, row.gmail_pass, row.gmail_user]
    );
    console.log("Outbox updated successfully!");
  }
}

await pool.end();
