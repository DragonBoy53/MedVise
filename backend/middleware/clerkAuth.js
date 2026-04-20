const { createClerkClient } = require("@clerk/backend");
const { requireAuth, requireRole } = require("./auth");

const requireClerkAuth = requireAuth;
const requireAdmin = requireRole("admin");

const getClerkUser = async (req, res, next) => {
  try {
    if (!req.auth?.clerkUserId || !process.env.CLERK_SECRET_KEY) {
      return next();
    }

    const client = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    });

    req.clerkUser = await client.users.getUser(req.auth.clerkUserId);
    return next();
  } catch (error) {
    console.error("Get Clerk user error:", error);
    return next();
  }
};

module.exports = {
  requireClerkAuth,
  requireAdmin,
  getClerkUser,
};
