function testPatternCheck(lead, config = {}) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Founder, Noryvex";
  
  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : "";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const company = lead.name || "your team";
  const step = lead.sequence_step || 0;

  let icebreakerLine = "";
  if (lead.personalized_icebreaker && 
      !lead.personalized_icebreaker.includes("NO_VERIFIED_DETAIL") && 
      !lead.personalized_icebreaker.includes("great local presence") && 
      lead.personalized_icebreaker.length > 15) {
    icebreakerLine = lead.personalized_icebreaker.trim() + "\n\n";
  }

  if (step === 0) {
    const subjects = [
      `quick question about ${company}`,
      `${company} + booking`,
      `saw ${company} — one question`
    ];
    const hash = Math.abs(company.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
    const subject = subjects[hash % subjects.length];

    const body = `${greeting}\n\n${icebreakerLine}It's easy for calls to slip to voicemail during peak hours or after-hours when the front desk is busy.\n\nWe built a 24/7 AI Receptionist specifically for ${lead.type || "dental & medical practices"}.\n\nIt answers FAQs, collects consultation details, and transfers urgent callers automatically so no high-value inquiry is lost.\n\nMind if I send over a quick 2-minute demo?\n\nBest,\n${senderName}\n${senderRole}`;

    return { subject, body };
  }
}

const sampleLeadVerified = {
  name: "Harley Street Dental Clinic",
  type: "Dental Practice",
  owner_name: "Dr. Smith",
  personalized_icebreaker: "I noticed your 180+ glowing reviews praising your comforting spa positioning in London.",
  sequence_step: 0
};

const sampleLeadUnverified = {
  name: "Wimbledon Dental Care",
  type: "Dental Practice",
  personalized_icebreaker: "NO_VERIFIED_DETAIL",
  sequence_step: 0
};

console.log('=== TEST 1: VERIFIED ICEBREAKER LEAD (STEP 1 - NO LINKS) ===');
const res1 = testPatternCheck(sampleLeadVerified);
console.log('Subject:', res1.subject);
console.log('Body:\n' + res1.body);
console.log('\nContains links in Step 1?:', res1.body.includes('http') ? '❌ FAILS (Link found)' : '✅ PASS (No link present)');

console.log('\n=== TEST 2: UNVERIFIED ICEBREAKER LEAD (STEP 1 - NO LINKS, ICEBREAKER SKIPPED) ===');
const res2 = testPatternCheck(sampleLeadUnverified);
console.log('Subject:', res2.subject);
console.log('Body:\n' + res2.body);
console.log('\nContains links in Step 1?:', res2.body.includes('http') ? '❌ FAILS (Link found)' : '✅ PASS (No link present)');
