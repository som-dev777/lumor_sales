/** What a Server Action sends back to its form when it doesn't redirect. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Turns Zod issues into one message per field, for showing under each input. */
export function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** The readable message inside an error thrown by Better Auth (or any Error). */
export function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object") {
    const body = (e as { body?: { message?: unknown } }).body;
    if (body && typeof body.message === "string" && body.message) return body.message;
    if (e instanceof Error && e.message) return e.message;
  }
  return fallback;
}
