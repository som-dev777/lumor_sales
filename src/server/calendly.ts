// Calendly integration (F27, D-043): Calendly calls /api/calendly/webhook when someone books,
// cancels or reschedules. The signature is checked, each Calendly invitee is handled once, and
// the person is updated by the same booking sync as the Lumor booking page.
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { calendarProfile, calendlyBooking, user } from "@/lib/db/schema";
import { formatIst } from "@/lib/time";
import { appUrl } from "@/lib/tokens";
import {
  repBookedMail,
  repCancelledMail,
  repMovedMail,
  type Mail,
  type Where,
} from "./booking-emails";
import { defaultAdmin, syncBooked, syncCancelled, syncMoved } from "./booking-sync";
import { renderMail } from "./calendar-mail";
import { emailConfigured, sendEmail, type Email } from "./email";
import { addNotificationsTx } from "./notifications";

/** How old a signed call may be: 5 minutes (D-043). */
const TOLERANCE_MS = 5 * 60_000;

/**
 * Checks Calendly's "Calendly-Webhook-Signature: t=…,v1=…" header: HMAC-SHA256 of "t.body"
 * with the signing key, compared in constant time, and no older than 5 minutes.
 */
export function verifyCalendlySignature(
  header: string | null,
  body: string,
  key: string | undefined,
  now = Date.now(),
): boolean {
  if (!key?.trim() || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return false;
  if (Math.abs(now - t * 1000) > TOLERANCE_MS) return false;
  const expected = createHmac("sha256", key.trim()).update(`${parts.t}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.v1));
  return a.length === b.length && timingSafeEqual(a, b);
}

const text = z.string().trim().max(2000);

/** The parts of Calendly's webhook body the Sales Hub uses. */
export const calendlySchema = z.object({
  event: z.string(),
  payload: z.object({
    uri: z.string().max(500),
    email: z.email().max(200),
    name: text,
    timezone: z.string().max(60).nullish(),
    rescheduled: z.boolean().nullish(),
    old_invitee: z.string().max(500).nullish(),
    text_reminder_number: z.string().max(40).nullish(),
    cancellation: z.object({ reason: text.nullish(), canceled_by: text.nullish() }).nullish(),
    questions_and_answers: z.array(z.object({ question: text, answer: text.nullish() })).nullish(),
    scheduled_event: z.object({
      uri: z.string().max(500).nullish(),
      name: text,
      start_time: z.iso.datetime({ offset: true }),
      end_time: z.iso.datetime({ offset: true }),
      location: z
        .object({
          type: z.string().nullish(),
          join_url: z.string().max(1000).nullish(),
          location: z.string().max(1000).nullish(),
        })
        .nullish(),
    }),
  }),
});
export type CalendlyEvent = z.infer<typeof calendlySchema>;

type Owner = { id: string; name: string; to: string };

async function ownerOf(db: Db, ownerId: string): Promise<Owner | null> {
  const [o] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      notify: calendarProfile.notifyEmail,
    })
    .from(user)
    .leftJoin(calendarProfile, eq(calendarProfile.userId, user.id))
    .where(eq(user.id, ownerId));
  return o ? { id: o.id, name: o.name, to: o.notify ?? o.email } : null;
}

async function mailOwner(
  db: Db,
  ownerId: string,
  mail: Mail,
  replyTo: string,
  send: (e: Email) => Promise<boolean>,
) {
  if (!emailConfigured()) return;
  const owner = await ownerOf(db, ownerId);
  if (!owner) return;
  const { text: body, html } = renderMail(mail.content);
  await send({ to: owner.to, replyTo, subject: mail.subject, text: body, html });
}

const companyAnswer = (qa: { question: string; answer: string }[]) =>
  qa.find((a) => /compan|organi[sz]ation/i.test(a.question))?.answer || null;
const phoneAnswer = (qa: { question: string; answer: string }[]) =>
  qa.find((a) => /phone|mobile|whats ?app/i.test(a.question))?.answer || null;

function whereOf(e: CalendlyEvent["payload"]["scheduled_event"]): Where {
  const loc = e.location;
  if (!loc) return null;
  if (loc.join_url) {
    return /meet\.google\.com/.test(loc.join_url)
      ? { kind: "meet", link: loc.join_url }
      : { kind: "link", link: loc.join_url };
  }
  if (loc.location) {
    return loc.type === "physical"
      ? { kind: "place", text: loc.location }
      : /^https?:\/\//.test(loc.location)
        ? { kind: "link", link: loc.location }
        : { kind: "text", text: loc.location };
  }
  return null;
}

const whereText = (w: Where) =>
  !w ? null : w.kind === "meet" || w.kind === "link" ? w.link : w.kind === "tbc" ? null : w.text;

export type CalendlyResult =
  | "booked"
  | "moved"
  | "cancelled"
  | "duplicate"
  | "waiting for the new time"
  | "unknown booking"
  | "ignored";

/** Handles one verified Calendly call. Safe to call twice with the same event. */
export async function handleCalendly(
  db: Db,
  e: CalendlyEvent,
  now = new Date(),
  send: (m: Email) => Promise<boolean> = sendEmail,
): Promise<CalendlyResult> {
  const p = e.payload;
  const ev = p.scheduled_event;
  const answers = (p.questions_and_answers ?? []).map((a) => ({
    question: a.question,
    answer: a.answer?.trim() ?? "",
  }));
  const startsAt = new Date(ev.start_time);
  const endsAt = new Date(ev.end_time);
  const where = whereOf(ev);
  const [seen] = await db
    .select()
    .from(calendlyBooking)
    .where(eq(calendlyBooking.inviteeUri, p.uri));

  if (e.event === "invitee.created") {
    if (seen) return "duplicate";
    const [old] = p.old_invitee
      ? await db.select().from(calendlyBooking).where(eq(calendlyBooking.inviteeUri, p.old_invitee))
      : [];
    const admin = await defaultAdmin(db);
    const moved = Boolean(old?.personId);
    const result = await db.transaction(async (tx) => {
      let personId: string;
      let ownerId: string;
      let created = false;
      let planPaused = false;
      if (old?.personId) {
        await tx
          .update(calendlyBooking)
          .set({ status: "Moved" })
          .where(eq(calendlyBooking.id, old.id));
        const r = await syncMoved(
          tx,
          {
            personId: old.personId,
            eventName: ev.name,
            from: old.startsAt,
            to: startsAt,
            by: p.name,
            fallback: admin,
          },
          now,
        );
        personId = old.personId;
        ownerId = r.ownerId;
      } else {
        const r = await syncBooked(
          tx,
          {
            source: "Calendly",
            eventName: ev.name,
            email: p.email,
            name: p.name,
            company: companyAnswer(answers),
            phone: p.text_reminder_number ?? phoneAnswer(answers),
            linkedin: null,
            startsAt,
            where: whereText(where),
            answers,
            newOwner: admin,
          },
          now,
        );
        ({ personId, ownerId, created, planPaused } = r);
      }
      const [row] = await tx
        .insert(calendlyBooking)
        .values({
          inviteeUri: p.uri,
          eventUri: ev.uri ?? null,
          eventName: ev.name,
          startsAt,
          endsAt,
          joinUrl: whereText(where),
          inviteeName: p.name,
          inviteeEmail: p.email.toLowerCase(),
          answers,
          personId,
          replacesUri: old ? old.inviteeUri : null,
        })
        .returning();
      await writeAudit(tx, {
        userId: ownerId,
        entityType: "Calendly booking",
        recordId: row.id,
        recordName: `${ev.name} with ${p.name}`,
        action: "Created",
        after: {
          event: ev.name,
          startsAt: formatIst(startsAt),
          invitee: p.name,
          email: row.inviteeEmail,
          replaces: old?.id ?? null,
          via: "Calendly",
        },
      });
      await addNotificationsTx(tx, null, [
        {
          userId: ownerId,
          kind: "calendly",
          title: moved
            ? `Moved on Calendly: ${ev.name} with ${p.name}`
            : `Booked on Calendly: ${ev.name} with ${p.name}`,
          body: `${formatIst(startsAt, "EEE d MMM yyyy, h:mm aaa")} IST · ${p.name} (${p.email})${created ? " · new person, check their details" : ""}.`,
          link: `/people/${personId}`,
        },
      ]);
      return { personId, ownerId, created, planPaused };
    });
    const company = companyAnswer(answers) ?? "company not given";
    const openUrl = `${appUrl()}/people/${result.personId}`;
    await mailOwner(
      db,
      result.ownerId,
      moved
        ? repMovedMail({
            name: p.name,
            company,
            eventName: ev.name,
            openUrl,
            from: old!.startsAt,
            to: startsAt,
            by: p.name,
          })
        : repBookedMail({
            name: p.name,
            company,
            eventName: ev.name,
            startsAt,
            durationMin: Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
            where,
            answers,
            openUrl,
            created: result.created,
            planPaused: result.planPaused,
          }),
      p.email,
      send,
    );
    return moved ? "moved" : "booked";
  }

  if (e.event === "invitee.canceled") {
    if (!seen) return "unknown booking";
    if (seen.status !== "Booked") return "duplicate";
    // A reschedule: the new booking that follows says which one it replaces.
    if (p.rescheduled) return "waiting for the new time";
    const reason = p.cancellation?.reason?.trim() || null;
    const by = p.cancellation?.canceled_by?.trim() || p.name;
    const admin = await defaultAdmin(db);
    const r = await db.transaction(async (tx) => {
      await tx
        .update(calendlyBooking)
        .set({ status: "Cancelled", cancelReason: reason })
        .where(eq(calendlyBooking.id, seen.id));
      await writeAudit(tx, {
        userId: admin.id,
        entityType: "Calendly booking",
        recordId: seen.id,
        recordName: `${seen.eventName} with ${seen.inviteeName}`,
        action: "Updated",
        before: { status: seen.status },
        after: { status: "Cancelled", reason, by, via: "Calendly" },
      });
      if (!seen.personId) return null;
      const done = await syncCancelled(
        tx,
        {
          personId: seen.personId,
          eventName: seen.eventName,
          startsAt: seen.startsAt,
          reason,
          by,
          fallback: admin,
        },
        now,
      );
      await addNotificationsTx(tx, null, [
        {
          userId: done.ownerId,
          kind: "calendly",
          title: `Cancelled on Calendly: ${seen.eventName} with ${seen.inviteeName}`,
          body: `${formatIst(seen.startsAt, "EEE d MMM yyyy, h:mm aaa")} IST · Reason: ${reason ?? "None given"}.`,
          link: `/people/${seen.personId}`,
        },
      ]);
      return done;
    });
    if (r && seen.personId) {
      await mailOwner(
        db,
        r.ownerId,
        repCancelledMail({
          name: seen.inviteeName,
          company: companyAnswer(seen.answers) ?? "company not given",
          eventName: seen.eventName,
          startsAt: seen.startsAt,
          openUrl: `${appUrl()}/people/${seen.personId}`,
          reason,
          by: by === p.name ? seen.inviteeName : by,
          planResumed: r.planResumed,
        }),
        p.email,
        send,
      );
    }
    return "cancelled";
  }
  return "ignored";
}
