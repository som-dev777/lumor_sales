// Fast first check on every page request: no login cookie → go to /login.
// This is only a shortcut. The real checks (valid session, active account, permissions)
// happen on the server in requireUser() and assertCan().
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Pages anyone can open without being signed in. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/disabled"];
const PUBLIC_PREFIXES = ["/register/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname) || getSessionCookie(request)) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Every page except Next.js internals and files with an extension (logo, favicon…).
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
