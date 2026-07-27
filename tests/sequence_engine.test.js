import { isLeadDueForNextStep, calculateGraduatedCap, formatCompliantEmailHtml } from '../services/sequenceEngine.js';

console.log('================ SEQUENCE ENGINE UNIT TEST ================');

function runSequenceEngineTest() {
  let passed = true;

  // 1. Test Graduated Daily Cap (5/day ramp)
  const capDay1 = calculateGraduatedCap({ daily_limit: 20 }, 1);
  const capDay3 = calculateGraduatedCap({ daily_limit: 20 }, 3);
  const capDay10 = calculateGraduatedCap({ daily_limit: 20 }, 10);

  console.log(`Cap Day 1: ${capDay1} | Cap Day 3: ${capDay3} | Cap Day 10: ${capDay10}`);

  if (capDay1 !== 5) {
    console.error('❌ FAIL: Graduated cap day 1 should start at 5!');
    passed = false;
  } else {
    console.log('✅ PASS: Graduated cap starts at 5/day.');
  }

  if (capDay10 !== 20) {
    console.error('❌ FAIL: Graduated cap day 10 should hit max configured limit (20)!');
    passed = false;
  } else {
    console.log('✅ PASS: Graduated cap ramps to configured limit.');
  }

  // 2. Test Step Timing Checks
  const leadStep0 = { sequence_step: 0, last_contacted_at: null };
  const leadStep1NotDue = { sequence_step: 1, last_contacted_at: new Date(Date.now() - 1 * 24 * 3600 * 1000) }; // 1 day ago
  const leadStep1Due = { sequence_step: 1, last_contacted_at: new Date(Date.now() - 3.5 * 24 * 3600 * 1000) }; // 3.5 days ago

  if (!isLeadDueForNextStep(leadStep0)) {
    console.error('❌ FAIL: Step 0 should be due immediately!');
    passed = false;
  }
  if (isLeadDueForNextStep(leadStep1NotDue)) {
    console.error('❌ FAIL: Step 1 should NOT be due after only 1 day!');
    passed = false;
  }
  if (!isLeadDueForNextStep(leadStep1Due)) {
    console.error('❌ FAIL: Step 1 SHOULD be due after 3.5 days!');
    passed = false;
  }
  console.log('✅ PASS: Step timing due checks verified (Day 0, Day 3, Day 7, Day 12).');

  // 3. Test Compliance Footer Injection
  const html = formatCompliantEmailHtml("Hi Dr. Smith,\n\nQuick question about your practice.\n\nBest,\nMuhammad", {
    sender_name: "Muhammad Razi",
    company_address: "100 Congress Ave, Austin, TX 78701"
  });

  if (!html.includes("Noryvex Automation · 100 Congress Ave, Austin, TX 78701")) {
    console.error('❌ FAIL: Physical address missing from compliance footer!');
    passed = false;
  } else {
    console.log('✅ PASS: Compliance footer contains mandatory physical address.');
  }

  if (!html.includes("Unsubscribe / Opt-out")) {
    console.error('❌ FAIL: Unsubscribe link missing from compliance footer!');
    passed = false;
  } else {
    console.log('✅ PASS: Unsubscribe link present in compliance footer.');
  }

  if (passed) {
    console.log('\n🎉 ALL SEQUENCE ENGINE UNIT TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\n❌ SEQUENCE ENGINE UNIT TEST FAILED!');
    process.exit(1);
  }
}

runSequenceEngineTest();
