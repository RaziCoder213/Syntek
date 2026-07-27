with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_drafter_func = """async function generateDeveloperOutreach(lead, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Founder, Noryvex";
  
  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : "";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const company = lead.name || "your team";
  const step = lead.sequence_step || 0;

  // Rule 1: Icebreaker — only use if verified real detail exists, else skip cleanly
  let icebreakerLine = "";
  if (lead.personalized_icebreaker && 
      !lead.personalized_icebreaker.includes("NO_VERIFIED_DETAIL") && 
      !lead.personalized_icebreaker.includes("great local presence") && 
      lead.personalized_icebreaker.length > 15) {
    icebreakerLine = lead.personalized_icebreaker.trim() + "\\n\\n";
  }

  // STEP 1: Cold Outreach (NO LINKS!)
  if (step === 0) {
    const subjects = [
      `quick question about ${company}`,
      `${company} + booking`,
      `saw ${company} — one question`
    ];
    const hash = Math.abs(company.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
    const subject = subjects[hash % subjects.length];

    const body = `${greeting}\\n\\n${icebreakerLine}It's easy for calls to slip to voicemail during peak hours or after-hours when the front desk is busy.\\n\\nWe built a 24/7 AI Receptionist specifically for ${lead.type || "dental & medical practices"}.\\n\\nIt answers FAQs, collects consultation details, and transfers urgent callers automatically so no high-value inquiry is lost.\\n\\nMind if I send over a quick 2-minute demo?\\n\\nBest,\\n${senderName}\\n${senderRole}`;

    return { subject, body };
  }

  // STEP 2: Follow-up Check-in (NO LINKS!)
  if (step === 1) {
    const subject = `following up`;
    const body = `${greeting}\\n\\nFollowing up on my note from earlier this week.\\n\\nDid you have a chance to see if missed after-hours calls or booking inquiries are something ${company} is looking to solve right now?\\n\\nMind if I send over a quick 2-minute preview?\\n\\nBest,\\n${senderName}\\n${senderRole}`;

    return { subject, body };
  }

  // STEP 3: Show-and-Tell (Demo Link Allowed!)
  if (step === 2) {
    const subject = `how this actually works`;
    const body = `${greeting}\\n\\nThought it would be easier to show rather than explain.\\n\\nHere's a 90-second demo of how the AI receptionist handles incoming calls and books appointments automatically:\\nhttps://trynoryvex.com/#demo\\n\\nWould this be useful for ${company}?\\n\\nBest,\\n${senderName}\\n${senderRole}`;

    return { subject, body };
  }

  // STEP 4: Breakup Email (NO LINKS!)
  const subject = `should I close the loop?`;
  const body = `${greeting}\\n\\nI haven't heard back, so I assume automated call answering and appointment booking isn't a priority for ${company} right now.\\n\\nI'll close your file and won't bug you again. If things change down the road, feel free to reach out anytime.\\n\\nBest,\\n${senderName}\\n${senderRole}`;

  return { subject, body };
}"""

pos_start = content.find("async function generateDeveloperOutreach")
if pos_start != -1:
    pos_end = content.find("async function syncUserInbox", pos_start)
    if pos_end != -1:
        content = content[:pos_start] + new_drafter_func + "\n\n" + content[pos_end:]
        print("SUCCESS: Updated generateDeveloperOutreach to enforce 8 pattern checks!")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
