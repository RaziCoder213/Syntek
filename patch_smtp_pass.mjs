import { readFileSync, writeFileSync } from 'fs';

const f = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = readFileSync(f, 'utf8');

// 1. Fix getAvailableOutbox to include smtp_host/smtp_port from the outbox row AND config fallback
const oldOutboxReturn = `        return {
          email: outbox.email,
          pass: decryptedPass,
          id: outbox.id,
          isCustom: true
        };`;

const newOutboxReturn = `        return {
          email: outbox.email,
          pass: decryptedPass,
          id: outbox.id,
          isCustom: true,
          smtp_host: outbox.smtp_host || null,
          smtp_port: outbox.smtp_port || null,
        };`;

// 2. Fix the config fallback to include smtp_host/smtp_port from campaign_settings
const oldConfigFallback = `  // Fallback to campaign_settings gmail credentials if none available or limits reached
  if (config.gmail_user && config.gmail_pass) {
    return {
      email: config.gmail_user,
      pass: decryptText(config.gmail_pass),
      id: null,
      isCustom: false
    };
  }`;

const newConfigFallback = `  // Fallback to campaign_settings gmail credentials if none available or limits reached
  if (config.gmail_user && config.gmail_pass) {
    return {
      email: config.gmail_user,
      pass: decryptText(config.gmail_pass),
      id: null,
      isCustom: false,
      smtp_host: config.smtp_host || null,
      smtp_port: config.smtp_port || null,
    };
  }`;

let changed = 0;
if (content.includes(oldOutboxReturn)) {
  content = content.replace(oldOutboxReturn, newOutboxReturn);
  console.log('✓ Fixed outbox sender return to include smtp_host');
  changed++;
} else {
  console.log('⚠ Could not find outbox return pattern');
}

if (content.includes(oldConfigFallback)) {
  content = content.replace(oldConfigFallback, newConfigFallback);
  console.log('✓ Fixed config fallback to include smtp_host from campaign_settings');
  changed++;
} else {
  console.log('⚠ Could not find config fallback pattern');
}

writeFileSync(f, content, 'utf8');
console.log(`\nPatched ${changed}/2 locations.`);
