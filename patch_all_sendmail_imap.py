with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Direct Email endpoint (/api/send-email or similar at ~L3605)
old_code_1 = """    await transporter.sendMail({
      from: `"${gmailUser.split('@')[0]}" <${gmailUser}>`,
      to,
      subject,
      html: htmlBody
    });"""

new_code_1 = """    await transporter.sendMail({
      from: `"${gmailUser.split('@')[0]}" <${gmailUser}>`,
      to,
      subject,
      html: htmlBody
    });

    appendSentMessageToImap({ gmail_user: gmailUser, gmail_pass: gmailPass, smtp_host: smtpHost, smtp_port: smtpPort, imap_host: imapHost, imap_port: imapPort, sender_name: gmailUser.split('@')[0] }, { to, subject, htmlBody }).catch(() => {});"""

if old_code_1 in content:
    content = content.replace(old_code_1, new_code_1)
    print("✓ Hooked IMAP append to Direct Send Email endpoint (L3605)")
else:
    print("⚠ Could not match old_code_1")

# 2. AI Action Send Email (~L2101)
old_code_2 = """            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body
            });"""

new_code_2 = """            const formattedHtml = formatProfessionalEmailHtml(body, config);
            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body,
              html: formattedHtml
            });

            appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(() => {});"""

if old_code_2 in content:
    content = content.replace(old_code_2, new_code_2)
    print("✓ Hooked IMAP append to AI Chat Action Send Email (L2101)")
else:
    print("⚠ Could not match old_code_2")

# 3. Email Reply endpoint (~L3319)
old_code_3 = """        await transporter.sendMail({
          from: gmailUser,
          to: email.from_email,
          subject: email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`,
          text: replyText
        });"""

new_code_3 = """        const replySubject = email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`;
        const replyHtml = replyText.replace(/\\n/g, "<br/>");
        await transporter.sendMail({
          from: gmailUser,
          to: email.from_email,
          subject: replySubject,
          text: replyText,
          html: replyHtml
        });

        appendSentMessageToImap({ gmail_user: gmailUser, gmail_pass: gmailPass, smtp_host: config.smtp_host, smtp_port: config.smtp_port, imap_host: config.imap_host, imap_port: config.imap_port }, { to: email.from_email, subject: replySubject, htmlBody: replyHtml }).catch(() => {});"""

if old_code_3 in content:
    content = content.replace(old_code_3, new_code_3)
    print("✓ Hooked IMAP append to Email Reply endpoint (L3319)")
else:
    print("⚠ Could not match old_code_3")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
