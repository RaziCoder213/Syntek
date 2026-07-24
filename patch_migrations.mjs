import { readFileSync, writeFileSync } from 'fs';

const f = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = readFileSync(f, 'utf8');

const marker = '    console.log("PostgreSQL schema validated and multi-tenant migrations applied successfully.");';

const smtpMigrations = `
    // SMTP/IMAP columns for campaign_settings (provider-agnostic email)
    await pool.query(\`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;\`);
    await pool.query(\`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;\`);
    await pool.query(\`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) DEFAULT NULL;\`);
    await pool.query(\`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;\`);

    // SMTP/IMAP columns for user_outboxes
    await pool.query(\`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;\`);
    await pool.query(\`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;\`);
    await pool.query(\`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) DEFAULT NULL;\`);
    await pool.query(\`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;\`);

`;

if (!content.includes(smtpMigrations.trim())) {
  content = content.replace(marker, smtpMigrations + '    ' + marker.trim());
  writeFileSync(f, content, 'utf8');
  console.log('Added SMTP/IMAP migrations to setupDatabase');
} else {
  console.log('Already present, skipping');
}
