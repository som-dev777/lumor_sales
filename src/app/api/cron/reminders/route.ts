// POST /api/cron/reminders: emails the booking reminders that are due, 24 hours and 1 hour
// before (F22 round 3, D-043). Called every 15 minutes by netlify/functions/report-schedules.mts
// with "Authorization: Bearer CRON_SECRET". No login: the secret is the only way in.
import { getDb } from "@/lib/db/client";
import { cronAuthorised } from "@/lib/cron-auth";
import { sendDueReminders } from "@/server/calendar";

export async function POST(request: Request) {
  if (!cronAuthorised(request)) return new Response("Not allowed", { status: 401 });
  return Response.json(await sendDueReminders(getDb(), new Date()));
}
