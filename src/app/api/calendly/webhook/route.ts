// POST /api/calendly/webhook (F27, D-043): Calendly calls this when someone books or cancels.
// No login: Calendly's signature (CALENDLY_WEBHOOK_SIGNING_KEY) is the only way in, and
// without the key set the address stays closed.
import { getDb } from "@/lib/db/client";
import { calendlySchema, handleCalendly, verifyCalendlySignature } from "@/server/calendly";

export async function POST(request: Request) {
  const body = await request.text();
  const ok = verifyCalendlySignature(
    request.headers.get("calendly-webhook-signature"),
    body,
    process.env.CALENDLY_WEBHOOK_SIGNING_KEY,
  );
  if (!ok) return new Response("Not allowed", { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  const parsed = calendlySchema.safeParse(json);
  // Events the Sales Hub doesn't use (or can't read) are acknowledged, so Calendly stops retrying.
  if (!parsed.success) return Response.json({ result: "ignored" });
  try {
    return Response.json({ result: await handleCalendly(getDb(), parsed.data) });
  } catch (e) {
    console.error("Calendly webhook failed:", e instanceof Error ? e.message : e);
    return new Response("Couldn't handle it", { status: 500 });
  }
}
