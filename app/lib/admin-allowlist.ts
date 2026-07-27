import "server-only";

function normalizeEmail(email: string) {
  return email
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .toLowerCase();
}

const configuredEmails =
  process.env.FIREBASE_ADMIN_EMAILS ?? "";

const allowedAdminEmails = new Set(
  configuredEmails
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
);

export function hasConfiguredAdminEmails() {
  return allowedAdminEmails.size > 0;
}

export function isAllowedAdminEmail(
  email: string | null | undefined
) {
  if (!email) {
    return false;
  }

  return allowedAdminEmails.has(
    normalizeEmail(email)
  );
}
