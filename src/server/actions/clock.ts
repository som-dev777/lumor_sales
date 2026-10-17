"use server";

// The test date switch (D-033 F10): local testing only. Refuses unless the database is the
// local file, so it can never change dates in production.
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { TEST_DATE_COOKIE, testDateAllowed } from "@/lib/clock";
import { requireUser } from "@/lib/session";
import { isIstDate } from "@/lib/time";

export async function setTestDate(date: string | null): Promise<ActionResult> {
  await requireUser();
  if (!testDateAllowed()) {
    return { ok: false, error: "The test date switch only works on a local test database." };
  }
  const jar = await cookies();
  if (!date) {
    jar.delete(TEST_DATE_COOKIE);
  } else {
    if (!isIstDate(date)) return { ok: false, error: "Pick a valid date." };
    jar.set(TEST_DATE_COOKIE, date, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  refresh();
  return { ok: true, message: date ? `Pretending today is ${date}.` : "Back to the real date." };
}
