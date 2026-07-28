import { generateCompliantOutreachEmail, formatNicheName, getMasterDescription } from '../services/aiCopywriterService.js';

console.log('================ BENNU COFFEE COPYWRITER UNIT TEST ================');

async function runBennuCoffeeTest() {
  let passed = true;

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

  // Check 6: Master Description Regression Test for cafe_restaurant
  const cafeMasterDesc = getMasterDescription("cafe_restaurant");
  console.log('\nMaster Description for cafe_restaurant:\n' + cafeMasterDesc);
  const forbiddenWords = ["patient", "dental", "clinic", "hygienist"];
  const foundForbidden = forbiddenWords.filter(w => cafeMasterDesc.toLowerCase().includes(w));

  if (foundForbidden.length > 0) {
    console.error(`❌ FAIL: Master description for cafe_restaurant contains forbidden dental words: ${foundForbidden.join(', ')}`);
    passed = false;
  } else {
    console.log('✅ PASS: Master description for cafe_restaurant contains zero instances of patient, dental, clinic, or hygienist.');
  }

  if (passed) {
    console.log('\n🎉 ALL BENNU COFFEE COPYWRITER TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\n❌ BENNU COFFEE TEST FAILED!');
    process.exit(1);
  }
}

runBennuCoffeeTest();
