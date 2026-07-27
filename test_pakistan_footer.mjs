import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function formatProfessionalEmailHtml(bodyText, config = {}) {
  if (!bodyText) return "";
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Founder, Noryvex — AI Voice Agents & Business Automation";

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

  <!-- Noryvex Signature Block -->
  <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
    <div style="font-weight: 700; font-size: 15.5px; color: #0f172a;">${senderName}</div>
    <div style="font-size: 13px; color: #475569; margin-top: 2px; font-weight: 500;">${senderRole}</div>
    <div style="margin-top: 6px; font-size: 13px; color: #2563eb;">
      <a href="mailto:razi@trynoryvex.com" style="color: #2563eb; text-decoration: none;">razi@trynoryvex.com</a> &nbsp;·&nbsp; 
      <a href="https://trynoryvex.com" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">trynoryvex.com</a>
    </div>
    <div style="margin-top: 6px; font-size: 12.5px; color: #64748b;">
      <a href="https://linkedin.com/in/mrazi-dev" target="_blank" style="color: #475569; text-decoration: none;">LinkedIn: linkedin.com/in/mrazi-dev</a>
    </div>
  </div>

  <!-- Pakistan Compliance & Unsubscribe Footer -->
  <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
    Noryvex Automation · Karachi, Pakistan<br/>
    <a href="mailto:optout@trynoryvex.com?subject=Unsubscribe" style="color: #94a3b8; text-decoration: underline;">Unsubscribe / Opt-out</a>
  </div>
</div>
  `.trim();
}

const sampleBody = "Hi Dr.,\n\nI run Noryvex — we build AI voice agents and automation that answer calls and handle bookings automatically, so nothing gets missed after hours.\n\nHere's a quick look at how it actually works: https://trynoryvex.com/#demo\n\nWorth a 2-minute look?";
const html = formatProfessionalEmailHtml(sampleBody);

console.log('=== TEST RENDERED HTML WITH PAKISTAN COMPLIANCE FOOTER ===');
console.log(html);

await pool.end();
