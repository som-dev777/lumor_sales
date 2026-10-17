// "Now" for plan dates (F17), with a test-only date switch (D-033 F10): when the database is
// the local file, a cookie can pretend today is another date, so late steps and weekends can
// be checked without waiting. It refuses to work with any other database (never production).
import { cookies } from "next/headers";
import { isIstDate } from "./time";

export const TEST_DATE_COOKIE = "lumor-test-date";

/** The test date switch only works against the local database file. */
export function testDateAllowed(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}

/** Noon IST on a plain date. */
export function noonIst(date: string): Date {
  return new Date(`${date}T06:30:00Z`);
}

/** The test date in use, or null. */
export async function testDate(): Promise<string | null> {
  if (!testDateAllowed()) return null;
  const value = (await cookies()).get(TEST_DATE_COOKIE)?.value ?? "";
  return isIstDate(value) ? value : null;
}

/** Now, or noon IST on the test date when the switch is on. */
export async function appNow(): Promise<Date> {
  const d = await testDate();
  return d ? noonIst(d) : new Date();
}
