import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Define appendSentMessageToImap helper function
helper_code = '''
// Helper to append outgoing custom SMTP emails into IMAP Sent folder (e.g. Namecheap PrivateEmail)
async function appendSentMessageToImap(config, { to, subject, htmlBody }) {
  try {
    const user = config.gmail_user;
    let pass = config.gmail_pass;
    if (!user || !pass) return;
    if (pass.startsWith("enc:")) {
      pass = decryptText(pass);
    }
    const host = config.imap_host || "mail.privateemail.com";
    const port = parseInt(config.imap_port || "993");

    // Skip Gmail as Gmail SMTP automatically copies to Sent
    if (host.includes("gmail.com") || user.includes("gmail.com")) return;

    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false
    });

    await client.connect();
    const mailboxes = await client.list();
    const sentBox = mailboxes.find(m => m.specialUse === "\\\\Sent" || m.path.toLowerCase().includes("sent"))?.path || "Sent";

    const senderName = config.sender_name || "Syntek";
    const rawMessage = `From: "${senderName}" <${user}>
To: ${to}
Subject: ${subject}
Date: ${new Date().toUTCString()}
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

${htmlBody}`;

    const lock = await client.getMailboxLock(sentBox);
    try {
      await client.append(sentBox, rawMessage, ["\\\\Seen"]);
      console.log(`[IMAP SENT SYNC] Successfully copied sent email to '${sentBox}' folder for ${to}`);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error("[IMAP SENT SYNC ERROR] Failed copying to Sent folder:", err.message);
  }
}
'''

# Insert helper_code if not present
if 'function appendSentMessageToImap' not in content:
    pos = content.find("const app = express();")
    if pos != -1:
        content = content[:pos] + helper_code + "\n\n" + content[pos:]
        print("✓ Added appendSentMessageToImap helper function")
    else:
        print("⚠ Could not find position for app = express()")

# Hook into campaign runner sendMail
campaign_hook = "appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(() => {});"
if campaign_hook not in content:
    target_str = "await pool.query(\n              \"UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2\","
    if target_str in content:
        content = content.replace(target_str, f"{campaign_hook}\n\n            " + target_str)
        print("✓ Hooked appendSentMessageToImap into campaign runner")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
