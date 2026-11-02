// The scheduled jobs' key (F19, D-039; reminders D-043): "Authorization: Bearer CRON_SECRET".
// Without a secret of 16+ characters set, the job routes stay closed.
import { timingSafeEqual } from "node:crypto";

export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
