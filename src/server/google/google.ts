// Google Calendar and Meet links (F26, D-042). Each rep connects their own Google account
// (OAuth). The app then creates, moves and cancels one Google Calendar event per booking, with
// a Meet link, and reads the rep's busy times. Google never blocks a booking: every call here
// reports failure instead of throwing, except the connect/disconnect changes themselves.
import { emailConfigured } from "../email";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { googleConnection } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { appUrl } from "@/lib/tokens";
import { decryptSecret, encryptSecret } from "./crypto";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  // To make each Meet open, so people join without waiting to be let in (D-052).
  "https://www.googleapis.com/auth/meetings.space.settings",
];

/** True when the rep's connection allows opening the Meet (connected after D-052). */
export const canOpenMeet = (scope: string | null | undefined) =>
  Boolean(scope?.includes("meetings.space.settings"));

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT = 15_000;

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export const googleRedirectUri = () => `${appUrl()}/api/google/callback`;

/** Google's sign-in page for connecting the calendar. */
export function googleAuthUrl(state: string, loginHint?: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!.trim());
  u.searchParams.set("redirect_uri", googleRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  if (loginHint) u.searchParams.set("login_hint", loginHint);
  return u.toString();
}

const fetchJson = async (url: string, init: RequestInit) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
};

/** The email inside Google's id_token (it comes straight from Google over TLS). */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Swaps the sign-in code for a refresh token. Throws a readable message on failure. */
export async function exchangeCode(code: string) {
  const r = await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) throw new Error("Google didn't accept the sign-in. Please try again.");
  const refreshToken = r.body.refresh_token;
  const scope = String(r.body.scope ?? "");
  const email = emailFromIdToken(r.body.id_token);
  if (typeof refreshToken !== "string" || !email) {
    throw new Error("Google didn't give calendar access. Please try again and allow it.");
  }
  if (!scope.includes("calendar.events")) {
    throw new Error("Please tick “See, edit, share and delete… events” on Google's screen.");
  }
  return { refreshToken, scope, email };
}

export type GoogleConnectionView = {
  email: string;
  lastError: string | null;
  /** False for a connection made before D-052: reconnect so the Meet opens for everyone. */
  opensMeet: boolean;
};

export async function connectionView(
  db: DbOrTx,
  userId: string,
): Promise<GoogleConnectionView | null> {
  const [row] = await db
    .select({
      email: googleConnection.googleEmail,
      lastError: googleConnection.lastError,
      scope: googleConnection.scope,
    })
    .from(googleConnection)
    .where(eq(googleConnection.userId, userId));
  return row
    ? { email: row.email, lastError: row.lastError, opensMeet: canOpenMeet(row.scope) }
    : null;
}

/** Saves (or replaces) the rep's connection. Audited without the token. */
export async function saveConnection(
  db: Db,
  actor: Actor,
  data: { email: string; refreshToken: string; scope: string },
) {
  assertCan(actor, "calendar.manage", { ownerId: actor.id });
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(googleConnection)
      .where(eq(googleConnection.userId, actor.id));
    const values = {
      googleEmail: data.email,
      refreshTokenEnc: encryptSecret(data.refreshToken),
      scope: data.scope,
      lastError: null,
    };
    const [row] = before
      ? await tx
          .update(googleConnection)
          .set(values)
          .where(eq(googleConnection.id, before.id))
          .returning()
      : await tx
          .insert(googleConnection)
          .values({ ...values, userId: actor.id, createdBy: actor.id })
          .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Google connection",
      recordId: row.id,
      recordName: data.email,
      action: before ? "Updated" : "Created",
      before: before ? { googleEmail: before.googleEmail } : undefined,
      after: { googleEmail: row.googleEmail, scope: row.scope },
    });
    return row;
  });
}

/** Disconnects: revokes the token at Google (best effort) and deletes it. */
export async function disconnectGoogle(db: Db, actor: Actor, userId: string) {
  assertCan(actor, "calendar.manage", { ownerId: userId });
  const [row] = await db.select().from(googleConnection).where(eq(googleConnection.userId, userId));
  if (!row) return false;
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(row.refreshTokenEnc))}`,
      { method: "POST", signal: AbortSignal.timeout(TIMEOUT) },
    );
  } catch {
    // Deleting our copy is what matters; Google also expires unused tokens.
  }
  await db.transaction(async (tx) => {
    await tx.delete(googleConnection).where(eq(googleConnection.id, row.id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Google connection",
      recordId: row.id,
      recordName: row.googleEmail,
      action: "Deleted",
      before: { googleEmail: row.googleEmail },
    });
  });
  return true;
}

/** A fresh access token for the rep, or null (not connected, or Google refused). */
async function accessToken(db: Db, userId: string): Promise<string | null> {
  if (!googleConfigured()) return null;
  const [row] = await db.select().from(googleConnection).where(eq(googleConnection.userId, userId));
  if (!row) return null;
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(row.refreshTokenEnc);
  } catch {
    await recordError(db, row, "Google access needs reconnecting.");
    return null;
  }
  try {
    const r = await fetchJson(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!r.ok) {
      if (r.body.error === "invalid_grant") {
        await recordError(db, row, "Google access was removed or expired. Reconnect Google.");
      }
      return null;
    }
    if (row.lastError) await recordError(db, row, null);
    return typeof r.body.access_token === "string" ? r.body.access_token : null;
  } catch (e) {
    console.error("Google token refresh failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function recordError(
  db: Db,
  row: typeof googleConnection.$inferSelect,
  lastError: string | null,
) {
  await db.transaction(async (tx) => {
    await tx.update(googleConnection).set({ lastError }).where(eq(googleConnection.id, row.id));
    await writeAudit(tx, {
      userId: row.userId,
      entityType: "Google connection",
      recordId: row.id,
      recordName: row.googleEmail,
      action: "Updated",
      before: { lastError: row.lastError },
      after: { lastError, via: "Google" },
    });
  });
}

export type GoogleEvent = {
  title: string;
  description: string;
  start: Date;
  end: Date;
  location: string | null;
  attendees: { email: string; name: string }[];
  meet: boolean;
};

const eventBody = (e: GoogleEvent, requestId: string) => ({
  summary: e.title,
  description: e.description,
  start: { dateTime: e.start.toISOString() },
  end: { dateTime: e.end.toISOString() },
  ...(e.location && !e.meet ? { location: e.location } : {}),
  attendees: e.attendees.map((a) => ({ email: a.email, displayName: a.name })),
  guestsCanModify: false,
  ...(e.meet
    ? {
        conferenceData: {
          createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      }
    : {}),
});

function meetLinkOf(body: Record<string, unknown>): string | null {
  if (typeof body.hangoutLink === "string") return body.hangoutLink;
  const points = (
    body.conferenceData as { entryPoints?: { entryPointType: string; uri: string }[] }
  )?.entryPoints;
  return points?.find((p) => p.entryPointType === "video")?.uri ?? null;
}

export type GoogleResult = { ok: true; eventId: string; meetLink: string | null } | { ok: false };

/** Creates the event (Google emails the invite). Null result when not connected. */
/**
 * Who emails the guests (D-047, D-049): when the app can send email, Lumor's own emails carry the
 * invite and Google stays quiet; when it can't, Google sends its invite, so the person who booked
 * always hears something.
 */
const googleEmails = () => (emailConfigured() ? "none" : "all");

export async function createGoogleEvent(
  db: Db,
  hostId: string,
  e: GoogleEvent,
  requestId: string,
): Promise<GoogleResult | null> {
  const token = await accessToken(db, hostId);
  if (!token) return (await connectionView(db, hostId)) ? { ok: false } : null;
  try {
    const r = await fetchJson(
      `${API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${googleEmails()}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody(e, requestId)),
      },
    );
    if (!r.ok || typeof r.body.id !== "string") {
      console.error(`Google event create failed: ${r.status}`);
      return { ok: false };
    }
    let body = r.body;
    // Google sometimes makes the Meet link a moment later: wait for it (up to about 9 seconds),
    // so every email carries this event's one link (D-050).
    for (let i = 0; i < 6 && e.meet && !meetLinkOf(body); i++) {
      await new Promise((ok) => setTimeout(ok, i === 0 ? 1000 : 1500));
      const again = await fetchJson(`${API}/calendars/primary/events/${body.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (again.ok) body = again.body;
    }
    const meetLink = meetLinkOf(body);
    if (meetLink) await openMeet(db, hostId, token, meetLink);
    return { ok: true, eventId: String(body.id), meetLink };
  } catch (err) {
    console.error("Google event create failed:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

const MEET_API = "https://meet.googleapis.com/v2";

/**
 * Makes the meeting open (D-052): anyone with the link joins straight away, instead of waiting
 * for the host to let them in. Google only lets people in without asking when they're signed in
 * with the exact invited address, so the person who booked often sat in the lobby (and thought
 * it was a different meeting). Needs the Meet permission from a connection made after D-052 and
 * the Google Meet REST API switched on; if either is missing, the meeting still works as before.
 */
async function openMeet(db: Db, hostId: string, token: string, link: string): Promise<boolean> {
  const [row] = await db
    .select({ scope: googleConnection.scope })
    .from(googleConnection)
    .where(eq(googleConnection.userId, hostId));
  if (!canOpenMeet(row?.scope)) return false;
  const code = link.match(/meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/)?.[1];
  if (!code) return false;
  try {
    const space = await fetchJson(`${MEET_API}/spaces/${code}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!space.ok || typeof space.body.name !== "string") {
      console.error(`Google Meet space lookup failed: ${space.status}`);
      return false;
    }
    const r = await fetchJson(`${MEET_API}/${space.body.name}?updateMask=config.accessType`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ config: { accessType: "OPEN" } }),
    });
    if (!r.ok) console.error(`Opening the Google Meet failed: ${r.status}`);
    return r.ok;
  } catch (err) {
    console.error("Opening the Google Meet failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Changes an event (new time or attendees). Google emails the update. */
export async function updateGoogleEvent(
  db: Db,
  hostId: string,
  eventId: string,
  change: { start?: Date; end?: Date; attendees?: { email: string; name: string }[] },
): Promise<boolean> {
  const token = await accessToken(db, hostId);
  if (!token) return false;
  try {
    const r = await fetchJson(
      `${API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=${googleEmails()}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(change.start ? { start: { dateTime: change.start.toISOString() } } : {}),
          ...(change.end ? { end: { dateTime: change.end.toISOString() } } : {}),
          ...(change.attendees
            ? { attendees: change.attendees.map((a) => ({ email: a.email, displayName: a.name })) }
            : {}),
        }),
      },
    );
    if (!r.ok) console.error(`Google event update failed: ${r.status}`);
    return r.ok;
  } catch (err) {
    console.error("Google event update failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Cancels an event (Google emails the cancellation). Already gone counts as done. */
export async function deleteGoogleEvent(db: Db, hostId: string, eventId: string) {
  const token = await accessToken(db, hostId);
  if (!token) return false;
  try {
    const res = await fetch(
      `${API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=${googleEmails()}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );
    return res.ok || res.status === 404 || res.status === 410;
  } catch (err) {
    console.error("Google event delete failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** The rep's busy times in Google Calendar (primary). Empty when unknown. */
export async function googleBusy(
  db: Db,
  userId: string,
  from: Date,
  to: Date,
): Promise<{ start: Date; end: Date }[]> {
  return (await googleBusyCheck(db, userId, from, to)).busy;
}

/**
 * The rep's Google busy times, and whether Google answered (D-045): null = not connected,
 * false = Google couldn't be read (the slots then ignore Google), true = read.
 */
export async function googleBusyCheck(
  db: Db,
  userId: string,
  from: Date,
  to: Date,
): Promise<{ ok: boolean | null; busy: { start: Date; end: Date }[] }> {
  const token = await accessToken(db, userId);
  if (!token) return { ok: (await connectionView(db, userId)) ? false : null, busy: [] };
  try {
    const r = await fetchJson(`${API}/freeBusy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    const busy = (r.body.calendars as { primary?: { busy?: { start: string; end: string }[] } })
      ?.primary?.busy;
    if (!r.ok || !Array.isArray(busy)) return { ok: false, busy: [] };
    return {
      ok: true,
      busy: busy
        .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
        .filter((b) => !Number.isNaN(b.start.getTime()) && b.end > b.start),
    };
  } catch (err) {
    console.error("Google busy check failed:", err instanceof Error ? err.message : err);
    return { ok: false, busy: [] };
  }
}
