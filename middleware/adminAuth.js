const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "sgpa_jwt_secret_key_2024";

module.exports = function adminAuthMiddleware(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Admin access required. Please log in as admin." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }
    req.admin = payload; // { id, username, isAdmin: true, role }
    next();
  } catch {
    return res.status(401).json({ error: "Admin session expired. Please log in again." });
  }
};
