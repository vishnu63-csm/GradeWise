const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated. Please log in." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, rollNumber, name }
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
};
