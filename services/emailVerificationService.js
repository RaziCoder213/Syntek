import dns from "dns";

/**
 * Real MX-Record & Email Verification Service (DNS + DoH Fallback)
 * Confirms domain has valid Mail Exchange (MX) records before allowing lead enrollment.
 */

/**
 * Verify lead email address via DNS MX lookup with Cloudflare DoH fallback.
 * Returns { status: 'verified' | 'invalid' | 'unknown', reason: string, mxRecords?: array }
 */
export async function verifyLeadEmail(email) {
  return verifyEmail(email);
}

export async function verifyEmail(email) {
  if (!email || typeof email !== "string") {
    return { status: "invalid", reason: "Missing or empty email" };
  }

  const trimmed = email.trim().toLowerCase();

  // Syntax Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { status: "invalid", reason: "Invalid email syntax" };
  }

  const domain = trimmed.split("@")[1];
  if (!domain) {
    return { status: "invalid", reason: "Invalid domain structure" };
  }

  // Block disposable / placeholder domain patterns
  const disposableDomains = ["example.com", "test.com", "tempmail.com", "mailinator.com", "trashmail.com"];
  if (disposableDomains.includes(domain)) {
    return { status: "invalid", reason: "Disposable or test domain" };
  }

  // 1. Try Native DNS resolver with fast 3s timeout
  try {
    const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
    try { resolver.setServers(["8.8.8.8", "1.1.1.1"]); } catch (e) {}
    const mxRecords = await resolver.resolveMx(domain);

    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      return {
        status: "verified",
        reason: `Valid MX records found (${mxRecords[0].exchange})`,
        mxRecords
      };
    } else {
      return {
        status: "invalid",
        reason: "No MX records configured for domain"
      };
    }
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return {
        status: "invalid",
        reason: "No MX records configured for domain"
      };
    }
  }

  // 2. DNS over HTTPS (DoH) Fallback via Cloudflare DNS API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { "Accept": "application/dns-json" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.Answer && Array.isArray(data.Answer) && data.Answer.length > 0) {
        return {
          status: "verified",
          reason: `Valid MX records found via DoH (${data.Answer[0].data})`,
          mxRecords: data.Answer
        };
      } else if (data.Status === 0 || data.Status === 3) {
        return {
          status: "invalid",
          reason: "No MX records found for domain (DoH verified)"
        };
      }
    }
  } catch (dohErr) {
    // If both DNS and DoH timed out or failed
  }

  return { status: "unknown", reason: "MX check inconclusive" };
}

/**
 * Lightweight DNS MX check for pre-send re-verification.
 */
export async function reverifyLeadEmailMx(email) {
  const result = await verifyLeadEmail(email);
  return result.status === "verified";
}

/**
 * Retroactive MX Verification Cleanup across all existing database leads.
 * Updates email_verification_status, email_confirmed, and hard-excludes invalid leads (-1000 score).
 */
export async function runRetroactiveEmailVerificationCleanup(pool) {
  console.log("=== STARTING RETROACTIVE MX EMAIL VERIFICATION CLEANUP ===");

  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_verification_status VARCHAR(50) DEFAULT 'unverified';`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;`).catch(() => {});

  const res = await pool.query(`SELECT id, name, email, status, email_verification_status FROM leads WHERE email IS NOT NULL AND email != '' ORDER BY id ASC`);
  const leads = res.rows;
  console.log(`[MX CLEANUP] Found ${leads.length} leads with email addresses to verify.`);

  let verifiedCount = 0;
  let invalidCount = 0;
  let unknownCount = 0;
  const invalidLeadsSummary = [];

  // Batch process 10 leads concurrently
  const BATCH_SIZE = 10;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (lead) => {
      const check = await verifyLeadEmail(lead.email);
      if (check.status === "verified") {
        verifiedCount++;
        await pool.query(
          `UPDATE leads SET email_verification_status = 'verified', email_confirmed = TRUE WHERE id = $1`,
          [lead.id]
        );
      } else if (check.status === "invalid") {
        invalidCount++;
        invalidLeadsSummary.push({ id: lead.id, name: lead.name, email: lead.email, reason: check.reason });
        await pool.query(
          `UPDATE leads SET email_verification_status = 'invalid', email_confirmed = FALSE, quality_score = -1000, status = 'bounced', pipeline_stage = 'Archived' WHERE id = $1`,
          [lead.id]
        );
      } else {
        unknownCount++;
      }
    }));
  }

  console.log(`[MX CLEANUP COMPLETE] Total Processed: ${leads.length} | Verified: ${verifiedCount} | Invalid/Excluded: ${invalidCount} | Unknown: ${unknownCount}`);
  return { total: leads.length, verified: verifiedCount, invalid: invalidCount, unknown: unknownCount, invalidLeadsSummary };
}
