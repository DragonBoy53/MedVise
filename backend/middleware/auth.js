const jwt = require("jsonwebtoken");

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.auth?.role;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }

    return next();
  };
}

function requireAdminMfa(req, res, next) {
  const isAdmin = req.auth?.role === "admin";
  const mfaVerified = Boolean(req.auth?.mfaVerified);

  if (!isAdmin) {
    return res.status(403).json({ message: "Admin access required." });
  }

  if (!mfaVerified) {
    return res.status(403).json({
      message: "Two-factor authentication verification is required.",
      code: "MFA_REQUIRED",
    });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdminMfa,
};
