// POST /api/cron/linkedin-emails: reads each rep's new LinkedIn emails from Gmail and logs the
// acceptances and replies (F30, D-066). Called every 15 minutes by
// netlify/functions/report-schedules.mts with "Authorization: Bearer CRON_SECRET". No login: the
// secret is the only way in. Each rep's emails are logged as that rep.
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { cronAuthorised } from "@/lib/cron-auth";
import { gmailUsers, syncLinkedInEmails } from "@/server/google/linkedin-mail";

export async function POST(request: Request) {
  if (!cronAuthorised(request)) return new Response("Not allowed", { status: 401 });
  const db = getDb();
  const ids = await gmailUsers(db);
  const reps = ids.length
    ? await db
        .select({ id: user.id, role: user.role, active: user.active })
        .from(user)
        .where(inArray(user.id, ids))
    : [];
  const now = new Date();
  let read = 0;
  let problems = 0;
  for (const rep of reps.filter((r) => r.active)) {
    try {
      const r = await syncLinkedInEmails(db, rep, now);
      if (r.ok) read += r.read;
      else problems += 1;
    } catch (e) {
      problems += 1;
      console.error("LinkedIn emails failed for a rep:", e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ reps: reps.length, read, problems });
}
