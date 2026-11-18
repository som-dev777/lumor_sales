// LinkedIn emails from the rep's Gmail (F30, D-066). LinkedIn emails the rep when someone accepts
// a connection request and when someone messages them. With the rep's permission (gmail.readonly)
// Sales Hub reads only those emails, finds the person by the profile link in the email, and logs
// the acceptance or the reply exactly as the buttons do (through the plan and the conversation).
// It never opens LinkedIn and never sends or changes anything in Gmail. Each email is read once.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { LINKEDIN_EMAIL_KINDS, LINKEDIN_EMAIL_RESULTS } from "@/lib/db/enums";
import { activity, googleConnection, linkedinEmail, person } from "@/lib/db/schema";
import { assertCan, PermissionError, type Actor } from "@/lib/permissions";
import { addEntryTx, isDuplicate, threadOf } from "../conversation";
import { LeadError } from "../leads/companies";
import { logWithPlanTx } from "../plans/enrolment";
import { accessToken, canReadGmail, googleConfigured } from "./google";

type Kind = (typeof LINKEDIN_EMAIL_KINDS)[number];
type Result = (typeof LINKEDIN_EMAIL_RESULTS)[number];

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT = 15_000;
/** Emails read in one run (the next run carries on). */
export const MAX_PER_RUN = 30;
/** How far back the first check looks. */
const FIRST_DAYS = 7;
const DAY = 24 * 3600_000;

// --- Reading one email ---------------------------------------------------------------------------

export type MailIn = { id: string; from: string; subject: string; date: Date; text: string };

export type ParsedMail = {
  kind: Kind;
  /** The person's name, as LinkedIn wrote it. */
  name: string | null;
  /** Profile names from linkedin.com/in/… links in the email (lowercased). */
  slugs: string[];
  /** A message's text (Message only). */
  text: string | null;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Neha Sharma via LinkedIn <messages-noreply@linkedin.com>" → name and address. */
export function splitFrom(from: string): { name: string | null; address: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const address = (m ? m[2] : from).trim().toLowerCase();
  let name = m ? clean(m[1]) : "";
  name = name.replace(/\s+via linkedin$/i, "").trim();
  if (!name || /^linkedin( sales navigator)?$/i.test(name)) return { name: null, address };
  return { name, address };
}

/** Profile names in linkedin.com/in/… and linkedin.com/comm/in/… links. */
export function profileSlugs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/linkedin\.com\/(?:comm\/)?in\/([A-Za-z0-9\-_%.]+)/gi)) {
    let slug = m[1].replace(/[.]+$/, "");
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // Keep as written.
    }
    if (slug) out.add(slug.toLowerCase());
  }
  return [...out];
}

const STOP =
  /^(reply|view (message|conversation|profile|.*'s profile)|respond|see (all|more|message)|unsubscribe|help|you are receiving|you're receiving|this email was|learn why|©|linkedin corporation|to unsubscribe|manage your|message sent|accept|ignore)/i;

/**
 * The message from LinkedIn's email: the text after the sender's name block (their name and
 * headline) up to the Reply / View message links. LinkedIn can shorten long messages.
 */
export function messageText(body: string, name: string | null): string | null {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const hasUrl = (l: string) => /https?:\/\/|www\./i.test(l);
  let start = 0;
  if (name) {
    const i = lines.findIndex((l) => l.toLowerCase() === name.toLowerCase());
    if (i >= 0) {
      // Skip the name block: the name, the headline and any link, up to the first blank line.
      start = i + 1;
      while (start < lines.length && lines[start] !== "") start++;
    }
  }
  const pick = (from: number) => {
    const got: string[] = [];
    for (let i = from; i < lines.length; i++) {
      const l = lines[i];
      if (STOP.test(l) || (hasUrl(l) && got.length > 0)) break;
      if (hasUrl(l)) continue;
      if (l === "" && got.length === 0) continue;
      got.push(l);
    }
    return got.join("\n").trim();
  };
  let text = pick(start);
  if (!text) {
    // No name block found: the longest paragraph without links.
    const paras = body
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p && !hasUrl(p) && !STOP.test(p));
    text = paras.sort((a, b) => b.length - a.length)[0] ?? "";
  }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, 4000) : null;
}

const ACCEPTED = /accepted your invitation/i;
const DIGEST = /\b\d+\s+(new|unread)\s+messages?\b|messages? (are )?waiting|unread messages/i;
const MESSAGE =
  /new message|messaged you|sent you (a |an )?(new )?(message|inmail)|replied to your|inmail|^re:/i;

/** What a LinkedIn email is about (Other: skipped). */
export function parseLinkedInEmail(m: MailIn): ParsedMail {
  const from = splitFrom(m.from);
  const other: ParsedMail = { kind: "Other", name: from.name, slugs: [], text: null };
  if (!/(^|[.@])linkedin\.com$/.test(from.address.split("@")[1] ?? "")) return other;
  const subject = clean(m.subject);
  const slugs = profileSlugs(m.text);

  if (ACCEPTED.test(subject) || (ACCEPTED.test(m.text) && /invitation/i.test(subject))) {
    const s = /^(?:[^,]+,\s+)?(.+?)\s+(?:has\s+|just\s+)?accepted your invitation/i.exec(subject);
    return { kind: "Accepted", name: s ? clean(s[1]) : from.name, slugs, text: null };
  }
  if (DIGEST.test(subject)) return other;
  if (MESSAGE.test(subject) || /messages?-noreply|inmail|hit-reply/.test(from.address)) {
    const s =
      /new message from (.+)$/i.exec(subject) ??
      /^(.+?)\s+(?:just\s+)?(?:messaged you|sent you|replied to your)/i.exec(subject);
    const name = from.name ?? (s ? clean(s[1]) : null);
    return { kind: "Message", name, slugs, text: messageText(m.text, name) };
  }
  return other;
}

// --- Gmail ---------------------------------------------------------------------------------------

const gmailJson = async (token: string, path: string) => {
  const res = await fetch(`${GMAIL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
};

type Part = {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: Part[];
};

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

const htmlToText = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>/gi, " $1 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

/** The email's plain text (or its HTML turned into text). */
export function bodyText(part: Part): string {
  const find = (p: Part, type: string): string | null => {
    if (p.mimeType === type && p.body?.data) return decode(p.body.data);
    for (const c of p.parts ?? []) {
      const got = find(c, type);
      if (got) return got;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  if (plain) return plain;
  const html = find(part, "text/html");
  return html ? htmlToText(html) : "";
}

/** What went wrong with Gmail, in plain words. */
export const GMAIL_PROBLEMS = {
  notConnected: "Gmail isn't connected. Click Connect Gmail.",
  permission:
    "Sales Hub doesn't have permission to read your Gmail. Click Connect Gmail again and allow it.",
  apiOff:
    "The Gmail API is switched off in your Google Cloud project. The owner turns it on once: console.cloud.google.com → APIs & Services → Library → Gmail API → Enable (docs/deploy.md).",
  unreachable: "Gmail couldn't be reached. Try Check now again in a minute.",
};

function gmailProblem(status: number, body: Record<string, unknown>) {
  const err = (body.error ?? {}) as { message?: string; details?: { reason?: string }[] };
  const reasons = (err.details ?? []).map((d) => d.reason ?? "");
  const message = String(err.message ?? "");
  if (reasons.includes("SERVICE_DISABLED") || /has not been used|is disabled/i.test(message)) {
    return GMAIL_PROBLEMS.apiOff;
  }
  if (status === 401 || status === 403) return GMAIL_PROBLEMS.permission;
  return GMAIL_PROBLEMS.unreachable;
}

// --- Logging -------------------------------------------------------------------------------------

type Target = { id: string; fullName: string };

/** The rep's own person the email is about: by profile link, else by a unique full name. */
async function findPerson(db: DbOrTx, actor: Actor, p: ParsedMail): Promise<Target | null> {
  if (p.slugs.length > 0) {
    const rows = await db
      .select({ id: person.id, fullName: person.fullName })
      .from(person)
      .where(
        and(
          eq(person.ownerId, actor.id),
          inArray(
            person.linkedinUrlNormalised,
            p.slugs.map((s) => `linkedin.com/in/${s}`),
          ),
        ),
      )
      .limit(1);
    if (rows[0]) return rows[0];
  }
  if (p.name && /\s/.test(p.name)) {
    const rows = await db
      .select({ id: person.id, fullName: person.fullName })
      .from(person)
      .where(
        and(
          eq(person.ownerId, actor.id),
          sql`lower(trim(${person.fullName})) = ${p.name.toLowerCase()}`,
        ),
      )
      .limit(2);
    if (rows.length === 1) return rows[0];
  }
  return null;
}

/** Their latest connection-request event (sent, accepted or withdrawn), if any. */
async function lastRequestEvent(tx: DbOrTx, personId: string) {
  const [row] = await tx
    .select({ type: activity.type })
    .from(activity)
    .where(
      and(
        eq(activity.personId, personId),
        inArray(activity.type, ["Request sent", "Request accepted", "Request withdrawn"]),
      ),
    )
    .orderBy(desc(activity.occurredAt), desc(activity.createdAt))
    .limit(1);
  return row?.type ?? null;
}

/** Logs what the email says, then records the email (audited), in one transaction. */
async function handleEmail(
  db: Db,
  actor: Actor,
  m: MailIn,
  p: ParsedMail,
  now: Date,
): Promise<Result> {
  const at = m.date.getTime() > now.getTime() ? now : m.date;
  const record = async (
    tx: DbOrTx,
    result: Result,
    target: Target | null,
    activityId: string | null,
  ) => {
    const [row] = await tx
      .insert(linkedinEmail)
      .values({
        userId: actor.id,
        createdBy: actor.id,
        gmailId: m.id,
        kind: p.kind,
        fromName: p.name,
        subject: clean(m.subject).slice(0, 300) || "(no subject)",
        receivedAt: m.date,
        personId: target?.id ?? null,
        activityId,
        result,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "LinkedIn email",
      recordId: row.id,
      recordName: row.subject,
      action: "Created",
      after: {
        kind: row.kind,
        from: row.fromName,
        result,
        person: target?.fullName ?? null,
        via: "Gmail",
      },
    });
    return result;
  };

  if (p.kind === "Other") return db.transaction((tx) => record(tx, "Skipped", null, null));
  const target = await findPerson(db, actor, p);
  if (!target) return db.transaction((tx) => record(tx, "Not matched", null, null));

  try {
    return await db.transaction(async (tx) => {
      if (p.kind === "Accepted") {
        if ((await lastRequestEvent(tx, target.id)) === "Request accepted") {
          return record(tx, "Already logged", target, null);
        }
        const done = await logWithPlanTx(tx, actor, target.id, { action: "accepted" }, { now: at });
        return record(tx, "Logged", target, done.activity?.id ?? null);
      }
      const text = p.text?.trim();
      if (!text) return record(tx, "Skipped", target, null);
      const thread = await threadOf(tx, target.id);
      if (isDuplicate(thread, "them", text)) return record(tx, "Already logged", target, null);
      const row = await addEntryTx(
        tx,
        actor,
        target.id,
        { from: "them", channel: "LinkedIn", at, text, replyType: null },
        { now },
      );
      return record(tx, "Logged", target, row?.id ?? null);
    });
  } catch (e) {
    if (!(e instanceof LeadError || e instanceof PermissionError)) throw e;
    console.error("LinkedIn email not logged:", e.message);
    return db.transaction((tx) => record(tx, "Skipped", target, null));
  }
}

// --- One rep's check -----------------------------------------------------------------------------

export type SyncResult =
  | {
      ok: true;
      read: number;
      accepted: number;
      replies: number;
      notMatched: number;
    }
  | { ok: false; problem: string };

/**
 * Reads the rep's new LinkedIn emails (since the newest one read, with a day's overlap; the first
 * time, the last 7 days), oldest first, up to MAX_PER_RUN, and logs each.
 */
export async function syncLinkedInEmails(
  db: Db,
  actor: Actor,
  now = new Date(),
): Promise<SyncResult> {
  assertCan(actor, "calendar.manage", { ownerId: actor.id });
  const [conn] = await db
    .select({ scope: googleConnection.scope })
    .from(googleConnection)
    .where(eq(googleConnection.userId, actor.id));
  if (!googleConfigured() || !conn || !canReadGmail(conn.scope)) {
    return { ok: false, problem: GMAIL_PROBLEMS.notConnected };
  }
  const token = await accessToken(db, actor.id);
  if (!token) return { ok: false, problem: GMAIL_PROBLEMS.permission };

  const [newest] = await db
    .select({ at: linkedinEmail.receivedAt })
    .from(linkedinEmail)
    .where(eq(linkedinEmail.userId, actor.id))
    .orderBy(desc(linkedinEmail.receivedAt))
    .limit(1);
  const since = newest ? newest.at.getTime() - DAY : now.getTime() - FIRST_DAYS * DAY;
  const q =
    `from:linkedin.com after:${Math.floor(since / 1000)} ` +
    "{subject:accepted subject:invitation subject:message subject:messaged subject:replied subject:InMail}";

  try {
    const list = await gmailJson(token, `/messages?maxResults=100&q=${encodeURIComponent(q)}`);
    if (!list.ok) return { ok: false, problem: gmailProblem(list.status, list.body) };
    const ids = ((list.body.messages as { id: string }[] | undefined) ?? []).map((x) => x.id);
    const seen = new Set(
      ids.length
        ? (
            await db
              .select({ id: linkedinEmail.gmailId })
              .from(linkedinEmail)
              .where(and(eq(linkedinEmail.userId, actor.id), inArray(linkedinEmail.gmailId, ids)))
          ).map((r) => r.id)
        : [],
    );
    // Gmail lists the newest first: read the oldest new ones first.
    const fresh = ids
      .filter((id) => !seen.has(id))
      .reverse()
      .slice(0, MAX_PER_RUN);

    const mails: MailIn[] = [];
    for (const id of fresh) {
      const got = await gmailJson(token, `/messages/${encodeURIComponent(id)}?format=full`);
      if (!got.ok) return { ok: false, problem: gmailProblem(got.status, got.body) };
      const payload = (got.body.payload ?? {}) as Part;
      const header = (name: string) =>
        payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
      const ms = Number(got.body.internalDate);
      mails.push({
        id,
        from: header("from"),
        subject: header("subject"),
        date: Number.isFinite(ms) && ms > 0 ? new Date(ms) : now,
        text: bodyText(payload),
      });
    }
    mails.sort((a, b) => a.date.getTime() - b.date.getTime());

    const out = { ok: true as const, read: 0, accepted: 0, replies: 0, notMatched: 0 };
    for (const m of mails) {
      const parsed = parseLinkedInEmail(m);
      const result = await handleEmail(db, actor, m, parsed, now);
      out.read += 1;
      if (result === "Logged" && parsed.kind === "Accepted") out.accepted += 1;
      if (result === "Logged" && parsed.kind === "Message") out.replies += 1;
      if (result === "Not matched") out.notMatched += 1;
    }
    return out;
  } catch (e) {
    console.error("Reading LinkedIn emails failed:", e instanceof Error ? e.message : e);
    return { ok: false, problem: GMAIL_PROBLEMS.unreachable };
  }
}

// --- The panel ------------------------------------------------------------------------------------

export type LinkedInEmailRow = {
  id: string;
  kind: Kind;
  fromName: string | null;
  subject: string;
  receivedAt: Date;
  result: Result;
  personId: string | null;
  personName: string | null;
};

/** The rep's latest LinkedIn emails read, with what happened. */
export async function recentLinkedInEmails(
  db: DbOrTx,
  userId: string,
  limit = 10,
): Promise<LinkedInEmailRow[]> {
  return db
    .select({
      id: linkedinEmail.id,
      kind: linkedinEmail.kind,
      fromName: linkedinEmail.fromName,
      subject: linkedinEmail.subject,
      receivedAt: linkedinEmail.receivedAt,
      result: linkedinEmail.result,
      personId: linkedinEmail.personId,
      personName: person.fullName,
    })
    .from(linkedinEmail)
    .leftJoin(person, eq(person.id, linkedinEmail.personId))
    .where(eq(linkedinEmail.userId, userId))
    .orderBy(desc(linkedinEmail.receivedAt), desc(linkedinEmail.createdAt))
    .limit(limit);
}

/** Everyone who connected Gmail (the scheduled check). */
export async function gmailUsers(db: DbOrTx) {
  const rows = await db
    .select({ userId: googleConnection.userId, scope: googleConnection.scope })
    .from(googleConnection);
  return rows.filter((r) => canReadGmail(r.scope)).map((r) => r.userId);
}
