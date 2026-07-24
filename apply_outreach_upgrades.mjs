import fs from 'fs';

const filePath = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add MX Validation Function to server.js
const mxValidationCode = `
import dns from "dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (e) {}

async function validateEmailWithMx(email) {
  if (!email || typeof email !== "string") return { valid: false, reason: "Empty email" };
  const trimmed = email.trim().toLowerCase();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(trimmed)) return { valid: false, reason: "Invalid email syntax" };

  const domain = trimmed.split("@")[1];
  const disposableDomains = ["mailinator.com", "10minutemail.com", "tempmail.com", "guerrillamail.com", "trashmail.com", "yopmail.com"];
  if (disposableDomains.includes(domain)) return { valid: false, reason: "Disposable email provider" };

  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: "Domain has no active MX records" };
    }
    return { valid: true, mx: mxRecords[0].exchange };
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return { valid: false, reason: "Domain has no mail server" };
    }
    return { valid: true, mx: domain, note: "DNS fallback" };
  }
}
`;

if (!content.includes('async function validateEmailWithMx')) {
  content = content.replace('async function setupDatabase() {', mxValidationCode + '\nasync function setupDatabase() {');
  console.log('✓ Added validateEmailWithMx function to server.js');
}

// 2. Clean up generateDeveloperOutreach to replace Gï¿½ï¿½ garbage characters and add Icebreaker + Decision Maker greeting
const newGenerateDeveloperOutreach = `async function generateDeveloperOutreach(lead, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const portfolioUrl = config.portfolio_url || "noryvex.com";

  // Decision maker greeting
  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : "";
  const greeting = recipientName ? \`Hi \${recipientName},\` : "Hi there,";

  // Custom Icebreaker from research or fallback
  let icebreaker = lead.personalized_icebreaker;
  if (!icebreaker || icebreaker.length < 5) {
    icebreaker = \`Noticed \${lead.name} has a great local presence in \${lead.city || "your area"}.\`;
  }

  const pitchOffer = config.pitch_offer || "whatsapp_bot";
  const customOfferDetails = config.custom_offer_details || "";

  let offerShort = "a custom AI booking assistant to handle client requests 24/7";
  if (pitchOffer === "website_dev") {
    offerShort = "a high-performing website overhaul that converts web traffic into bookings";
  } else if (pitchOffer === "ai_chatbot") {
    offerShort = "an automated AI receptionist for website & Instagram inquiry response";
  } else if (pitchOffer === "custom" && customOfferDetails) {
    offerShort = customOfferDetails;
  }

  const templateIndex = Math.abs(lead.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 4;

  let subject = \`Quick question for \${lead.name}\`;
  let body = \`\${greeting}\\n\\n\${icebreaker}\\n\\nI build \${offerShort} without adding to front-desk workload.\\n\\nTook me a minute to sketch how it would look for \${lead.name}. Open to a 2-minute preview?\\n\\nBest,\\n\${senderName}\${portfolioUrl ? \`\\n\${portfolioUrl}\` : ""}\`;

  if (templateIndex === 1) {
    subject = \`Idea for \${lead.name}\`;
    body = \`\${greeting}\\n\\n\${icebreaker}\\n\\nAre you currently looking to automate online bookings or customer inquiries for \${lead.name} this quarter?\\n\\nI help local businesses implement simple, automated tools that handle inquiries instantly.\\n\\nShould I send over a quick 30-second preview of how it would look?\\n\\nCheers,\\n\${senderName}\`;
  } else if (templateIndex === 2) {
    subject = \`Question regarding \${lead.name}\`;
    body = \`\${greeting}\\n\\n\${icebreaker}\\n\\nI'm a developer helping companies in \${lead.city || "your area"} streamline customer booking & website leads.\\n\\nWould you be open to seeing a 10-second mock-up of what an automated scheduling widget would look like for \${lead.name}?\\n\\nBest regards,\\n\${senderName}\`;
  } else if (templateIndex === 3) {
    subject = \`\${lead.name} outreach\`;
    body = \`\${greeting}\\n\\n\${icebreaker}\\n\\nIf improving online conversions or automating client scheduling is on your radar for \${lead.name}, I'd love to share a quick idea.\\n\\nWorth a 2-minute look this week?\\n\\nThanks,\\n\${senderName}\`;
  }

  return { subject, body };
}`;

// Replace generateDeveloperOutreach function
const outreachStart = content.indexOf('async function generateDeveloperOutreach');
if (outreachStart !== -1) {
  const outreachEnd = content.indexOf('async function syncUserInbox', outreachStart);
  if (outreachEnd !== -1) {
    content = content.slice(0, outreachStart) + newGenerateDeveloperOutreach + '\n\n' + content.slice(outreachEnd);
    console.log('✓ Upgraded generateDeveloperOutreach with Decision-Maker greetings & Icebreakers');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved server.js with outreach & validation upgrades');
