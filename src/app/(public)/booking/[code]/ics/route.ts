// GET /booking/{code}/ics → the booking's calendar file (F22). Anyone with the private code.
import { getDb } from "@/lib/db/client";
import { bookingIcs, findByToken } from "@/server/calendar";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await findByToken(getDb(), code);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(bookingIcs(found.booking, found.page), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lumor-meeting.ics"',
      "Cache-Control": "no-store",
    },
  });
}
