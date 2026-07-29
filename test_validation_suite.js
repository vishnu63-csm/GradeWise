const {
  validateName,
  validateRollNumber,
  validateDepartment,
  validatePhone,
  validateCategory,
} = require("./utils/validation");

function runTests() {
  console.log("==================================================");
  console.log("AUTOMATED VALIDATION TEST SUITE");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assertTest(name, condition, details = "") {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  // 1. Valid Regular Entry
  const name1 = validateName("K Leela Venkat");
  const roll1 = validateRollNumber("23hp1a4248", "Regular Entry");
  const dept1 = validateDepartment("CSM");
  const phone1 = validatePhone("7036892614");
  const cat1 = validateCategory("Regular Entry");
  assertTest("1. Valid Regular Entry", name1.valid && roll1.valid && roll1.value === "23HP1A4248" && dept1.valid && phone1.valid && cat1.valid);

  // 2. Valid Lateral Entry
  const name2 = validateName("Kumbha Venugopal");
  const roll2 = validateRollNumber("24hp5a4209", "Lateral Entry");
  const cat2 = validateCategory("Lateral Entry");
  assertTest("2. Valid Lateral Entry", name2.valid && roll2.valid && roll2.value === "24HP5A4209" && cat2.valid);

  // 3. Invalid Category
  const cat3 = validateCategory("Management Entry");
  assertTest("3. Invalid Category Rejection", !cat3.valid && cat3.message.includes("Regular Entry"));

  // 4. Invalid Department
  const dept4 = validateDepartment("CYBER_SECURITY");
  assertTest("4. Invalid Department Rejection", !dept4.valid && dept4.message.includes("Allowed departments"));

  // 5. Invalid Phone Numbers
  const phone5a = validatePhone("1234567890");
  const phone5b = validatePhone("5555555555");
  const phone5c = validatePhone("0000000000");
  assertTest("5. Invalid Phone Rejections (1234567890, 5555555555)", !phone5a.valid && !phone5b.valid && !phone5c.valid);

  // 6. Invalid Names
  const name6a = validateName("Lat User");
  const name6b = validateName("Test User");
  const name6c = validateName("Ab");
  const name6d = validateName("John123");
  assertTest("6. Invalid Name Rejections (Dummy names & characters)", !name6a.valid && !name6b.valid && !name6c.valid && !name6d.valid);

  // 7. Invalid Roll Number Formats
  const roll7a = validateRollNumber("12345", "Regular Entry");
  const roll7b = validateRollNumber("INVALIDROLL", "Regular Entry");
  assertTest("7. Arbitrary Roll Number Rejection", !roll7a.valid && !roll7b.valid);

  // 8. Regular student using Lateral roll-number format
  const roll8 = validateRollNumber("24HP5A4202", "Regular Entry");
  assertTest("8. Regular Student with 5A (Lateral Roll) Rejection", !roll8.valid && roll8.message.includes("1A"));

  // 9. Lateral student using Regular roll-number format
  const roll9 = validateRollNumber("23HP1A4263", "Lateral Entry");
  assertTest("9. Lateral Student with 1A (Regular Roll) Rejection", !roll9.valid && roll9.message.includes("5A"));

  console.log("\n--------------------------------------------------");
  console.log(`Results: ${passed} Passed, ${failed} Failed.`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

runTests();
