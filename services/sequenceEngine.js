import pg from "pg";
import dotenv from "dotenv";
import { generateCompliantOutreachEmail } from "./aiCopywriterService.js";
import { reverifyLeadEmailMx } from "./emailVerificationService.js";

dotenv.config();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Generate HMAC signed token for Unsubscribe links (Section 5)
 */
export function generateUnsubscribeToken(leadId, secret = process.env.JWT_SECRET || "syntek_sec_2026") {
  const crypto = require("crypto");
  return crypto.createHmac("sha256", secret).update(`unsub_${leadId}`).digest("hex");
}

/**
 * Compliance Footer Injector (Section 5)
 * Server-side auto-appended real physical address and opt-out link.
 * Clean, natural plain-text HTML styling with NO white card container.
 */
export function formatCompliantEmailHtml(bodyText, config = {}) {
  if (!bodyText) return "";
  const companyAddress = config.company_address || "Karachi, Pakistan";

  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const mainParagraphsHtml = paragraphs.map(p => {
    const htmlPara = p.replace(/\n/g, "<br/>");
    return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #1e293b;">${htmlPara}</p>`;
  }).join("");

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; max-width: 600px; padding: 8px 0;">
  ${mainParagraphsHtml}

  <!-- Mandatory Compliance Physical Address & Opt-out Footer -->
  <div style="margin-top: 32px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5;">
    Noryvex Automation · ${companyAddress}<br/>
    <a href="mailto:optout@trynoryvex.com?subject=Unsubscribe" style="color: #64748b; text-decoration: underline;">Unsubscribe / Opt-out</a>
  </div>
</div>
  `.trim();
}

/**
 * Graduated Daily Send Cap Helper (Section 4)
 * Starts new inboxes at 5/day, ramping toward configured limit over 7 days.
 */
export function calculateGraduatedCap(config, daysActive = 1) {
  const maxConfigured = parseInt(config.daily_limit || config.daily_lead_limit || 10, 10);
  const rampCap = Math.min(maxConfigured, 5 + (daysActive - 1) * 2);
  return Math.max(5, rampCap);
}

/**
 * Sequence Step Timing & MX Re-Verification Checks (Section 4)
 * Days: Step 0 (Day 0), Step 1 (Day 3), Step 2 (Day 7), Step 3 (Day 12)
 */
export function isLeadDueForNextStep(lead) {
  const step = lead.sequence_step || 0;
  if (step === 0) return true; // Initial send ready

  if (!lead.last_contacted_at) return true;

  const now = new Date();
  const lastContact = new Date(lead.last_contacted_at);
  const daysDiff = (now - lastContact) / (1000 * 60 * 60 * 24);

  if (step === 1) return daysDiff >= 3;
  if (step === 2) return daysDiff >= 4; // 3 + 4 = 7 days total
  if (step === 3) return daysDiff >= 5; // 7 + 5 = 12 days total

  return false;
}

/**
 * Lightweight MX re-verification before firing sequence step.
 * Returns true if lead is due AND MX record resolves.
 */
export async function isLeadDueForNextStepWithMxCheck(lead) {
  const isDue = isLeadDueForNextStep(lead);
  if (!isDue) return false;

  if (lead.email) {
    const mxOk = await reverifyLeadEmailMx(lead.email);
    if (!mxOk) {
      console.warn(`[SEQUENCE ENGINE] MX re-verification failed for lead ${lead.id} (${lead.email}). Halting sequence.`);
      return false;
    }
  }
  return true;
}
