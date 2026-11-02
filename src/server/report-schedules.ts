// Scheduled reports (F19): Admins set them up; a Netlify scheduled function calls the app every
// 15 minutes and every schedule that's due makes its report(s), adds the AI summary when AI is
// set up, and emails a link (when email is set up). Each change is audited.
import { and, asc, eq, lte } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { reportRun, reportSchedule, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { nextRunAt, scheduleSpan } from "@/lib/report-periods";
import { formatIst, todayIst } from "@/lib/time";
import type { ScheduleData } from "@/lib/validation/reports";
import { aiMode } from "./ai/client";
import { sendEmail, type Email } from "./email";
import { LeadError } from "./leads/companies";
import { emailReport } from "./report-share";
import {
  createReport,
  saveSummary,
  summariseReport,
  type ReportData,
  type ReportTarget,
} from "./reports";

type ScheduleRow = typeof reportSchedule.$inferSelect;
type Sender = (email: Email) => Promise<boolean>;

export async function listSchedules(db: DbOrTx) {
  return db
    .select({ s: reportSchedule, personName: user.name })
    .from(reportSchedule)
    .leftJoin(user, eq(user.id, reportSchedule.personUserId))
    .orderBy(asc(reportSchedule.name))
    .then((rows) => rows.map((r) => ({ ...r.s, personName: r.personName })));
}

const auditFields = (s: ScheduleRow) => ({
  name: s.name,
  frequency: s.frequency,
  timeOfDay: s.timeOfDay,
  day: s.day,
  scope: s.scope,
  personUserId: s.personUserId,
  recipients: s.recipients,
  emails: s.emails.join(", "),
  active: s.active,
});

async function nameTaken(tx: DbOrTx, name: string, except: string | null) {
  const [row] = await tx
    .select({ id: reportSchedule.id })
    .from(reportSchedule)
    .where(eq(reportSchedule.name, name));
  return row !== undefined && row.id !== except;
}

export async function createSchedule(db: Db, actor: Actor, data: ScheduleData, now = new Date()) {
  assertCan(actor, "reports.schedule");
  return db.transaction(async (tx) => {
    if (await nameTaken(tx, data.name, null))
      throw new LeadError("A schedule with that name exists.");
    const [row] = await tx
      .insert(reportSchedule)
      .values({ ...data, nextRunAt: nextRunAt(data, now), createdBy: actor.id })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Report schedule",
      recordId: row.id,
      recordName: row.name,
      action: "Created",
      after: auditFields(row),
    });
    return row;
  });
}

export async function updateSchedule(
  db: Db,
  actor: Actor,
  id: string,
  data: ScheduleData,
  now = new Date(),
) {
  assertCan(actor, "reports.schedule");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(reportSchedule).where(eq(reportSchedule.id, id));
    if (!before) throw new LeadError("That schedule doesn't exist.");
    if (await nameTaken(tx, data.name, id))
      throw new LeadError("A schedule with that name exists.");
    const [after] = await tx
      .update(reportSchedule)
      .set({ ...data, nextRunAt: nextRunAt(data, now) })
      .where(eq(reportSchedule.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Report schedule",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: auditFields(before),
      after: auditFields(after),
    });
    return after;
  });
}

export async function setScheduleActive(
  db: Db,
  actor: Actor,
  id: string,
  active: boolean,
  now = new Date(),
) {
  assertCan(actor, "reports.schedule");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(reportSchedule).where(eq(reportSchedule.id, id));
    if (!before) throw new LeadError("That schedule doesn't exist.");
    const [after] = await tx
      .update(reportSchedule)
      // Switching back on starts from the next run after now, never a backlog.
      .set({ active, nextRunAt: active ? nextRunAt(before, now) : before.nextRunAt })
      .where(eq(reportSchedule.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Report schedule",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: { active: before.active },
      after: { active: after.active },
    });
    return after;
  });
}

/** Deletes a schedule that hasn't made any reports yet; otherwise switch it off instead. */
export async function deleteSchedule(db: Db, actor: Actor, id: string) {
  assertCan(actor, "reports.schedule");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(reportSchedule).where(eq(reportSchedule.id, id));
    if (!before) throw new LeadError("That schedule doesn't exist.");
    const [used] = await tx
      .select({ id: reportRun.id })
      .from(reportRun)
      .where(eq(reportRun.scheduleId, id))
      .limit(1);
    if (used) throw new LeadError("This schedule has made reports, so switch it off instead.");
    await tx.delete(reportSchedule).where(eq(reportSchedule.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Report schedule",
      recordId: id,
      recordName: before.name,
      action: "Deleted",
      before: auditFields(before),
    });
  });
}

// --- Running --------------------------------------------------------------------------------

/** The report email: headline numbers, the AI summary, and a link to the saved copy. */
export function reportEmail(to: string, runId: string, data: ReportData, summary: string | null) {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  const t = data.total;
  const lines = [
    data.title,
    "",
    `Connection requests: ${t.requests} · Messages: ${t.messages + t.emails} · Calls: ${t.calls}`,
    `Replies: ${t.replies} · Meetings booked: ${t.meetingsBooked} · Conversions: ${t.conversions}`,
    `Plan steps: ${t.stepsDone} done, ${t.stepsLate} late`,
    ...(summary ? ["", summary] : []),
    "",
    `Open the full report (log in first): ${base}/reports/${runId}`,
    "",
    "— Lumor Sales Hub",
  ];
  return { to, subject: `Report: ${data.title}`, text: lines.join("\n") };
}

async function targetsFor(db: DbOrTx, s: ScheduleRow) {
  if (s.scope === "team") return [{ target: { scope: "team" } as ReportTarget, rep: null }];
  if (s.scope === "person")
    return [{ target: { scope: "person", userId: s.personUserId! } as ReportTarget, rep: null }];
  // Each rep: every active User gets their own report.
  const reps = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(eq(user.active, true), eq(user.role, "User")))
    .orderBy(asc(user.name));
  return reps.map((r) => ({ target: { scope: "person", userId: r.id } as ReportTarget, rep: r }));
}

/** Who a schedule's report goes to: teammates (shared with them too, D-043) and addresses. */
async function recipientsFor(
  db: DbOrTx,
  s: ScheduleRow,
  rep: { id: string; email: string } | null,
): Promise<{ userIds: string[]; emails: string[] }> {
  if (s.recipients === "emails") return { userIds: [], emails: s.emails };
  if (s.recipients === "each-rep") return { userIds: rep ? [rep.id] : [], emails: [] };
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.active, true), eq(user.role, "Admin")));
  return { userIds: admins.map((a) => a.id), emails: [] };
}

/** Makes one schedule's report(s) for the period ending `now`, with summary and emails. */
export async function runSchedule(db: Db, s: ScheduleRow, now: Date, send: Sender = sendEmail) {
  const span = scheduleSpan(s.frequency, todayIst(now));
  const made: string[] = [];
  for (const { target, rep } of await targetsFor(db, s)) {
    const run = await createReport(db, null, target, span, { now, scheduleId: s.id });
    const data = run.data as ReportData;
    let summary: string | null = null;
    if (aiMode() !== "off") {
      try {
        summary = await summariseReport(data);
        await saveSummary(db, null, run.id, run.title, null, summary);
      } catch (e) {
        // The report is still saved and sent without it.
        console.error(`AI summary for "${run.title}" failed:`, e instanceof Error ? e.message : e);
      }
    }
    const to = await recipientsFor(db, s, rep);
    if (to.userIds.length + to.emails.length > 0) await emailReport(db, null, run.id, to, send);
    made.push(run.id);
  }
  return made;
}

async function markRun(db: Db, actor: Actor | null, s: ScheduleRow, now: Date, advance: boolean) {
  await db.transaction(async (tx) => {
    const values = { lastRunAt: now, ...(advance ? { nextRunAt: nextRunAt(s, now) } : {}) };
    await tx.update(reportSchedule).set(values).where(eq(reportSchedule.id, s.id));
    await writeAudit(tx, {
      userId: actor?.id ?? null,
      entityType: "Report schedule",
      recordId: s.id,
      recordName: s.name,
      action: "Updated",
      before: { lastRunAt: s.lastRunAt ? formatIst(s.lastRunAt) : null },
      after: {
        lastRunAt: formatIst(now),
        ...(advance ? { nextRunAt: formatIst(values.nextRunAt!) } : { source: "Run now" }),
      },
    });
  });
}

/** Runs every active schedule that's due (the cron route). Each runs once per due time. */
export async function runDueSchedules(db: Db, now = new Date(), send: Sender = sendEmail) {
  const due = await db
    .select()
    .from(reportSchedule)
    .where(and(eq(reportSchedule.active, true), lte(reportSchedule.nextRunAt, now)))
    .orderBy(asc(reportSchedule.nextRunAt));
  const results: { name: string; reports: number; error?: string }[] = [];
  for (const s of due) {
    // Move the next run on first, so an overlapping call doesn't run it twice.
    await markRun(db, null, s, now, true);
    try {
      results.push({ name: s.name, reports: (await runSchedule(db, s, now, send)).length });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`Schedule "${s.name}" failed:`, error);
      results.push({ name: s.name, reports: 0, error });
    }
  }
  return results;
}

/** Admins: run one schedule now, without changing when it next runs. */
export async function runScheduleNow(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
  send: Sender = sendEmail,
) {
  assertCan(actor, "reports.schedule");
  const [s] = await db.select().from(reportSchedule).where(eq(reportSchedule.id, id));
  if (!s) throw new LeadError("That schedule doesn't exist.");
  const made = await runSchedule(db, s, now, send);
  await markRun(db, actor, s, now, false);
  return made;
}

// --- The default schedules (PRD) --------------------------------------------------------------

export const DEFAULT_SCHEDULES: ScheduleData[] = [
  {
    name: "Daily team report",
    frequency: "Daily",
    timeOfDay: "19:00",
    day: null,
    scope: "team",
    personUserId: null,
    recipients: "admins",
    emails: [],
    active: true,
  },
  {
    name: "Weekly team report",
    frequency: "Weekly",
    timeOfDay: "09:00",
    day: 1,
    scope: "team",
    personUserId: null,
    recipients: "admins",
    emails: [],
    active: true,
  },
  {
    name: "Daily personal summary",
    frequency: "Daily",
    timeOfDay: "19:00",
    day: null,
    scope: "each-rep",
    personUserId: null,
    recipients: "each-rep",
    emails: [],
    active: true,
  },
];

/** Adds the default schedules that aren't there yet (by name). Never changes existing ones. */
export async function seedReportSchedules(db: Db, now = new Date()) {
  return db.transaction(async (tx) => {
    const added: string[] = [];
    for (const d of DEFAULT_SCHEDULES) {
      if (await nameTaken(tx, d.name, null)) continue;
      const [row] = await tx
        .insert(reportSchedule)
        .values({ ...d, nextRunAt: nextRunAt(d, now) })
        .returning();
      await writeAudit(tx, {
        userId: null,
        entityType: "Report schedule",
        recordId: row.id,
        recordName: row.name,
        action: "Created",
        after: { ...auditFields(row), source: "seed script" },
      });
      added.push(row.name);
    }
    return added;
  });
}
