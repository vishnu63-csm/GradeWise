const http = require("http");

const routes = [
  "/",
  "/how-it-works",
  "/about",
  "/help",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/register",
  "/forgot-password",
  "/reset-password"
];

function checkRoute(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      if (res.statusCode === 200) {
        resolve(`✅ ${path} -> 200 OK`);
      } else {
        reject(`❌ ${path} -> ${res.statusCode}`);
      }
    }).on("error", (err) => reject(`❌ ${path} -> Error: ${err.message}`));
  });
}

async function runRouteTests() {
  console.log("=== ROUTE ACCESSIBILITY TEST ===");
  for (const r of routes) {
    try {
      const msg = await checkRoute(r);
      console.log(msg);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }
  console.log("=== ALL ROUTES ACCESSIBLE AND RETURNING 200 OK ===");
}

runRouteTests();
