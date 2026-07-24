import dns from "dns";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "yopmail.com", "tempmail.com", "guerrillamail.com",
  "sharklasers.com", "10minutemail.com", "trashmail.com", "getairmail.com",
  "dispostable.com", "maildrop.cc", "tempmailaddress.com", "quickmail.spam.la"
]);

export async function verifyEmail(email) {
  if (!email) return false;
  
  const cleanEmail = email.toLowerCase().trim();
  
  // 1. Basic Syntax Check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleanEmail)) {
    return false;
  }
  
  const [username, domain] = cleanEmail.split("@");
  
  // 2. Check if domain is disposable
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return false;
  }
  
  // 3. Resolve MX Records (Free DNS check to see if the domain exists and can receive emails)
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        // Fallback check for A record (IP address check)
        dns.resolve4(domain, (errA, addressesA) => {
          if (errA || !addressesA || addressesA.length === 0) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } else {
        resolve(true);
      }
    });
  });
}
