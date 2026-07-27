import { generateCompliantOutreachEmail } from '../services/aiCopywriterService.js';
import { formatCompliantEmailHtml } from '../services/sequenceEngine.js';

console.log('================ SECTION 2: 5 REAL SAMPLE OUTREACH EMAILS ================');

const config = {
  sender_name: "Muhammad Razi",
  sender_role: "Founder, Noryvex",
  company_address: "100 Congress Ave, Austin, TX 78701"
};

async function run5SampleEmails() {
  // 1. Tier-3 Scraped Lead with Verified Gap (has_booking_widget = false)
  const lead1 = {
    name: "Highland Dental Care",
    owner_name: "Dr. Sarah Jenkins",
    type: "Dental Practice",
    has_booking_widget: false,
    sequence_step: 0,
    source_tier: 3
  };

  // 2. Tier-3 Scraped Lead with has_booking_widget = unknown
  const lead2 = {
    name: "Oakridge Wellness Clinic",
    owner_name: "Dr. Mark Vance",
    type: "Medical Clinic",
    has_booking_widget: "unknown",
    sequence_step: 0,
    source_tier: 3
  };

  // 3. Tier-4 linkedin_declared_need Lead
  const lead3 = {
    name: "Vance Legal Group",
    owner_name: "Rachel Vance",
    type: "Law Firm",
    source_type: "linkedin_declared_need",
    linkedin_post_text: "looking for an AI receptionist to handle our inbound client intake calls after hours",
    sequence_step: 0,
    source_tier: 4
  };

  // 4. Non-Dental Niche Lead (Bennu Coffee)
  const lead4 = {
    name: "Bennu Coffee",
    owner_name: "Steve",
    type: "Cafe",
    niche: "Coffee Shop",
    sequence_step: 0,
    source_tier: 3
  };

  // 5. Trial Campaign Lead (Step 3 Show-and-tell link to #trial)
  const lead5 = {
    name: "Austin Urgent Care",
    owner_name: "Dr. Robert Vance",
    type: "Medical Practice",
    sequence_step: 2, // Step 3
    source_tier: 3
  };

  const leads = [
    { title: "SAMPLE 1: Tier-3 Scraped Lead (Verified Gap: booking = false)", lead: lead1 },
    { title: "SAMPLE 2: Tier-3 Scraped Lead (Uncertain Gap: booking = unknown)", lead: lead2 },
    { title: "SAMPLE 3: Tier-4 LinkedIn Declared Need Lead (Post Text Personalization)", lead: lead3 },
    { title: "SAMPLE 4: Non-Dental Lead (Bennu Coffee — Niche Awareness Check)", lead: lead4 },
    { title: "SAMPLE 5: Step 3 Email (Single Demo/Trial Link + Compliance Footer)", lead: lead5, isTrial: true }
  ];

  for (let i = 0; i < leads.length; i++) {
    const item = leads[i];
    const emailObj = await generateCompliantOutreachEmail(item.lead, { ...config, is_trial_campaign: item.isTrial });
    const fullHtml = formatCompliantEmailHtml(emailObj.body, config);

    console.log(`\n==================================================`);
    console.log(`📌 ${item.title}`);
    console.log(`Subject: ${emailObj.subject}`);
    console.log(`Word Count: ${emailObj.wordCount} words`);
    console.log(`--- Plain Text Body ---`);
    console.log(emailObj.body);
    console.log(`--- HTML Compliance Footer Excerpt ---`);
    console.log(fullHtml.slice(fullHtml.indexOf('Executive Signature Block')));
  }
}

run5SampleEmails();
