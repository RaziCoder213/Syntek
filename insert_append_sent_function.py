import sys

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

helper_function = """
// Global Helper: Auto-append outgoing SMTP emails into IMAP Sent folder (e.g. Namecheap PrivateEmail)
async function appendSentMessageToImap(config, { to, subject, htmlBody }) {
  try {
    const user = config.gmail_user;
    let pass = config.gmail_pass;
    if (!user || !pass) return;
    if (typeof pass === 'string' && pass.startsWith("enc:")) {
      pass = decryptText(pass);
    }
    const host = config.imap_host || config.smtp_host || "mail.privateemail.com";
    const port = parseInt(config.imap_port || "993");

    // Skip Gmail as Gmail SMTP auto-saves to Sent folder natively
    if (host.includes("gmail.com") || user.includes("gmail.com")) return;

    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false
    });

    await client.connect();
    const mailboxes = await client.list();
    const sentBox = mailboxes.find(m => (m.specialUse && m.specialUse.toLowerCase() === '\\\\sent') || m.path.toLowerCase().includes("sent"))?.path || "Sent";

    const senderName = config.sender_name || "Syntek";
    const rawMessage = [
      `From: "${senderName}" <${user}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody || ""
    ].join("\\r\\n");

    const lock = await client.getMailboxLock(sentBox);
    try {
      await client.append(sentBox, Buffer.from(rawMessage), ["\\\\Seen"]);
      console.log(`[IMAP SENT SYNC] Successfully saved sent email to '${sentBox}' folder for ${to}`);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error("[IMAP SENT SYNC ERROR] Failed saving email to Sent folder:", err.message);
  }
}
"""

target = "const { Pool } = pg;"
if target in content:
    content = content.replace(target, target + "\n" + helper_function)
    print("SUCCESS: Inserted appendSentMessageToImap helper function")
else:
    print("ERROR: Target 'const { Pool } = pg;' not found in server.js")
    sys.exit(1)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js successfully")
