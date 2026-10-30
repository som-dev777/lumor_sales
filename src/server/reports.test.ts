// Reports (F19, D-039): the numbers, who may make and open them, the CSV, the AI summary, and
// scheduled runs with their emails.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, auditLog, company, person, reportRun, reportSchedule } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { scheduleSchema } from "@/lib/validation/reports";
import { POST as cron } from "@/app/api/cron/reports/route";
import { createPerson } from "./leads/people";
import {
  createSchedule,
  deleteSchedule,
  runDueSchedules,
  runScheduleNow,
  seedReportSchedules,
  setScheduleActive,
} from "./report-schedules";
import {
  buildReport,
  createReport,
  getReport,
  listReports,
  reportCsv,
  writeAiSummary,
  type ReportData,
} from "./reports";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let asha: Actor;
let ravi: Actor;
let leadId: string;

// Noon IST on a date. October 2026.
const on = (date: string, time = "06:30") => new Date(`${date}T${time}:00Z`);
const OCT = { from: "2026-10-01", to: "2026-10-31" };

beforeEach(async () => {
  t = await createTestDb();
  const a = await insertTestUser(t.db, {
    name: "Somnath",
    role: "Admin",
    email: "somnath@lumor.tech",
  });
  const r1 = await insertTestUser(t.db, { name: "Asha", email: "asha@lumor.tech" });
  const r2 = await insertTestUser(t.db, { name: "Ravi", email: "ravi@lumor.tech" });
  admin = { id: a.id, role: "Admin", active: true };
  asha = { id: r1.id, role: "User", active: true };
  ravi = { id: r2.id, role: "User", active: true };
  const p = await createPerson(
    t.db,
    asha,
    personSchema.parse({
      fullName: "Priya Sharma",
      linkedinUrl: "linkedin.com/in/priya-report",
      companyName: "Acme",
      stage: "Contacted",
    }),
  );
  leadId = p.id;
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

type Extra = Partial<typeof activity.$inferInsert>;
const log = (by: Actor, type: Extra["type"], at: Date, extra: Extra = {}) =>
  t.db.insert(activity).values({
    personId: leadId,
    userId: by.id,
    occurredAt: at,
    type: type!,
    ...extra,
  });

describe("the numbers (F19)", () => {
  beforeEach(async () => {
    await log(asha, "Request sent", on("2026-10-05"));
    await log(asha, "Message sent", on("2026-10-06"), { channel: "LinkedIn" });
    await log(asha, "InMail sent", on("2026-10-06"), { channel: "InMail" });
    await log(asha, "Message sent", on("2026-10-07"), { channel: "Email" });
    await log(asha, "Call", on("2026-10-08"), { channel: "Call", callOutcome: "No answer" });
    await log(asha, "Call", on("2026-10-09"), { channel: "Call", callOutcome: "Connected" });
    await log(asha, "Reply received", on("2026-10-10"));
    await log(asha, "Meeting booked", on("2026-10-11"));
    await log(asha, "Meeting held", on("2026-10-12"));
    await log(asha, "Stage change", on("2026-10-13"), { toStage: "Proposal sent" });
    await log(asha, "Stage change", on("2026-10-14"), { toStage: "Trial" });
    // Plan steps: on time, late, and one from before R9 (no due date).
    await log(asha, "Message sent", on("2026-10-15"), {
      planStepOrder: 2,
      planDueDate: "2026-10-15",
    });
    await log(asha, "Message sent", on("2026-10-20"), {
      planStepOrder: 3,
      planDueDate: "2026-10-19",
    });
    await log(asha, "Request sent", on("2026-10-02"), { planStepOrder: 1 });
    // Outside the period, and someone else's.
    await log(asha, "Request sent", on("2026-09-30"));
    await log(ravi, "Request sent", on("2026-10-05"));
    // Asha converted Priya; Acme is worth ₹1,20,000.
    await t.db
      .update(person)
      .set({ converted: true, convertedDate: "2026-10-25" })
      .where(eq(person.id, leadId));
    const [p] = await t.db.select().from(person).where(eq(person.id, leadId));
    await t.db.update(company).set({ dealValueInr: 120000 }).where(eq(company.id, p.companyId!));
  });

  it("counts activity, outcomes and plan adherence per person, with a team total", async () => {
    const r = await buildReport(t.db, { scope: "team" }, OCT, on("2026-10-30"));
    expect(r.title).toBe("Team · 1 Oct – 31 Oct 2026");
    expect(r.people.map((p) => p.name)).toEqual(["Asha", "Ravi", "Somnath"]);
    const a = r.people[0];
    expect(a).toMatchObject({
      requests: 2,
      messages: 4,
      emails: 1,
      calls: 2,
      callsConnected: 1,
      replies: 1,
      meetingsBooked: 1,
      meetingsHeld: 1,
      proposals: 1,
      trials: 1,
      conversions: 1,
      dealValueInr: 120000,
      stepsDone: 3,
      stepsOnTime: 1,
      stepsLate: 1,
      stepsNotRecorded: 1,
    });
    expect(r.total.requests).toBe(3);
    // The funnel counts events in the period: Priya was first contacted in September.
    expect(r.funnel.totals).toMatchObject({
      contacted: 0,
      replied: 1,
      meetingScheduled: 1,
      paid: 1,
    });
  });

  it("a personal report counts only that person", async () => {
    const r = await buildReport(t.db, { scope: "person", userId: ravi.id }, OCT);
    expect(r.title).toBe("Ravi · 1 Oct – 31 Oct 2026");
    expect(r.people).toHaveLength(1);
    expect(r.total).toMatchObject({ requests: 1, messages: 0, conversions: 0 });
  });

  it("the CSV has every table, defuses spreadsheet formulas, and includes the summary", async () => {
    const r = await buildReport(t.db, { scope: "team" }, OCT);
    const csv = reportCsv(
      { ...r, people: [{ ...r.people[0], name: "=HYPERLINK()" }] },
      "Good month.",
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Activity, outcomes and plan adherence");
    expect(csv).toContain("Person,Connection requests,Messages,Emails,Calls");
    expect(csv).toContain("'=HYPERLINK()");
    expect(csv).toContain("Contacted → Connected");
    expect(csv).toContain("AI summary\r\nGood month.");
  });
});

describe("who may make and open reports", () => {
  it("anyone reports on themselves; the team or someone else needs an Admin", async () => {
    const mine = await createReport(t.db, asha, { scope: "person", userId: asha.id }, OCT);
    await expect(createReport(t.db, asha, { scope: "team" }, OCT)).rejects.toThrow(PermissionError);
    await expect(
      createReport(t.db, asha, { scope: "person", userId: ravi.id }, OCT),
    ).rejects.toThrow(PermissionError);
    const team = await createReport(t.db, admin, { scope: "team" }, OCT);
    const aboutRavi = await createReport(t.db, admin, { scope: "person", userId: ravi.id }, OCT);

    expect((await listReports(t.db, asha)).map((r) => r.id)).toEqual([mine.id]);
    expect((await listReports(t.db, ravi)).map((r) => r.id)).toEqual([aboutRavi.id]);
    expect(await listReports(t.db, admin)).toHaveLength(3);
    expect(await getReport(t.db, asha, team.id)).toBeNull();
    expect((await getReport(t.db, admin, mine.id))?.title).toBe(mine.title);

    const audit = await t.db.select().from(auditLog).where(eq(auditLog.entityType, "Report"));
    expect(audit).toHaveLength(3);
  });

  it("a saved report never changes, even when the data does", async () => {
    const run = await createReport(t.db, asha, { scope: "person", userId: asha.id }, OCT);
    await log(asha, "Request sent", on("2026-10-06"));
    const saved = await getReport(t.db, asha, run.id);
    expect((saved!.data as ReportData).total.requests).toBe(0);
  });

  it("the AI summary is written from the report and saved, with an audit entry", async () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("DATABASE_URL", "file:test.db");
    const run = await createReport(t.db, asha, { scope: "person", userId: asha.id }, OCT);
    const row = await writeAiSummary(t.db, asha, run.id);
    expect(row.aiSummary).toMatch(/connection requests and \d+ replies/);
    await expect(writeAiSummary(t.db, ravi, run.id)).rejects.toThrow("doesn't exist");
  });
});

describe("scheduled reports (D-039)", () => {
  const emailOn = () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Lumor <hub@lumor.tech>");
    vi.stubEnv("BETTER_AUTH_URL", "https://hub.example");
  };
  const sent: { to: string; subject: string; text: string }[] = [];
  const send = async (e: { to: string; subject: string; text: string }) => {
    sent.push(e);
    return true;
  };
  beforeEach(() => {
    sent.length = 0;
  });

  it("the defaults are added once, with their next run in IST", async () => {
    const now = on("2026-10-30"); // Friday, 12:00 IST
    expect(await seedReportSchedules(t.db, now)).toEqual([
      "Daily team report",
      "Weekly team report",
      "Daily personal summary",
    ]);
    expect(await seedReportSchedules(t.db, now)).toEqual([]);
    const rows = await t.db.select().from(reportSchedule);
    const weekly = rows.find((r) => r.name === "Weekly team report")!;
    expect(weekly.nextRunAt.toISOString()).toBe("2026-11-02T03:30:00.000Z"); // Mon 09:00 IST
  });

  it("due schedules run once: team to Admins, each rep to themselves, off ones skipped", async () => {
    emailOn();
    await seedReportSchedules(t.db, on("2026-10-30"));
    const [weekly] = await t.db
      .select()
      .from(reportSchedule)
      .where(eq(reportSchedule.name, "Weekly team report"));
    await setScheduleActive(t.db, admin, weekly.id, false);

    const at = new Date("2026-10-30T13:31:00Z"); // 19:01 IST
    const results = await runDueSchedules(t.db, at, send);
    expect(results).toEqual([
      { name: "Daily team report", reports: 1 },
      { name: "Daily personal summary", reports: 2 },
    ]);
    expect(sent.map((e) => e.to).sort()).toEqual([
      "asha@lumor.tech",
      "ravi@lumor.tech",
      "somnath@lumor.tech",
    ]);
    const team = sent.find((e) => e.to === "somnath@lumor.tech")!;
    expect(team.subject).toBe("Report: Team · 30 Oct 2026");
    expect(team.text).toMatch(
      /Open the full report \(log in first\): https:\/\/hub\.example\/reports\//,
    );
    const runs = await t.db.select().from(reportRun);
    expect(runs).toHaveLength(3);
    expect(runs.find((r) => r.scope === "team")!.emailedTo).toEqual(["somnath@lumor.tech"]);
    // Running again at the same time does nothing: the next run moved to tomorrow.
    expect(await runDueSchedules(t.db, at, send)).toEqual([]);
  });

  it("without email set up, reports are still made and saved, just not sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const s = await createSchedule(
      t.db,
      admin,
      scheduleSchema.parse({
        name: "Monthly Asha",
        frequency: "Monthly",
        timeOfDay: "09:00",
        day: 1,
        scope: "person",
        personUserId: asha.id,
        recipients: "emails",
        emails: "boss@lumor.tech",
      }),
      on("2026-10-30"),
    );
    const made = await runScheduleNow(t.db, admin, s.id, on("2026-11-01"), send);
    expect(made).toHaveLength(1);
    expect(sent).toEqual([]);
    const [run] = await t.db.select().from(reportRun);
    // Monthly covers the previous month.
    expect(run).toMatchObject({ fromDate: "2026-10-01", toDate: "2026-10-31", emailedTo: [] });
    await expect(runScheduleNow(t.db, asha, s.id, on("2026-11-01"), send)).rejects.toThrow(
      PermissionError,
    );
    // It has made a report, so it can only be switched off.
    await expect(deleteSchedule(t.db, admin, s.id)).rejects.toThrow("switch it off instead");
  });

  it("checks the schedule form", () => {
    const base = {
      name: "Weekly",
      frequency: "Weekly",
      timeOfDay: "09:00",
      day: 1,
      scope: "team",
      recipients: "admins",
    };
    expect(scheduleSchema.safeParse(base).success).toBe(true);
    const err = (v: object) => scheduleSchema.safeParse({ ...base, ...v }).error?.issues[0].message;
    expect(err({ timeOfDay: "09:15" })).toBe("Pick a time on the hour or half hour.");
    expect(err({ day: 9 })).toBe("Choose the weekday.");
    expect(err({ frequency: "Monthly", day: 31 })).toBe("Choose a day of the month from 1 to 28.");
    expect(err({ scope: "person" })).toBe("Choose the person.");
    expect(err({ recipients: "emails", emails: "" })).toBe("Add at least one email address.");
    expect(err({ recipients: "emails", emails: "not-an-email" })).toBe(
      "Check the email addresses.",
    );
    expect(err({ recipients: "each-rep" })).toBe(
      "'Each rep' only works when each rep gets their own report.",
    );
  });

  it("the cron route refuses anyone without the secret", async () => {
    const call = (auth?: string) =>
      cron(
        new Request("http://x/api/cron/reports", {
          method: "POST",
          headers: auth ? { authorization: auth } : {},
        }),
      );
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "a-long-test-secret-0123456789");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-0123456789abcd")).status).toBe(401);
  });
});
