const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL: JWT_SECRET environment variable is missing in production!");
    }
    return "sgpa_jwt_secret_key_2024";
  }
  return secret;
}

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated. Please log in." });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload; // { id, rollNumber, name }
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
};
