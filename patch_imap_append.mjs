import fs from 'fs';

const filePath = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = fs.readFileSync(filePath, 'utf8');

const helperFunc = `
async function appendSentMessageToImap(sender, { to, subject, body, htmlBody }) {
  if (!sender || !sender.email || !sender.pass) return;
  const emailLower = (sender.email || "").toLowerCase();
  if (emailLower.endsWith("@gmail.com") || emailLower.endsWith("@googlemail.com")) return;

  try {
    let imapHost = sender.imap_host || sender.smtp_host;
    let imapPort = sender.imap_port || 993;

    if (!imapHost) {
      if (emailLower.endsWith("@outlook.com") || emailLower.endsWith("@hotmail.com")) imapHost = "outlook.office365.com";
      else if (emailLower.endsWith("@yahoo.com")) imapHost = "imap.mail.yahoo.com";
      else if (emailLower.endsWith("@zoho.com")) imapHost = "imap.zoho.com";
      else imapHost = "mail." + (emailLower.split("@")[1] || "");
    }

    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: imapPort === 993,
      auth: { user: sender.email, pass: sender.pass },
      logger: false
    });

    await client.connect();

    let sentPath = "Sent";
    try {
      const list = await client.list();
      const sentBox = list.find(b => (b.specialUse && b.specialUse.toLowerCase() === "\\\\sent") || b.name.toLowerCase().includes("sent"));
      if (sentBox) sentPath = sentBox.path;
    } catch (e) {}

    const mimeMessage = [
      \`From: "\${sender.email.split('@')[0]}" <\${sender.email}> \`,
      \`To: \${to}\`,
      \`Subject: \${subject}\`,
      \`Content-Type: text/html; charset=utf-8\`,
      \`Date: \${new Date().toUTCString()}\`,
      \`\`,
      htmlBody || (body ? body.replace(/\\n/g, "<br/>") : "")
    ].join("\\r\\n");

    await client.append(sentPath, Buffer.from(mimeMessage), ["\\\\Seen"]);
    await client.logout();
    console.log(\`[IMAP APPEND] Saved sent message to folder "\${sentPath}" for \${sender.email}\`);
  } catch (err) {
    console.warn(\`[IMAP APPEND WARNING] Could not append sent email for \${sender.email}:\`, err.message);
  }
}
`;

// Insert helper before syncUserInbox
if (!content.includes('async function appendSentMessageToImap')) {
  content = content.replace('async function syncUserInbox(userId, config) {', helperFunc + '\nasync function syncUserInbox(userId, config) {');
  console.log('✓ Added appendSentMessageToImap helper function');
}

// Hook into line 5545 (triggerCronCampaign followup)
const target1 = `            await transporter.sendMail({
              from: \`"\${sender.email.split('@')[0]}" <\${sender.email}>\`,
              to: lead.email,
              subject: subject,
              html: htmlBody
            });`;

const replace1 = target1 + `\n            appendSentMessageToImap(sender, { to: lead.email, subject, htmlBody }).catch(() => {});`;

if (content.includes(target1)) {
  content = content.replace(target1, replace1);
  console.log('✓ Hooked IMAP append to campaign followup sending');
}

// Hook into line 5942 (triggerCronCampaign initial outreach)
const target2 = `        await transporter.sendMail({
          from: \`"\${sender.email.split('@')[0]}" <\${sender.email}>\`,
          to: lead.email,
          subject: subject,
          html: htmlBody
        });`;

const replace2 = target2 + `\n        appendSentMessageToImap(sender, { to: lead.email, subject, htmlBody }).catch(() => {});`;

if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  console.log('✓ Hooked IMAP append to campaign initial outreach sending');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully saved server.js');
