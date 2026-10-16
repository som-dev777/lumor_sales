// Login rules shared by the browser and the server (no server-only imports here).
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const ACCESS_DISABLED_MESSAGE = "Access disabled, contact your admin";

/** Anyone with an email at this domain may sign up themselves, as a User (D-012). */
export const SIGNUP_EMAIL_DOMAIN = "lumor.tech";

/**
 * These people are Admins by default (D-013). `npm run seed:admin` creates their accounts;
 * they can't be claimed through the public sign-up page.
 */
export const DEFAULT_ADMIN_EMAILS = [
  "somnath@lumor.tech",
  "arijeet@lumor.tech",
  "prince@lumor.tech",
] as const;

export function isDefaultAdminEmail(email: string): boolean {
  return (DEFAULT_ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

export function isSignupDomain(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${SIGNUP_EMAIL_DOMAIN}`);
}
