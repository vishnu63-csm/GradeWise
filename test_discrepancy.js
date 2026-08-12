const GRADE_POINTS = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, Ab: 0 };

function oldSgpa(subjects) {
  let totalCredits = 0;
  let totalPoints = 0;
  for (const sub of subjects) {
    const gp = GRADE_POINTS[sub.grade];
    const credits = Number(sub.credits);
    totalCredits += credits;
    totalPoints += credits * gp;
  }
  return {
    sgpa: Math.round((totalPoints / totalCredits) * 100) / 100,
    credits: totalCredits,
    exactSgpa: totalPoints / totalCredits
  };
}

function oldCgpa(semesters) {
  let totalCredits = 0;
  let weighted = 0;
  for (const s of semesters || []) {
    totalCredits += s.credits;
    weighted += s.credits * s.sgpa; // Uses rounded SGPA!
  }
  if (totalCredits === 0) return null;
  const cgpa = Math.round((weighted / totalCredits) * 100) / 100;
  const percentage = Math.round((cgpa - 0.75) * 10 * 100) / 100;
  return { cgpa, percentage, totalCredits };
}

function newCgpa(semesters) {
  let totalCredits = 0;
  let weighted = 0;
  for (const s of semesters || []) {
    totalCredits += s.credits;
    weighted += s.credits * s.exactSgpa; 
  }
  if (totalCredits === 0) return null;
  const cgpa = weighted / totalCredits; // Unrounded internal
  const percentage = (cgpa - 0.75) * 10;
  return { 
    cgpa,
    displayCgpa: Math.round(cgpa * 100) / 100, 
    percentage,
    displayPct: Math.round(percentage * 100) / 100,
    totalCredits 
  };
}

// Replicate the 75.5 vs 74 / 73.9 issue.
// If expected percentage = 75.5, then CGPA = 8.30
// Application yields percentage = 73.9, which is CGPA = 8.14
// Application yields percentage = 74.0, which is CGPA = 8.15
// What can cause an 8.3 CGPA to drop to 8.15?
// 1. Averaging SGPAs instead of weighting them.
// Let's test the average method:
function averageCgpa(semesters) {
  let sumSgpa = 0;
  for (const s of semesters) sumSgpa += s.sgpa;
  const cgpa = sumSgpa / semesters.length;
  const percentage = (cgpa - 0.75) * 10;
  return {
    cgpa: Math.round(cgpa * 100) / 100,
    percentage: Math.round(percentage * 100) / 100
  }
}

// Case A: Unbalanced credits
// Suppose Semester 1 has 15 credits with SGPA 9.5
// Semester 2 has 25 credits with SGPA 7.58
// Weighted CGPA: (15*9.5 + 25*7.58) / 40 = (142.5 + 189.5) / 40 = 332 / 40 = 8.30 (Percentage 75.5)
// Average CGPA: (9.5 + 7.58) / 2 = 8.54 (Percentage 77.9) - doesn't match 73.9

// Case B: Rounding error alone?
// If exactSgpa is 8.3, rounding to 2 decimals is 8.30. Rounding error is usually < 0.01.
// It's impossible for rounding error to drop 8.30 to 8.15.

// Case C: Incorrect formula in previous code?
// Let's check dashboard.js again...
// "let tc = 0, tw = 0; for (const s of semesters) { tc += s.credits; tw += s.credits * s.sgpa; }"
// It IS weighting by credits.

// Case D: Percentage formula difference?
// Some universities use CGPA * 10 - 7.5 = Percentage (which is equivalent to (CGPA-0.75)*10).
// Wait, JNTUK R23 is (CGPA - 0.75) * 10.
// Older JNTUK (R19/R20) formula is (CGPA - 0.5) * 10 !
// If CGPA = 8.3.
// R23: (8.3 - 0.75) * 10 = 75.5 %  <-- Expected!
// R19/R16: (8.3 - 0.5) * 10 = 78 %
// Wait. What if a student uses the calculator and expects 75.5%, but gets 74%?
// Let's check if there is an exact case where application output is 73.9.

// Case E: Lateral Entry students forced to add fake sem 1 and 2!
// If Sem 1 & 2 are excluded, CGPA = 8.3 (75.5%)
// If Sem 1 & 2 are included as some 0-credit or low-credit dummy entries:
const lateralError = [
  { credits: 3.5, sgpa: 5, exactSgpa: 5 }, // They just put a D grade to pass?
  { credits: 21, sgpa: 8.3, exactSgpa: 8.3 },
  { credits: 19, sgpa: 8.3, exactSgpa: 8.3 }
];
console.log("Lateral Error case:", oldCgpa(lateralError));

// Case F: Total credits calculation incorrect?
// What if they entered 0 credits for labs?
// Lab grades: A (9 gp). If credits=0, it contributes 0 to totalPoints, but also 0 to totalCredits.

// Let's output these.
