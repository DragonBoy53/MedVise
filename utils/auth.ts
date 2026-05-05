export function getAppRole(user: any): string | null {
  return (
    (user?.publicMetadata?.role as string | undefined) ||
    (user?.unsafeMetadata?.role as string | undefined) ||
    null
  );
}

export function isOnboardingComplete(user: any): boolean {
  const explicit =
    user?.publicMetadata?.onboardingComplete ??
    user?.unsafeMetadata?.onboardingComplete;

  if (typeof explicit === "boolean") {
    return explicit;
  }

  return Boolean(getAppRole(user));
}

export function getClinicianCode(user: any): string | null {
  return (
    (user?.publicMetadata?.clinicianCode as string | undefined) ||
    (user?.unsafeMetadata?.clinicianCode as string | undefined) ||
    null
  );
}
