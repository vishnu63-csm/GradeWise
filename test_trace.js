const GRADE_POINTS = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, Ab: 0 };

const sampleSems = [
  {
    semester: '1-1',
    subjects: [
      { subject: 'M1', credits: 3, grade: 'B' },
      { subject: 'PHY', credits: 3, grade: 'C' },
      { subject: 'ENG', credits: 3, grade: 'A' },
      { subject: 'PHY LAB', credits: 1.5, grade: 'S' },
      { subject: 'ENG LAB', credits: 1.5, grade: 'S' }
    ]
  },
  {
    semester: '1-2',
    subjects: [
      { subject: 'M2', credits: 3, grade: 'A' },
      { subject: 'CHEM', credits: 3, grade: 'B' },
      { subject: 'DS', credits: 3, grade: 'A' },
      { subject: 'CHEM LAB', credits: 1.5, grade: 'S' },
      { subject: 'DS LAB', credits: 1.5, grade: 'S' }
    ]
  },
  {
    semester: '2-1',
    subjects: [
      { subject: 'M3', credits: 3, grade: 'A' },
      { subject: 'DBMS', credits: 3, grade: 'S' },
      { subject: 'OS', credits: 3, grade: 'A' },
      { subject: 'DBMS LAB', credits: 1.5, grade: 'S' },
      { subject: 'OS LAB', credits: 1.5, grade: 'S' }
    ]
  }
];

function generateReport(category) {
  console.log(`\n==================================================`);
  console.log(`VERIFICATION REPORT: ${category.toUpperCase()}`);
  console.log(`==================================================\n`);

  let totalCgpaCredits = 0;
  let totalCgpaWeightedPoints = 0;
  
  const semsProcessed = [];

  for (const sem of sampleSems) {
    if (category === "Lateral Entry" && (sem.semester === '1-1' || sem.semester === '1-2')) {
      console.log(`\n--- Semester ${sem.semester} ---`);
      console.log(`Status: EXCLUDED (Lateral Entry Rule applied)\n`);
      continue;
    }

    console.log(`\n--- Semester ${sem.semester} ---`);
    let semCredits = 0;
    let semPoints = 0;
    
    console.log("Input Subjects:");
    for (const sub of sem.subjects) {
      const gp = GRADE_POINTS[sub.grade];
      const weight = sub.credits * gp;
      console.log(`  -> ${sub.subject.padEnd(10)} | Credits: ${sub.credits.toString().padEnd(3)} | Grade: ${sub.grade} (GP: ${gp.toString().padStart(2)}) | Weight (C × GP): ${weight}`);
      semCredits += sub.credits;
      semPoints += weight;
    }
    
    const exactSgpa = semPoints / semCredits;
    const displaySgpa = Number(exactSgpa.toFixed(2));
    
    console.log(`\nSemester Totals:`);
    console.log(`  -> Total Credits: ${semCredits}`);
    console.log(`  -> Total Weighted Points: ${semPoints}`);
    console.log(`  -> Exact SGPA (full precision): ${exactSgpa}`);
    console.log(`  -> Displayed SGPA (2 decimals): ${displaySgpa.toFixed(2)}`);
    
    semsProcessed.push({ semester: sem.semester, credits: semCredits, exactSgpa });
    
    totalCgpaCredits += semCredits;
    totalCgpaWeightedPoints += semCredits * exactSgpa;
  }
  
  console.log(`\n==================================================`);
  console.log(`CGPA CALCULATION (${category})`);
  console.log(`==================================================\n`);
  
  for (const sp of semsProcessed) {
    const semWeight = sp.credits * sp.exactSgpa;
    console.log(`Semester ${sp.semester}:`);
    console.log(`  -> Total Credits: ${sp.credits}`);
    console.log(`  -> Exact SGPA: ${sp.exactSgpa}`);
    console.log(`  -> Credit × SGPA: ${semWeight}`);
  }
  
  if (totalCgpaCredits === 0) {
    console.log(`\nNo valid semesters for CGPA.`);
    return;
  }
  
  const exactCgpa = totalCgpaWeightedPoints / totalCgpaCredits;
  const displayCgpa = Number(exactCgpa.toFixed(2));
  
  const exactPercentage = (exactCgpa - 0.75) * 10;
  const displayPercentage = Number(exactPercentage.toFixed(2));
  
  console.log(`\nOverall CGPA Totals:`);
  console.log(`  -> Total Weighted Points: ${totalCgpaWeightedPoints}`);
  console.log(`  -> Total Credits: ${totalCgpaCredits}`);
  console.log(`  -> Exact CGPA: ${exactCgpa}`);
  console.log(`  -> Displayed CGPA: ${displayCgpa.toFixed(2)}`);
  
  console.log(`\nPercentage Conversion:`);
  console.log(`  -> Formula: (CGPA - 0.75) × 10`);
  console.log(`  -> Exact Percentage: ${exactPercentage}`);
  console.log(`  -> Displayed Percentage: ${displayPercentage.toFixed(2)}%`);
}

generateReport("Regular Entry");
generateReport("Lateral Entry");
