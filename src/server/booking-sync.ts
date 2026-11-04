// Booking sync (D-043): what a booked, cancelled or moved meeting does to the person, for the
// Lumor booking page (F22) and Calendly (F27) alike. Every function runs inside the caller's
// transaction, so each change and its audit entry land together.
import { stampFollowUp } from "./leads/follow-up";
import { and, asc, eq, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { DbOrTx } from "@/lib/db/client";
import type { Stage } from "@/lib/db/enums";
import { activity, company, person, user } from "@/lib/db/schema";
import { normaliseLinkedInUrl } from "@/lib/linkedin";
import type { Actor } from "@/lib/permissions";
import { formatIst, toIstDate, todayIst } from "@/lib/time";
import { personSchema } from "@/lib/validation/leads";
import { LeadError } from "./leads/companies";
import { createPersonTx, loadPerson } from "./leads/people";
import { quickLogTx } from "./leads/quicklog";
import { pausePlanTx, resumePlanTx } from "./plans/enrolment";

export type SyncSource = "Booking page" | "Calendly";
type PersonRow = typeof person.$inferSelect;

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const whenText = (d: Date) => `${formatIst(d, "EEE d MMM yyyy, h:mm aaa")} IST`;

/** Free email services: their domain says nothing about the company. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "zoho.com",
  "gmx.com",
]);

/** The company for a new person: the one given, else the email's domain (not free mail). */
export function companyFrom(given: string | null | undefined, email: string): string {
  const name = given?.trim();
  if (name) return name.slice(0, 200);
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain && !FREE_MAIL.has(domain) ? domain : "Not given";
}

/** The earliest Admin still active: owns people Calendly adds (F27). */
export async function defaultAdmin(db: DbOrTx): Promise<Actor> {
  const [a] = await db
    .select({ id: user.id, role: user.role, active: user.active })
    .from(user)
    .where(and(eq(user.role, "Admin"), eq(user.active, true)))
    .orderBy(asc(user.createdAt))
    .limit(1);
  if (!a) throw new LeadError("There's no active Admin to own new people.");
  return a;
}

/** The person a booking is about: by email, then name + company, then LinkedIn. */
export async function findPersonFor(
  tx: DbOrTx,
  b: { email: string; name: string; company?: string | null; linkedin?: string | null },
): Promise<PersonRow | null> {
  const email = b.email.trim().toLowerCase();
  if (email) {
    const [byEmail] = await tx
      .select()
      .from(person)
      .where(sql`lower(trim(${person.email})) = ${email}`)
      .orderBy(asc(person.createdAt))
      .limit(1);
    if (byEmail) return byEmail;
  }
  const companyName = b.company?.trim();
  const last = squash(b.name).split(" ").at(-1);
  if (last && companyName) {
    // Spaces and letter case don't matter, on either side.
    const candidates = await tx
      .select({ p: person, companyName: company.name })
      .from(person)
      .innerJoin(company, eq(company.id, person.companyId))
      .where(sql`lower(${person.fullName}) like ${`%${last}%`}`)
      .orderBy(asc(person.createdAt))
      .limit(100);
    const hit = candidates.find(
      (c) =>
        squash(c.p.fullName) === squash(b.name) && squash(c.companyName) === squash(companyName),
    );
    if (hit) return hit.p;
  }
  const norm = b.linkedin ? normaliseLinkedInUrl(b.linkedin) : null;
  if (norm?.ok) {
    const [byLinkedin] = await tx
      .select()
      .from(person)
      .where(eq(person.linkedinUrlNormalised, norm.normalised))
      .limit(1);
    if (byLinkedin) return byLinkedin;
  }
  return null;
}

/** The person's owner as the one making the change; the fallback when the owner has left. */
async function ownerActor(tx: DbOrTx, p: PersonRow, fallback: Actor): Promise<Actor> {
  const [o] = await tx
    .select({ id: user.id, role: user.role, active: user.active })
    .from(user)
    .where(eq(user.id, p.ownerId));
  if (o?.active) return o;
  return fallback.role === "Admin" ? fallback : defaultAdmin(tx);
}

/** A note on the person's timeline, audited. */
export async function logNoteTx(tx: DbOrTx, actor: Actor, p: PersonRow, text: string, now: Date) {
  const [row] = await tx
    .insert(activity)
    .values({
      personId: p.id,
      companyId: p.companyId,
      userId: actor.id,
      createdBy: actor.id,
      occurredAt: now,
      type: "Meeting note",
      channel: "LinkedIn",
      content: text,
    })
    .returning();
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Activity",
    recordId: row.id,
    recordName: `Note on ${p.fullName}`,
    action: "Created",
    after: { type: row.type, content: row.content, person: p.fullName },
  });
  return row;
}

export type Booked = {
  source: SyncSource;
  eventName: string;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  linkedin: string | null;
  startsAt: Date;
  /** The Meet or meeting link, or the address. */
  where: string | null;
  answers: { question: string; answer: string }[];
  /** Owns the person when there's no match: the event's rep, or the default Admin. */
  newOwner: Actor;
};

export type BookedResult = {
  personId: string;
  ownerId: string;
  created: boolean;
  planPaused: boolean;
};

/**
 * A meeting was booked. Found: Meeting booked (date, link, answers), Meeting scheduled, plan
 * paused; the meeting shows on Today that day. Not found: a new person, flagged to check.
 */
export async function syncBooked(tx: DbOrTx, b: Booked, now: Date): Promise<BookedResult> {
  let p = await findPersonFor(tx, b);
  let created = false;
  if (!p) {
    const linkedin = b.linkedin && normaliseLinkedInUrl(b.linkedin).ok ? b.linkedin : null;
    const phone = b.phone && /^[+()\d\s-]{6,30}$/.test(b.phone) ? b.phone : null;
    const row = await createPersonTx(
      tx,
      b.newOwner,
      personSchema.parse({
        fullName: b.name.trim().length >= 2 ? b.name.trim() : b.email,
        linkedinUrl: linkedin,
        companyName: companyFrom(b.company, b.email),
        email: b.email.trim().toLowerCase(),
        phone,
        stage: "Prospect",
      }),
      { via: b.source },
    );
    const reviewNote =
      b.source === "Calendly"
        ? "From Calendly: check details"
        : "From the booking page: check details";
    [p] = await tx.update(person).set({ reviewNote }).where(eq(person.id, row.id)).returning();
    await writeAudit(tx, {
      userId: b.newOwner.id,
      entityType: "Person",
      recordId: p.id,
      recordName: p.fullName,
      action: "Updated",
      before: { reviewNote: null },
      after: { reviewNote, via: b.source },
    });
    created = true;
  }
  const actor = await ownerActor(tx, p, b.newOwner);
  const details = [
    `Booked "${b.eventName}" for ${whenText(b.startsAt)} via ${b.source === "Calendly" ? "Calendly" : "the booking page"}.`,
    b.where ? `Where: ${b.where}.` : "",
    ...b.answers.filter((a) => a.answer).map((a) => `${a.question}: ${a.answer}`),
  ]
    .filter(Boolean)
    .join(" ");
  await quickLogTx(
    tx,
    actor,
    p.id,
    { action: "meetingBooked", meetingDate: toIstDate(b.startsAt) },
    { note: details, now },
  );
  const planPaused = await pausePlanTx(tx, actor, p.id, "meeting booked", now);
  return { personId: p.id, ownerId: p.ownerId, created, planPaused };
}

const CLOSED: readonly Stage[] = ["Lost", "Paid", "Active customer"];

/**
 * A meeting was cancelled: logged with the reason, the stage goes back to Replied (from
 * Meeting scheduled) with Respond due today, and a paused plan resumes.
 */
export async function syncCancelled(
  tx: DbOrTx,
  c: {
    personId: string;
    eventName: string;
    startsAt: Date;
    reason: string | null;
    by: string;
    fallback: Actor;
  },
  now: Date,
) {
  const p = await loadPerson(tx, c.personId);
  const actor = await ownerActor(tx, p, c.fallback);
  await logNoteTx(
    tx,
    actor,
    p,
    `Meeting cancelled: "${c.eventName}" on ${whenText(c.startsAt)}, by ${c.by}. Reason: ${c.reason || "None given"}.`,
    now,
  );
  if (p.stage === "Meeting scheduled" && !CLOSED.includes(p.stage)) {
    const today = todayIst(now);
    const [after] = await tx
      .update(person)
      .set({
        stage: "Replied",
        nextAction: "Respond",
        nextActionDate: today,
        nextActionSetAt: new Date(),
      })
      .where(eq(person.id, p.id))
      .returning();
    await tx.insert(activity).values({
      personId: p.id,
      companyId: p.companyId,
      userId: actor.id,
      createdBy: actor.id,
      occurredAt: now,
      type: "Stage change",
      channel: "LinkedIn",
      content: `${p.stage} → Replied (meeting cancelled)`,
      toStage: "Replied",
    });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: p.id,
      recordName: p.fullName,
      action: "Updated",
      before: { stage: p.stage, nextAction: p.nextAction, nextActionDate: p.nextActionDate },
      after: {
        stage: after.stage,
        nextAction: after.nextAction,
        nextActionDate: after.nextActionDate,
        reason: "meeting cancelled",
      },
    });
  }
  const resumed = await resumePlanTx(tx, actor, p.id, "meeting cancelled", now);
  return { ownerId: p.ownerId, planResumed: resumed !== null, personName: p.fullName };
}

/** A meeting moved: one Meeting moved note, and Today's meeting date follows. */
export async function syncMoved(
  tx: DbOrTx,
  m: {
    personId: string;
    eventName: string;
    from: Date;
    to: Date;
    by: string;
    fallback: Actor;
  },
  now: Date,
) {
  const p = await loadPerson(tx, m.personId);
  const actor = await ownerActor(tx, p, m.fallback);
  await logNoteTx(
    tx,
    actor,
    p,
    `Meeting moved: "${m.eventName}" from ${whenText(m.from)} to ${whenText(m.to)}, by ${m.by}.`,
    now,
  );
  if (p.nextAction === "Hold meeting") {
    const date = toIstDate(m.to);
    await tx
      .update(person)
      .set({ nextActionDate: date, ...stampFollowUp(p, { nextActionDate: date }) })
      .where(eq(person.id, p.id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: p.id,
      recordName: p.fullName,
      action: "Updated",
      before: { nextActionDate: p.nextActionDate },
      after: { nextActionDate: date, reason: "meeting moved" },
    });
  }
  return { ownerId: p.ownerId };
}
