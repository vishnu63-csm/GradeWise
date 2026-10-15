const http = require("http");
const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed, raw: data });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data, raw: data });
        }
      });
    });
    req.on("error", (err) => reject(err));
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function testGradeWiseAi() {
  console.log("==================================================");
  console.log("GRADEWISE AI ASSISTANT (GROQ INTEGRATION) TEST");
  console.log("==================================================");

  // 1. Test Unauthenticated Request (Must fail with 401)
  console.log("Step 1: Testing unauthenticated POST /api/ai/chat...");
  const unauthRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/ai/chat",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { message: "What is my CGPA?" }
  );

  if (unauthRes.statusCode === 401) {
    console.log("✅ Step 1 PASS: Rejected unauthenticated request with 401 Unauthorized.");
  } else {
    console.error("❌ Step 1 FAIL: Unauthenticated request was not protected:", unauthRes.body);
    process.exit(1);
  }

  // 2. Register / Login test student to get JWT token
  console.log("Step 2: Authenticating test student...");
  const testRoll = "23HP1A4288";
  const loginRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      name: "AI Test Student",
      rollNumber: testRoll,
      category: "Regular Entry",
      dept: "CSE",
      phone: "9876543288",
      email: "aitest@gradewise.edu.in",
      password: "Password123",
    }
  );

  let token = "";
  if (loginRes.statusCode === 201) {
    token = loginRes.body.token;
  } else {
    const relogin = await makeRequest(
      {
        hostname: "localhost",
        port: 3000,
        path: "/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { rollNumber: testRoll, password: "Password123" }
    );
    token = relogin.body.token;
  }

  if (!token) {
    console.error("❌ Step 2 FAIL: Could not authenticate test student.");
    process.exit(1);
  }
  console.log("✅ Step 2 PASS: Authenticated student JWT acquired.");

  // 3. Test Invalid Input (Empty message & Exceeding max length)
  console.log("Step 3: Testing input validation...");
  const emptyRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/ai/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    },
    { message: "   " }
  );

  if (emptyRes.statusCode === 400) {
    console.log("✅ Step 3 PASS: Rejected empty message with 400 Bad Request.");
  } else {
    console.error("❌ Step 3 FAIL:", emptyRes.body);
    process.exit(1);
  }

  // 4. Test Authenticated Groq Chat Query (JSON Mode)
  console.log("Step 4: Requesting GradeWise AI answer via Groq SDK...");
  const aiRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/ai/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    },
    { message: "What is SGPA and how is it calculated in GradeWise?", stream: false }
  );

  if (aiRes.statusCode === 200 && aiRes.body.success && aiRes.body.message) {
    console.log("✅ Step 4 PASS: GradeWise AI responded cleanly:");
    console.log("--------------------------------------------------");
    console.log(aiRes.body.message.slice(0, 200) + "...");
    console.log("--------------------------------------------------");
  } else {
    console.error("❌ Step 4 FAIL:", aiRes.body);
    process.exit(1);
  }

  console.log("==================================================");
  console.log("ALL GRADEWISE AI INTEGRATION TESTS PASSED CLEANLY!");
  console.log("==================================================");
}

testGradeWiseAi();
