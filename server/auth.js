// Auth middleware — validates session (web) or JWT Bearer token (mobile)
const jwt = require("jsonwebtoken");

const JWT_SECRET = () => process.env.JWT_SECRET || "fallback-dev-secret";
const JWT_EXPIRY  = "30d";

// Issues a signed JWT for a user — called from the mobile-token endpoint
function createMobileToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, name: user.name, role: user.role },
    JWT_SECRET(),
    { expiresIn: JWT_EXPIRY }
  );
}

// Accepts either a valid session (web) or a valid JWT Bearer token (mobile)
function requireMobileAuth(req, res, next) {
  // Session auth — web app
  if (req.session && req.session.userId) return next();

  // Bearer token auth — mobile app
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET());
      req.mobileUser = payload;
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token. Please log in again." });
    }
  }

  return res.status(401).json({ error: "Not authenticated" });
}

// Session-only middleware — unchanged, still used by web-only routes
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireMobileAuth, createMobileToken };
