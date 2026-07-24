import fs from 'fs';

const filePath = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add formatProfessionalEmailHtml helper function
const helperFunc = `
function formatProfessionalEmailHtml(bodyText, config = {}) {
  if (!bodyText) return "";
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const portfolioUrl = config.portfolio_url || "noryvex.com";
  const socialLinkedin = config.social_linkedin || "";
  const socialTwitter = config.social_twitter || "";

  let signatureTitle = senderRole;
  if (useCompany && companyName) {
    signatureTitle = \`\${senderRole} · \${companyName}\`;
  }

  // Split plain text into paragraphs
  const paragraphs = bodyText
    .split(/\\n\\s*\\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const mainParagraphsHtml = paragraphs.map(p => {
    const htmlPara = p.replace(/\\n/g, "<br/>");
    return \`<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #1e293b;">\${htmlPara}</p>\`;
  }).join("");

  return \`
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px 16px; background-color: #ffffff;">
  \${mainParagraphsHtml}

  <!-- Executive Professional Signature Block -->
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
    <div style="font-weight: 700; font-size: 16px; color: #0f172a; letter-spacing: -0.01em;">\${senderName}</div>
    <div style="font-size: 13.5px; color: #64748b; margin-top: 2px; font-weight: 500;">\${signatureTitle}</div>
    \${portfolioUrl ? \`<div style="margin-top: 8px;"><a href="\${portfolioUrl.startsWith('http') ? portfolioUrl : 'https://' + portfolioUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 13.5px; font-weight: 600;">🌐 \${portfolioUrl}</a></div>\` : ''}
    \${(socialLinkedin || socialTwitter) ? \`
      <div style="margin-top: 10px; font-size: 12.5px; color: #94a3b8; display: flex; gap: 12px;">
        \${socialLinkedin ? \`<a href="\${socialLinkedin}" target="_blank" style="color: #475569; text-decoration: none;">💼 LinkedIn</a>\` : ''}
        \${socialTwitter ? \`<a href="\${socialTwitter}" target="_blank" style="color: #475569; text-decoration: none;">🐦 Twitter/X</a>\` : ''}
      </div>
    \` : ''}
  </div>
</div>
  \`.trim();
}
`;

if (!content.includes('function formatProfessionalEmailHtml')) {
  content = content.replace('async function generateDeveloperOutreach(lead, config) {', helperFunc + '\nasync function generateDeveloperOutreach(lead, config) {');
  console.log('✓ Added formatProfessionalEmailHtml helper function');
}

// 2. Update sendMail calls in campaign runner (around line 6627)
const targetCampaignSend = `            await transporter.sendMail({
              from: \`"\${config.sender_name || "Syntek"}" <\${config.gmail_user}>\`,
              to: lead.email,
              subject,
              text: body,
            });`;

const replaceCampaignSend = `            const formattedHtml = formatProfessionalEmailHtml(body, config);
            await transporter.sendMail({
              from: \`"\${config.sender_name || "Syntek"}" <\${config.gmail_user}>\`,
              to: lead.email,
              subject,
              text: body,
              html: formattedHtml
            });
            appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(() => {});`;

if (content.includes(targetCampaignSend)) {
  content = content.replace(targetCampaignSend, replaceCampaignSend);
  console.log('✓ Upgraded campaign sendMail to include formatted HTML & Signature');
} else {
  console.warn('⚠ targetCampaignSend not matched directly');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved server.js with professional email formatting upgrades');
