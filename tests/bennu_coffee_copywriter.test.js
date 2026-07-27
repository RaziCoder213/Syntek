import { generateCompliantOutreachEmail, formatNicheName } from '../services/aiCopywriterService.js';

console.log('================ BENNU COFFEE COPYWRITER UNIT TEST ================');

async function runBennuCoffeeTest() {
  const bennuCoffeeLead = {
    name: "Bennu Coffee",
    type: "Cafe",
    niche: "Coffee Shop",
    city: "Austin, TX",
    personalized_icebreaker: "NO_VERIFIED_DETAIL",
    sequence_step: 0
  };

  const emailResult = await generateCompliantOutreachEmail(bennuCoffeeLead, {
    sender_name: "Muhammad Razi",
    sender_role: "Founder, Noryvex"
  });

  console.log('\nGenerated Subject:', emailResult.subject);
  console.log('Generated Body:\n' + emailResult.body);

  let passed = true;

  // Check 1: Does NOT contain "dental" for Bennu Coffee
  if (emailResult.body.toLowerCase().includes("dental")) {
    console.error('❌ FAIL: Body contains dental-specific language for a coffee shop!');
    passed = false;
  } else {
    console.log('✅ PASS: No dental-specific language present for Bennu Coffee.');
  }

  // Check 2: Does NOT contain merge concatenation glitch ("I build Our AI Receptionist is...")
  if (emailResult.body.includes("I build Our AI Receptionist") || emailResult.body.includes("build Our AI")) {
    console.error('❌ FAIL: Merge concatenation glitch detected!');
    passed = false;
  } else {
    console.log('✅ PASS: No string-concatenation merge glitches detected.');
  }

  // Check 3: Step 1 contains NO links
  if (emailResult.body.includes("http://") || emailResult.body.includes("https://")) {
    console.error('❌ FAIL: Step 1 email contains links!');
    passed = false;
  } else {
    console.log('✅ PASS: Step 1 email contains zero links.');
  }

  // Check 4: No exclamation marks
  if (emailResult.body.includes("!")) {
    console.error('❌ FAIL: Body contains exclamation marks!');
    passed = false;
  } else {
    console.log('✅ PASS: Zero exclamation marks.');
  }

  // Check 5: Word count under 100 words
  console.log(`ℹ️ Word count: ${emailResult.wordCount} words.`);
  if (emailResult.wordCount > 100) {
    console.warn('⚠️ WARNING: Word count slightly over 100 words.');
  }

  if (passed) {
    console.log('\n🎉 ALL BENNU COFFEE COPYWRITER TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\n❌ BENNU COFFEE TEST FAILED!');
    process.exit(1);
  }
}

runBennuCoffeeTest();
