// POST /api/cron/reports: runs the report schedules that are due (F19, D-039). Called every 15
// minutes by netlify/functions/report-schedules.mts with "Authorization: Bearer CRON_SECRET".
// No login: the secret is the only way in, and without one set the route stays closed.
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { runDueSchedules } from "@/server/report-schedules";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorised(request)) return new Response("Not allowed", { status: 401 });
  const results = await runDueSchedules(getDb(), new Date());
  return Response.json({ ran: results });
}
