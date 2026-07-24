with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body,
            });"""

replacement = """            const formattedHtml = formatProfessionalEmailHtml(body, config);
            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body,
              html: formattedHtml,
            });
            appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(() => {});"""

if target in content:
    content = content.replace(target, replacement)
    print('✓ Upgraded sendMail in server.js!')
else:
    print('⚠ Target string not found')

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
