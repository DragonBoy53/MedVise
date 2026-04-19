const jwt = require("jsonwebtoken");
const { createClerkClient, verifyToken } = require("@clerk/backend");

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

function isMfaEnforced() {
  return String(process.env.ADMIN_MFA_ENFORCED).toLowerCase() === "true";
}

function getClerkClient() {
  if (!process.env.CLERK_SECRET_KEY) {
    return null;
  }

  return createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  });
}

async function tryLocalJwt(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

async function tryClerkToken(token) {
  if (!process.env.CLERK_SECRET_KEY) {
    return null;
  }

  try {
    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      jwtKey: process.env.CLERK_JWT_KEY,
    });

    const clerkUserId = verifiedToken.sub;
    if (!clerkUserId) {
      return null;
    }

    const clerkClient = getClerkClient();
    const clerkUser = clerkClient ? await clerkClient.users.getUser(clerkUserId) : null;

    const role =
      clerkUser?.publicMetadata?.role ||
      clerkUser?.unsafeMetadata?.role ||
      "user";

    return {
      id: null,
      clerkUserId,
      email:
        clerkUser?.primaryEmailAddress?.emailAddress ||
        verifiedToken.email ||
        null,
      fullName:
        clerkUser?.fullName ||
        [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
        null,
      role,
      mfaVerified: !isMfaEnforced(),
      authProvider: "clerk",
      sessionId: verifiedToken.sid || null,
      tokenType: "clerk_session",
    };
  } catch (error) {
    return null;
  }
}

async function authenticateRequest(req) {
  const token = extractBearerToken(req);

  if (!token) {
    return null;
  }

  const localPayload = await tryLocalJwt(token);
  if (localPayload) {
    return {
      ...localPayload,
      localUserId: localPayload.id || null,
      clerkUserId: localPayload.clerkUserId || null,
      email: localPayload.email || null,
      fullName: localPayload.fullName || localPayload.fullname || null,
      mfaVerified: localPayload.mfaVerified || !isMfaEnforced(),
      authProvider: "local_jwt",
      tokenType: "local_jwt",
    };
  }

  return tryClerkToken(token);
}

async function requireAuth(req, res, next) {
  if (!extractBearerToken(req)) {
    return res.status(401).json({
      message: "Authentication required. Send a Bearer token.",
    });
  }

  const authPayload = await authenticateRequest(req);
  if (authPayload) {
    req.auth = authPayload;
    return next();
  }

  return res.status(401).json({
    message:
      "Invalid or expired token. For Clerk-based sessions, make sure CLERK_SECRET_KEY is configured on the backend.",
  });
}

async function optionalAuth(req, res, next) {
  try {
    const authPayload = await authenticateRequest(req);
    if (authPayload) {
      req.auth = authPayload;
    }
    return next();
  } catch (error) {
    return next();
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

  if (isMfaEnforced() && !mfaVerified) {
    return res.status(403).json({
      message: "Two-factor authentication verification is required.",
      code: "MFA_REQUIRED",
    });
  }

  return next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdminMfa,
};
