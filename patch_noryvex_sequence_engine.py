import sys

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. New Noryvex 4-Step Sequence Generator Function
new_sequence_generator = """
async function generateNoryvexSequenceEmail(lead, step = 1, config = {}) {
  const company = lead.name || "your business";
  const name = lead.owner_name ? lead.owner_name.split(" ")[0] : "";
  const recipientGreeting = name ? name : "there";
  const niche = lead.type || "local";

  if (step === 1) {
    const subjects = [
      `quick question about ${company}`,
      `${company} + booking`,
      `saw ${company} — one question`
    ];
    const hash = Math.abs(company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const subject = subjects[hash % subjects.length];

    let icebreakerLine = "";
    if (lead.personalized_icebreaker && lead.personalized_icebreaker.length > 5) {
      icebreakerLine = lead.personalized_icebreaker.trim();
    }

    const bodyParts = [
      `Hi ${recipientGreeting},`
    ];
    if (icebreakerLine) {
      bodyParts.push(icebreakerLine);
    }
    bodyParts.push(
      `I run Noryvex — we build AI voice agents and automation that answer calls and handle bookings automatically, so nothing gets missed after hours.`,
      `Here's a quick look at how it actually works: https://trynoryvex.com/#demo`,
      `Worth a 2-minute look, or a quick call if useful?`,
      `Muhammad Razi\nFounder, Noryvex\nrazi@trynoryvex.com | trynoryvex.com`
    );

    return { subject, body: bodyParts.join("\\n\\n") };
  } else if (step === 2) {
    return {
      subject: "following up",
      body: `Hey ${recipientGreeting}, following up in case this got buried.\\n\\nA lot of ${niche} businesses lose a few bookings a week just from missed calls after hours. Curious if that's true for ${company} too.\\n\\nMuhammad`
    };
  } else if (step === 3) {
    return {
      subject: "how this actually works",
      body: `${recipientGreeting ? recipientGreeting : company} — figured I'd show rather than explain.\\n\\nHere's the 90-second demo: https://trynoryvex.com/#demo\\n\\nHappy to set one up for ${company} if it looks useful. Let me know if you'd rather not hear from me again.\\n\\nMuhammad`
    };
  } else if (step === 4) {
    return {
      subject: "should I close the loop?",
      body: `${recipientGreeting ? recipientGreeting : company} — I'll stop reaching out after this one.\\n\\nIf this isn't a priority for ${company} right now, no worries. If it is, just reply and I'll send over a couple ideas.\\n\\nMuhammad`
    };
  }

  return { subject: `quick question about ${company}`, body: `Hi ${recipientGreeting},\\n\\nFollowing up regarding ${company}.\\n\\nBest,\\nMuhammad` };
}
"""

# Replace generateDeveloperOutreach with generateNoryvexSequenceEmail wrapper
pos_gen = content.find("async function generateDeveloperOutreach")
if pos_gen != -1:
    pos_gen_end = content.find("}\n\n", pos_gen)
    if pos_gen_end != -1:
        wrapper_gen = new_sequence_generator + """
async function generateDeveloperOutreach(lead, config, step = 1) {
  return generateNoryvexSequenceEmail(lead, step, config);
}
"""
        content = content[:pos_gen] + wrapper_gen + content[pos_gen_end + 3:]
        print("✓ Integrated 4-step Noryvex Sequence Email Generator")

# 2. Update formatProfessionalEmailHtml to use exact Noryvex signature
old_sig_block = """  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px 16px; background-color: #ffffff;">
  ${mainParagraphsHtml}

  <!-- Executive Professional Signature Block -->
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
    <div style="font-weight: 700; font-size: 16px; color: #0f172a; letter-spacing: -0.01em;">${senderName}</div>
    <div style="font-size: 13.5px; color: #64748b; margin-top: 2px; font-weight: 500;">${signatureTitle}</div>
    ${portfolioUrl ? `<div style="margin-top: 8px;"><a href="${portfolioUrl.startsWith('http') ? portfolioUrl : 'https://' + portfolioUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 13.5px; font-weight: 600;">🌐 ${portfolioUrl}</a></div>` : ''}
    ${(socialLinkedin || socialTwitter) ? `
      <div style="margin-top: 10px; font-size: 12.5px; color: #94a3b8; display: flex; gap: 12px;">
        ${socialLinkedin ? `<a href="${socialLinkedin}" target="_blank" style="color: #475569; text-decoration: none;">💼 LinkedIn</a>` : ''}
        ${socialTwitter ? `<a href="${socialTwitter}" target="_blank" style="color: #475569; text-decoration: none;">🐦 Twitter/X</a>` : ''}
      </div>
    ` : ''}
  </div>
</div>
  `.trim();"""

new_sig_block = """  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px 16px; background-color: #ffffff;">
  ${mainParagraphsHtml}

  <!-- Noryvex Signature Block -->
  <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
    <div style="font-weight: 700; font-size: 15.5px; color: #0f172a;">Muhammad Razi</div>
    <div style="font-size: 13px; color: #475569; margin-top: 2px; font-weight: 500;">Founder, Noryvex — AI Voice Agents &amp; Business Automation</div>
    <div style="margin-top: 6px; font-size: 13px; color: #2563eb;">
      <a href="mailto:razi@trynoryvex.com" style="color: #2563eb; text-decoration: none;">razi@trynoryvex.com</a> &nbsp;·&nbsp; 
      <a href="https://trynoryvex.com" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">trynoryvex.com</a>
    </div>
    <div style="margin-top: 6px; font-size: 12.5px; color: #64748b;">
      <a href="https://linkedin.com/in/mrazi-dev" target="_blank" style="color: #475569; text-decoration: none;">LinkedIn: linkedin.com/in/mrazi-dev</a>
    </div>
  </div>
</div>
  `.trim();"""

if old_sig_block in content:
    content = content.replace(old_sig_block, new_sig_block)
    print("✓ Updated Noryvex Signature Block in HTML renderer")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
