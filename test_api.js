const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(options, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          if (!resData) return resolve({});
          resolve(JSON.parse(resData));
        } catch (e) {
          resolve(resData);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(data);
    req.end();
  });
}

async function runTests() {
  const ts = Date.now().toString();
  const suffix = ts.slice(-4);
  const phone = "9876" + ts.slice(-6);

  console.log("=== Test 1: Regular Entry ===");
  const regUser = {
    name: "Ram Kumar", 
    rollNumber: "23HP1A" + suffix, 
    dept: "CSM", 
    phone: phone, 
    password: "password", 
    category: "Regular Entry"
  };
  const regRes = await request('POST', '/api/auth/register', regUser);
  const regToken = regRes.token;

  await request('POST', '/api/student/semester', {
    semester: '1-1', subjects: [{ subject: "A", credits: 21, grade: "S" }] // points: 210
  }, regToken);
  await request('POST', '/api/student/semester', {
    semester: '1-2', subjects: [{ subject: "B", credits: 19, grade: "S" }] // points: 190
  }, regToken);
  
  const regStudent = await request('GET', '/api/student', null, regToken);
  console.log("Regular CGPA (Expected 10):", regStudent.cgpa);
  
  console.log("\n=== Test 2: Lateral Entry skips 1-1 ===");
  // Ensure suffix and phone are unique from the previous test
  const suffixLat = ((parseInt(suffix) + 1) % 10000).toString().padStart(4, '0');
  const phoneLat = "9875" + ts.slice(-6);
  const latUser = {
    name: "Kiran Prasad", 
    rollNumber: "24HP5A" + suffixLat, 
    dept: "CSM", 
    phone: phoneLat, 
    password: "password", 
    category: "Lateral Entry"
  };
  const latRes = await request('POST', '/api/auth/register', latUser);
  const latToken = latRes.token;

  const latSemRej = await request('POST', '/api/student/semester', {
    semester: '1-1', subjects: [{ subject: "A", credits: 21, grade: "S" }]
  }, latToken);
  console.log("Reject 1-1 for Lateral:", latSemRej.error ? "Pass" : "Fail", latSemRej.error);
  
  await request('POST', '/api/student/semester', {
    semester: '2-1', subjects: [{ subject: "A", credits: 20, grade: "A" }] // points: 180
  }, latToken);
  await request('POST', '/api/student/semester', {
    semester: '2-2', subjects: [{ subject: "A", credits: 20, grade: "B" }] // points: 160
  }, latToken);

  const latStudent = await request('GET', '/api/student', null, latToken);
  console.log("Lateral CGPA (Expected 8.5):", latStudent.cgpa);
  
  console.log("\n=== Test 3: Change Category Behavior ===");
  const chgRes = await request('PUT', '/api/student/category', { category: "Regular Entry" }, latToken);
  console.log("Updated Category:", chgRes.category);
  
  await request('POST', '/api/student/semester', {
    semester: '1-1', subjects: [{ subject: "C", credits: 10, grade: "S" }] // points: 100
  }, latToken);
  const chgStudent = await request('GET', '/api/student', null, latToken);
  console.log("CGPA as Regular (Expected 8.8):", chgStudent.cgpa);
  
  await request('PUT', '/api/student/category', { category: "Lateral Entry" }, latToken);
  const finalLat = await request('GET', '/api/student', null, latToken);
  console.log("CGPA back to Lateral (Expected 8.5):", finalLat.cgpa);

  console.log("\n=== Test 4: Decimal SGPA precision ===");
  const suffixDec = ((parseInt(suffix) + 2) % 10000).toString().padStart(4, '0');
  const phoneDec = "9874" + ts.slice(-6);
  const decUser = {
    name: "Suresh Babu", 
    rollNumber: "23HP1A" + suffixDec, 
    dept: "CSM", 
    phone: phoneDec, 
    password: "password", 
    category: "Regular Entry"
  };
  const decRes = await request('POST', '/api/auth/register', decUser);
  const decToken = decRes.token;

  await request('POST', '/api/student/semester', {
    semester: '1-1', subjects: [{ subject: "A", credits: 21.5, grade: "A" }] // 193.5 points, SGPA 9.0
  }, decToken);
  await request('POST', '/api/student/semester', {
    semester: '1-2', subjects: [{ subject: "A", credits: 19, grade: "C" }] // 133 points, SGPA 7.0
  }, decToken);
  // Total points = 326.5. Total credits = 40.5. CGPA = 8.061728...
  const decStudent = await request('GET', '/api/student', null, decToken);
  console.log("Unrounded CGPA:", decStudent.cgpa);
  console.log("Unrounded Percentage:", decStudent.percentage);

  process.exit(0);
}

runTests().catch(console.error);
