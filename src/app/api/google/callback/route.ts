// GET /api/google/callback: Google sends the rep back here after they allow access (F26).
// Checks the state cookie and the signed-in rep, then saves the encrypted token (audited).
// A Gmail connection (D-066) goes back to the follow-up sprint instead.
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { appUrl } from "@/lib/tokens";
import { openUpcomingMeets } from "@/server/calendar";
import {
  canOpenMeet,
  canReadGmail,
  exchangeCode,
  googleConfigured,
  saveConnection,
} from "@/server/google/google";

const COOKIE = "lumor_google_state";
const backTo = (gmail: boolean, result: string) =>
  NextResponse.redirect(
    gmail
      ? `${appUrl()}/sprint?kind=follow&gmail=${result}`
      : `${appUrl()}/calendar/availability?google=${result}`,
  );

export async function GET(request: NextRequest) {
  const viewer = await requireUser();
  const jar = await cookies();
  const saved = jar.get(COOKIE)?.value ?? "";
  jar.delete({ name: COOKIE, path: "/api/google" });
  const [savedState, savedUser, flag] = saved.split(".");
  const gmail = flag === "gmail";
  const back = (result: string) => backTo(gmail, result);
  if (!googleConfigured()) return back("not-set-up");
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("cancelled");
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  const same =
    state.length > 0 &&
    savedState?.length === state.length &&
    timingSafeEqual(Buffer.from(savedState), Buffer.from(state));
  if (!same || savedUser !== viewer.id || !code) return back("failed");
  try {
    const data = await exchangeCode(code);
    await saveConnection(getDb(), viewer, data);
    // Meetings booked before the Meet permission was given are opened now (D-053).
    if (canOpenMeet(data.scope)) {
      await openUpcomingMeets(getDb(), viewer).catch((e) =>
        console.error("Opening upcoming Meets failed:", e instanceof Error ? e.message : e),
      );
    }
    if (gmail && !canReadGmail(data.scope)) return back("missing");
    return back("connected");
  } catch (e) {
    console.error("Google connect failed:", e instanceof Error ? e.message : e);
    return back("failed");
  }
}
