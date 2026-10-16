import { createHash, randomBytes } from "node:crypto";

/** A long random secret for a link (invite or password reset). URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What we store instead of the secret itself: if the database leaks, the links don't. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Emails are compared and stored in lower case, without surrounding spaces. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The app's public address, e.g. http://localhost:3000 (no trailing slash). */
export function appUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
