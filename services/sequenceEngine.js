import pg from "pg";
import dotenv from "dotenv";
import { generateCompliantOutreachEmail } from "./aiCopywriterService.js";

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
 * Server-side auto-appended real physical address and opt-out link
 */
export function formatCompliantEmailHtml(bodyText, config = {}) {
  if (!bodyText) return "";
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Founder, Noryvex";
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
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px 16px; background-color: #ffffff;">
  ${mainParagraphsHtml}

  <!-- Executive Signature Block -->
  <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
    <div style="font-weight: 700; font-size: 15.5px; color: #0f172a;">${senderName}</div>
    <div style="font-size: 13px; color: #475569; margin-top: 2px; font-weight: 500;">${senderRole}</div>
    <div style="margin-top: 6px; font-size: 13px; color: #2563eb;">
      <a href="https://trynoryvex.com" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">trynoryvex.com</a>
    </div>
  </div>

  <!-- Mandatory Compliance Physical Address & Opt-out Footer -->
  <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
    Noryvex Automation · ${companyAddress}<br/>
    <a href="mailto:optout@trynoryvex.com?subject=Unsubscribe" style="color: #94a3b8; text-decoration: underline;">Unsubscribe / Opt-out</a>
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
 * Sequence Step Timing Checks (Section 4)
 * Days: Step 0 (Day 0), Step 1 (Day 3), Step 2 (Day 7), Step 3 (Day 12)
 */
export function isLeadDueForNextStep(lead) {
  const step = lead.sequence_step || 0;
  if (step === 0) return true; // Initial send ready

  if (!lead.last_contacted_at) return true;

  const daysSinceLast = (Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 3600 * 24);

  if (step === 1 && daysSinceLast >= 3) return true;
  if (step === 2 && daysSinceLast >= 4) return true; // 3 + 4 = 7 days cumulative
  if (step === 3 && daysSinceLast >= 5) return true; // 7 + 5 = 12 days cumulative

  return false;
}
