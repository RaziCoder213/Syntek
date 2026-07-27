import { generateCompliantOutreachEmail, formatNicheName } from '../services/aiCopywriterService.js';
import { calculateLeadTierAndScore, checkIsCompetitorAgency } from '../services/scoringService.js';
import { isLeadDueForNextStep, calculateGraduatedCap, formatCompliantEmailHtml } from '../services/sequenceEngine.js';

console.log('================ FULL SYNTEK OUTREACH ENGINE SUITE ================');

async function runFullEngineTestSuite() {
  let passed = true;

  // TEST 1: Bennu Coffee Anti-Fabrication & Concatenation Fix
  console.log('\n--- TEST 1: Bennu Coffee Anti-Fabrication & Concatenation Fix ---');
  const bennuLead = {
    name: "Bennu Coffee",
    type: "Cafe",
    niche: "Coffee Shop",
    city: "Austin, TX",
    personalized_icebreaker: "NO_VERIFIED_DETAIL",
    sequence_step: 0
  };

  const copyResult = await generateCompliantOutreachEmail(bennuLead, {
    sender_name: "Muhammad Razi",
    sender_role: "Founder, Noryvex"
  });

  if (copyResult.body.toLowerCase().includes("dental")) {
    console.error('❌ FAIL: Bennu Coffee output contains dental-specific text!');
    passed = false;
  } else {
    console.log('✅ PASS: No dental-specific text for Bennu Coffee.');
  }

  if (copyResult.body.includes("I build Our AI Receptionist") || copyResult.body.includes("build Our AI")) {
    console.error('❌ FAIL: String concatenation glitch detected!');
    passed = false;
  } else {
    console.log('✅ PASS: String concatenation glitch fixed.');
  }

  if (copyResult.body.includes("http://") || copyResult.body.includes("https://")) {
    console.error('❌ FAIL: Step 1 contains links!');
    passed = false;
  } else {
    console.log('✅ PASS: Step 1 contains zero links.');
  }

  // TEST 2: Competitor Agency Pre-Filter & Quality Scorer
  console.log('\n--- TEST 2: Competitor Agency Pre-Filter & Quality Scorer ---');
  const competitorLead = {
    name: "Apex AI Solutions",
    type: "AI Agency",
    category: "Voice AI Solutions",
    is_competitor_agency: true
  };

  const compResult = calculateLeadTierAndScore(competitorLead);
  if (!compResult.isCompetitor || compResult.score !== -1000 || compResult.shouldQueue !== false) {
    console.error('❌ FAIL: Competitor agency pre-filter failed to hard-exclude!');
    passed = false;
  } else {
    console.log('✅ PASS: Competitor agency pre-filter hard-excluded competitor with score -1000.');
  }

  const inboundLead = { source_type: "inbound" };
  const inboundResult = calculateLeadTierAndScore(inboundLead);
  if (inboundResult.tier !== 5 || inboundResult.shouldQueue !== true) {
    console.error('❌ FAIL: Tier 5 Inbound lead auto-queue failed!');
    passed = false;
  } else {
    console.log('✅ PASS: Tier 5 Inbound lead auto-queued directly (skips scoring gate).');
  }

  // TEST 3: Sequence Engine Graduated Cap & Compliance Footer
  console.log('\n--- TEST 3: Sequence Engine Graduated Cap & Compliance Footer ---');
  const cap1 = calculateGraduatedCap({ daily_limit: 15 }, 1);
  const cap7 = calculateGraduatedCap({ daily_limit: 15 }, 7);

  if (cap1 !== 5 || cap7 !== 15) {
    console.error(`❌ FAIL: Graduated cap day 1 (${cap1}) or day 7 (${cap7}) incorrect!`);
    passed = false;
  } else {
    console.log('✅ PASS: Graduated daily cap starts at 5/day and ramps smoothly.');
  }

  const compliantFooterHtml = formatCompliantEmailHtml("Test email body", {
    sender_name: "Muhammad Razi",
    company_address: "100 Congress Ave, Austin, TX 78701"
  });

  if (!compliantFooterHtml.includes("100 Congress Ave, Austin, TX 78701") || !compliantFooterHtml.includes("Unsubscribe / Opt-out")) {
    console.error('❌ FAIL: Compliance footer physical address or opt-out link missing!');
    passed = false;
  } else {
    console.log('✅ PASS: Compliance footer physical address and opt-out link verified.');
  }

  // SUMMARY
  if (passed) {
    console.log('\n🎉 ALL OUTREACH ENGINE SUITE TESTS PASSED 100%!');
  } else {
    console.error('\n❌ TEST SUITE FAILED!');
    process.exit(1);
  }
}

runFullEngineTestSuite();
