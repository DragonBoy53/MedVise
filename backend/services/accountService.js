const { createClerkClient } = require("@clerk/backend");

function getClerkClient() {
  if (!process.env.CLERK_SECRET_KEY) {
    const error = new Error("CLERK_SECRET_KEY is not configured.");
    error.code = "CLERK_NOT_CONFIGURED";
    throw error;
  }

  return createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
}

function getPrimaryEmail(clerkUser) {
  return (
    clerkUser?.emailAddresses?.find(
      (item) => item.id === clerkUser?.primaryEmailAddressId,
    )?.emailAddress ||
    clerkUser?.primaryEmailAddress?.emailAddress ||
    null
  );
}

function resolveRole(clerkUser) {
  return (
    clerkUser?.publicMetadata?.role ||
    clerkUser?.unsafeMetadata?.role ||
    "user"
  );
}

function buildClinicianCode(clerkUser) {
  const email = getPrimaryEmail(clerkUser) || "";
  const localPart = email.split("@")[0] || "clinician";
  const safePrefix = localPart.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 18);
  const suffix = String(clerkUser?.id || "").slice(-6).toLowerCase() || "med";
  return `doc-${safePrefix || "clinician"}-${suffix}`;
}

async function getClerkUser(clerkUserId) {
  const clerkClient = getClerkClient();
  return clerkClient.users.getUser(clerkUserId);
}

async function updateOnboardingRole({ clerkUserId, role }) {
  const clerkClient = getClerkClient();
  const existingUser = await clerkClient.users.getUser(clerkUserId);
  const clinicianCode =
    role === "clinician"
      ? existingUser?.publicMetadata?.clinicianCode ||
        existingUser?.unsafeMetadata?.clinicianCode ||
        buildClinicianCode(existingUser)
      : null;

  await clerkClient.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      ...existingUser.publicMetadata,
      role,
      onboardingComplete: true,
      clinicianCode,
    },
    unsafeMetadata: {
      ...existingUser.unsafeMetadata,
      role,
      onboardingComplete: true,
      clinicianCode,
    },
  });

  const updatedUser = await clerkClient.users.getUser(clerkUserId);
  return {
    role: resolveRole(updatedUser),
    onboardingComplete: Boolean(
      updatedUser?.publicMetadata?.onboardingComplete ||
        updatedUser?.unsafeMetadata?.onboardingComplete,
    ),
    clinicianCode:
      updatedUser?.publicMetadata?.clinicianCode ||
      updatedUser?.unsafeMetadata?.clinicianCode ||
      null,
    email: getPrimaryEmail(updatedUser),
  };
}

async function findClinicianByIdentifier(identifier) {
  const normalized = String(identifier || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const clerkClient = getClerkClient();
  let clerkUsers = [];

  if (normalized.includes("@")) {
    clerkUsers = await clerkClient.users.getUserList({
      emailAddress: [normalized],
      limit: 10,
    });
  } else if (normalized.startsWith("user_")) {
    try {
      const user = await clerkClient.users.getUser(normalized);
      clerkUsers = user ? [user] : [];
    } catch (error) {
      clerkUsers = [];
    }
  } else {
    clerkUsers = await clerkClient.users.getUserList({
      limit: 500,
    });
  }

  const clinician = clerkUsers.find((user) => {
    const role = resolveRole(user);
    const clinicianCode =
      String(user?.publicMetadata?.clinicianCode || user?.unsafeMetadata?.clinicianCode || "")
        .trim()
        .toLowerCase();
    const email = String(getPrimaryEmail(user) || "").trim().toLowerCase();

    return role === "clinician" && (
      user.id.toLowerCase() === normalized ||
      email === normalized ||
      clinicianCode === normalized
    );
  });

  if (!clinician) {
    return null;
  }

  return {
    clerkUserId: clinician.id,
    email: getPrimaryEmail(clinician),
    displayName:
      clinician.fullName ||
      [clinician.firstName, clinician.lastName].filter(Boolean).join(" ") ||
      getPrimaryEmail(clinician) ||
      clinician.id,
    clinicianCode:
      clinician?.publicMetadata?.clinicianCode ||
      clinician?.unsafeMetadata?.clinicianCode ||
      null,
  };
}

module.exports = {
  buildClinicianCode,
  findClinicianByIdentifier,
  getClerkUser,
  getPrimaryEmail,
  resolveRole,
  updateOnboardingRole,
};
