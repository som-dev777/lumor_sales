// GET /api/google/connect: sends the signed-in rep to Google to connect their calendar (F26).
// A one-time state code in a cookie stops anyone else finishing the sign-in for them.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { appUrl, generateToken } from "@/lib/tokens";
import { googleAuthUrl, googleConfigured } from "@/server/google/google";

const GOOGLE_STATE_COOKIE = "lumor_google_state";

export async function GET() {
  const viewer = await requireUser();
  if (!googleConfigured()) {
    return NextResponse.redirect(`${appUrl()}/calendar/availability?google=not-set-up`);
  }
  const state = generateToken();
  (await cookies()).set(GOOGLE_STATE_COOKIE, `${state}.${viewer.id}`, {
    httpOnly: true,
    secure: appUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthUrl(state, viewer.email));
}
