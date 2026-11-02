// POST /api/cron/reports: runs the report schedules that are due (F19, D-039). Called every 15
// minutes by netlify/functions/report-schedules.mts with "Authorization: Bearer CRON_SECRET".
// No login: the secret is the only way in, and without one set the route stays closed.
import { getDb } from "@/lib/db/client";
import { cronAuthorised } from "@/lib/cron-auth";
import { runDueSchedules } from "@/server/report-schedules";

export async function POST(request: Request) {
  if (!cronAuthorised(request)) return new Response("Not allowed", { status: 401 });
  const results = await runDueSchedules(getDb(), new Date());
  return Response.json({ ran: results });
}
