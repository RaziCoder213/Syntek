import dns from 'dns';

// Configure reliable Google / Cloudflare DNS servers for MX resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

async function validateEmailWithMx(email) {
  if (!email || typeof email !== 'string') return { valid: false, reason: 'Empty email' };
  const trimmed = email.trim().toLowerCase();
  
  // 1. Basic syntax check
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(trimmed)) return { valid: false, reason: 'Invalid syntax' };

  const domain = trimmed.split('@')[1];

  // 2. Disposable domain check
  const disposableDomains = ['mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'trashmail.com', 'yopmail.com'];
  if (disposableDomains.includes(domain)) return { valid: false, reason: 'Disposable domain' };

  // 3. DNS MX record resolution
  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'No MX records found' };
    }
    return { valid: true, mx: mxRecords[0].exchange, count: mxRecords.length };
  } catch (err) {
    // Fallback: If DNS MX query fails due to local network DNS filter, do fallback check
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { valid: false, reason: 'Domain has no active MX mail server' };
    }
    // Network fallback: syntax & domain check passed
    return { valid: true, mx: domain, note: 'Network fallback' };
  }
}

// Test cases
const testEmails = [
  'info@google.com',
  'hello@trynoryvex.com',
  'fake@thisdomaindoesnotexistatall123456.org',
  'test@10minutemail.com',
  'invalid-email-format'
];

console.log('Testing MX & Email Validation Engine:\n');
for (const e of testEmails) {
  const res = await validateEmailWithMx(e);
  console.log(`- ${e}:`, res.valid ? `✅ VALID (MX: ${res.mx})` : `❌ INVALID (${res.reason})`);
}
