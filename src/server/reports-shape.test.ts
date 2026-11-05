// D-057: report numbers that match Today and People, What happened, Include in report, Edit
// numbers; People's "Active today"; Today by day.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, auditLog, company, person, reportRun } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { applyEdits, cleanEdits, isEditKey } from "@/lib/report-shape";
import { personSchema } from "@/lib/validation/leads";
import { addEntry } from "./conversation";
import { createPerson, listPeople, updatePerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import { reportPdf } from "./report-pdf";
import {
  buildReport,
  createReport,
  getReport,
  reportCsv,
  saveReportEdits,
  setSectionIncluded,
  shapeOf,
} from "./reports";
import { buildDay, buildToday, pickDay, setFollowUp } from "./today";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let asha: Actor;
let ravi: Actor;
const DAY = "2026-11-04";
const at = (h: number, d = DAY) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00+05:30`);
const SPAN = { from: DAY, to: DAY };

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  asha = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  ravi = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
});
afterEach(() => t.cleanup());

let n = 0;
async function lead(by: Actor, createdAt: Date, extra: Record<string, unknown> = {}) {
  n += 1;
  const p = await createPerson(
    t.db,
    by,
    personSchema.parse({
      fullName: `Lead ${n}`,
      linkedinUrl: `linkedin.com/in/d57-${n}`,
      companyName: `Company ${n}`,
      stage: "Connected",
      ...extra,
    }),
  );
  await t.db.update(person).set({ createdAt }).where(eq(person.id, p.id));
  return p;
}

describe("report numbers match Today and People (D-057)", () => {
  it("New outreach: added, a connection request, or a first contact; the same number as Today", async () => {
    const added = await lead(asha, at(10)); // added today, nothing sent
    const requested = await lead(asha, at(9, "2026-10-20"));
    const messaged = await lead(asha, at(9, "2026-10-20"));
    const old = await lead(asha, at(9, "2026-10-20"));
    await quickLog(t.db, asha, requested.id, { action: "requestSent" }, { now: at(11) });
    await quickLog(t.db, asha, messaged.id, { action: "messageSent" }, { now: at(12) });
    // Contacted before today: a message today isn't new outreach.
    await quickLog(t.db, asha, old.id, { action: "messageSent" }, { now: at(12, "2026-10-21") });
    await quickLog(t.db, asha, old.id, { action: "messageSent" }, { now: at(13) });

    const r = await buildReport(t.db, { scope: "person", userId: asha.id }, SPAN, at(18));
    expect(r.pipeline!.total.newOutreach).toBe(3);
    expect(added.id).toBeTruthy();
    const today = await buildToday(t.db, asha, at(18));
    expect(today.outreach.sent).toBe(3);
  });

  it("Replied counts people who replied or were moved to Replied, for their owner; Converted counts a move to Paid", async () => {
    const a = await lead(asha, at(9, "2026-10-01"));
    const b = await lead(asha, at(9, "2026-10-01"));
    const c = await lead(asha, at(9, "2026-10-01"));
    // An Admin logs the reply on Asha's lead: it's Asha's reply in the Pipeline.
    await quickLog(
      t.db,
      admin,
      a.id,
      { action: "gotReply", replyType: "Interested" },
      { now: at(10) },
    );
    // Moved to Replied, and to Paid, in the edit form (no quick-log).
    const form = (stage: string) =>
      personSchema.parse({
        fullName: "Form lead",
        linkedinUrl: `linkedin.com/in/d57-form-${stage}`,
        companyName: "Form Co",
        stage,
      });
    await updatePerson(t.db, asha, b.id, { ...form("Replied"), fullName: "Lead b" });
    await updatePerson(t.db, asha, c.id, { ...form("Paid"), fullName: "Lead c" });
    const r = await buildReport(t.db, { scope: "team" }, { from: "2026-10-01", to: "2026-12-31" });
    const row = r.pipeline!.people.find((x) => x.userId === asha.id)!;
    expect(row.replied).toBe(2);
    expect(row.converted).toBe(1);
    expect(r.people.find((x) => x.userId === asha.id)!.conversions).toBe(1);
    expect(r.pipeline!.people.find((x) => x.userId === admin.id)!.replied).toBe(0);
  });
});

describe("Events of the day (D-058)", () => {
  it("company by company: new companies and people marked, facts and a summary per person", async () => {
    // A new company with a new person, contacted today.
    const fresh = await lead(asha, at(9));
    await t.db
      .update(company)
      .set({ createdAt: at(9) })
      .where(eq(company.id, fresh.companyId!));
    await quickLog(
      t.db,
      asha,
      fresh.id,
      { action: "requestSent", withNote: true },
      { now: at(10) },
    );
    // An existing company: an existing person who replied today, and a new person added today.
    const old = await lead(asha, at(9, "2026-10-01"), { companyName: "Old Co" });
    await t.db
      .update(company)
      .set({ createdAt: at(9, "2026-10-01") })
      .where(eq(company.id, old.companyId!));
    await quickLog(t.db, asha, old.id, { action: "messageSent" }, { now: at(9, "2026-10-02") });
    await quickLog(
      t.db,
      asha,
      old.id,
      { action: "gotReply", replyType: "Interested" },
      { now: at(11) },
    );
    await setFollowUp(t.db, asha, old.id, { nextAction: "Send deck", date: "2026-11-06" }, at(12));
    const added = await lead(asha, at(13), { companyName: "Old Co" });
    // Someone with nothing today: not listed.
    await lead(asha, at(9, "2026-10-01"));

    const r = await buildReport(t.db, { scope: "person", userId: asha.id }, SPAN, at(18));
    expect(r.version).toBe(4);
    const e = r.events!;
    expect(e.counts).toEqual({ companies: 1, people: 2, contacts: 1, replies: 1, meetings: 0 });
    expect(e.companies.map((c) => [c.name, c.isNew])).toEqual([
      [fresh.fullName.replace("Lead", "Company"), true],
      ["Old Co", false],
    ]);
    const oldCo = e.companies[1];
    expect(oldCo.people.map((p) => [p.name, p.isNew])).toEqual([
      [added.fullName, true],
      [old.fullName, false],
    ]);
    const facts = oldCo.people[1].facts;
    expect(facts).toContain("First contacted 2 Oct");
    expect(facts).toContain("Talking since 4 Nov");
    expect(facts).toContain("1 message or call from us, 1 reply");
    expect(facts).toContain("Follow-up: Send deck on 6 Nov");
    expect(e.companies[0].people[0].facts[0]).toBe("Connection request sent 4 Nov (with a note)");
    // AI off in tests: facts only, and the report says so.
    expect(oldCo.people[1].summary).toBeNull();
    expect(e.withoutSummary).toBe(3);
    const csv = reportCsv(r, null);
    expect(csv).toContain("Old Co,,");
    expect(csv).toContain("Follow-up: Send deck on 6 Nov");
    expect(reportPdf(r, null).length).toBeGreaterThan(1000);
  });

  it("writes a summary per person with the AI (stand-in in tests)", async () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("DATABASE_URL", "file:test.db");
    const p = await lead(asha, at(9));
    await quickLog(t.db, asha, p.id, { action: "messageSent" }, { now: at(10), note: "Hi there" });
    await setFollowUp(t.db, asha, p.id, { nextAction: "Call", date: "2026-11-06" }, at(11));
    const r = await buildReport(t.db, { scope: "person", userId: asha.id }, SPAN, at(18));
    const person1 = r.events!.companies[0].people[0];
    expect(person1.summary).toMatchObject({
      offered: "A short demo of Lumor for their research.",
      nextStep: "Call on 6 Nov",
    });
    expect(r.events!.withoutSummary).toBe(0);
    vi.unstubAllEnvs();
  });
});

describe("Follow-ups and the Connection request (D-058)", () => {
  it("Follow-ups count people contacted before and contacted again", async () => {
    const before = await lead(asha, at(9, "2026-10-01"));
    await quickLog(t.db, asha, before.id, { action: "messageSent" }, { now: at(9, "2026-10-02") });
    await quickLog(t.db, asha, before.id, { action: "messageSent" }, { now: at(10) });
    const fresh = await lead(asha, at(9));
    await quickLog(t.db, asha, fresh.id, { action: "messageSent" }, { now: at(11) });
    const r = await buildReport(t.db, { scope: "person", userId: asha.id }, SPAN, at(18));
    expect(r.pipeline!.total).toMatchObject({ newOutreach: 1, followUps: 1 });
  });

  it("the conversation box logs a connection request, with the note, as Request sent", async () => {
    const p = await lead(asha, at(9));
    await addEntry(
      t.db,
      asha,
      p.id,
      { from: "request", channel: "LinkedIn", at: at(10), text: "Hi, loved your talk" },
      { now: at(11) },
    );
    await addEntry(
      t.db,
      asha,
      (await lead(asha, at(9))).id,
      { from: "request", channel: "LinkedIn", at: at(10), text: "" },
      { now: at(11) },
    );
    const rows = await t.db.select().from(activity).where(eq(activity.type, "Request sent"));
    expect(rows.map((r) => [r.requestNote, r.content])).toEqual([
      [true, "Hi, loved your talk"],
      [false, null],
    ]);
    const r = await buildReport(t.db, { scope: "person", userId: asha.id }, SPAN, at(18));
    expect(r.total.requests).toBe(2);
  });
});

describe("Include in report and Edit numbers (D-057)", () => {
  it("a section switched off can be switched back on (D-058)", async () => {
    const run = await createReport(t.db, asha, { scope: "person", userId: asha.id }, SPAN, {
      now: at(18),
    });
    await setSectionIncluded(t.db, asha, run.id, "activity", false);
    expect((await getReport(t.db, asha, run.id))!.hiddenSections).toEqual(["activity"]);
    await setSectionIncluded(t.db, asha, run.id, "activity", true);
    expect((await getReport(t.db, asha, run.id))!.hiddenSections).toEqual([]);
  });

  it("edits lay over a copy; rates follow; only known whole numbers are accepted", async () => {
    await lead(asha, at(9));
    const r = await buildReport(t.db, { scope: "team" }, SPAN, at(18));
    expect(isEditKey(r, `pipeline.${asha.id}.newOutreach`)).toBe(true);
    expect(isEditKey(r, "pipeline.total.stages")).toBe(false);
    expect(isEditKey(r, "numbers.nobody.requests")).toBe(false);
    const edited = applyEdits(r, {
      [`pipeline.${asha.id}.newOutreach`]: 12,
      "numbers.total.requests": 30,
      "funnel.0.from": 20,
      "funnel.0.to": 5,
    });
    expect(edited.pipeline!.people.find((x) => x.userId === asha.id)!.newOutreach).toBe(12);
    expect(edited.total.requests).toBe(30);
    expect(edited.funnel.conversions[0].rate).toBe(0.25);
    expect(r.pipeline!.people.find((x) => x.userId === asha.id)!.newOutreach).toBe(1); // untouched
    expect(() => cleanEdits(r, { "numbers.total.requests": -1 })).toThrow();
    expect(() => cleanEdits(r, { "numbers.total.requests": 1.5 })).toThrow();
    expect(() => cleanEdits(r, { "evil.key.x": 1 })).toThrow();
  });

  it("the maker or an Admin shapes a report; the data stays; downloads follow; audited", async () => {
    await lead(asha, at(9));
    const run = await createReport(t.db, asha, { scope: "person", userId: asha.id }, SPAN, {
      now: at(18),
    });
    await setSectionIncluded(t.db, asha, run.id, "outcomes", false);
    await saveReportEdits(t.db, asha, run.id, {
      [`numbers.${asha.id}.requests`]: 7,
      // Same as the original: not kept.
      [`pipeline.${asha.id}.peopleAdded`]: 1,
    });
    await expect(setSectionIncluded(t.db, ravi, run.id, "details", false)).rejects.toThrow(
      "That report doesn't exist.",
    );
    await setSectionIncluded(t.db, admin, run.id, "details", false);
    const saved = (await getReport(t.db, asha, run.id))!;
    expect(saved.hiddenSections).toEqual(["outcomes", "details"]);
    expect(saved.edits).toEqual({ [`numbers.${asha.id}.requests`]: 7 });
    // The report's own data is never changed.
    const [row] = await t.db.select().from(reportRun).where(eq(reportRun.id, run.id));
    expect(JSON.stringify(row.data)).toBe(JSON.stringify(run.data));
    const shaped = shapeOf(saved);
    expect(shaped.data.people[0].requests).toBe(7);
    const csv = reportCsv(shaped.data, null, shaped.hidden);
    expect(csv).not.toContain("Replies and outcomes");
    expect(csv).not.toContain("Events");
    expect(csv).toContain("Activity\r\nPerson,Connection requests");
    expect(csv).toContain("Asha,7,");
    const audits = await t.db.select().from(auditLog).where(eq(auditLog.recordId, run.id));
    expect(audits.filter((a) => a.action === "Updated")).toHaveLength(3);
    // Undo all edits.
    await saveReportEdits(t.db, asha, run.id, {});
    expect((await getReport(t.db, asha, run.id))!.edits).toEqual({});
  });
});

describe("People: Active today (D-057)", () => {
  it("shows only people with something done today", async () => {
    const a = await lead(asha, at(9, "2026-10-01"));
    await lead(asha, at(9, "2026-10-01"));
    await t.db.insert(activity).values({
      personId: a.id,
      userId: asha.id,
      occurredAt: at(10),
      type: "Call",
      channel: "Call",
    });
    const r = await listPeople(t.db, { activity: "today" }, { now: at(18) });
    expect(r.rows.map((x) => x.id)).toEqual([a.id]);
  });
});

describe("Today by day (D-057)", () => {
  it("takes days within 7 either way", () => {
    expect(pickDay("2026-11-05", DAY)).toBe("2026-11-05");
    expect(pickDay("2026-10-28", DAY)).toBe("2026-10-28");
    expect(pickDay("2026-10-27", DAY)).toBeNull();
    expect(pickDay("2026-11-12", DAY)).toBeNull();
    expect(pickDay(DAY, DAY)).toBeNull();
    expect(pickDay("nonsense", DAY)).toBeNull();
  });

  it("a day ahead lists what falls due then; a day back lists what's still open and what was done", async () => {
    const tomorrow = await lead(asha, at(9, "2026-10-01"));
    const later = await lead(asha, at(9, "2026-10-01"));
    const late = await lead(asha, at(9, "2026-10-01"));
    await setFollowUp(
      t.db,
      asha,
      tomorrow.id,
      { nextAction: "Send deck", date: "2026-11-05" },
      at(9),
    );
    await setFollowUp(t.db, asha, later.id, { nextAction: "Call", date: "2026-11-07" }, at(9));
    await setFollowUp(
      t.db,
      asha,
      late.id,
      { nextAction: "Chase", date: "2026-11-02" },
      at(9, "2026-11-01"),
    );
    await t.db.insert(activity).values({
      personId: later.id,
      userId: asha.id,
      occurredAt: at(15, "2026-11-02"),
      type: "Meeting note",
      content: "Spoke briefly",
    });

    const ahead = await buildDay(t.db, asha, "2026-11-05", at(12));
    expect(ahead.ahead).toBe(true);
    expect(ahead.tasks.map((x) => [x.name, x.section])).toEqual([[tomorrow.fullName, "followup"]]);

    const back = await buildDay(t.db, asha, "2026-11-02", at(12));
    expect(back.ahead).toBe(false);
    expect(back.tasks.map((x) => [x.name, x.origin])).toEqual([[late.fullName, "followup"]]);
    expect(back.done.map((d) => [d.name, d.what])).toEqual([[later.fullName, "Note"]]);
  });
});

describe("Downloads follow the screen; logs show follow-ups (D-059)", () => {
  it("a download leaves out what's switched off on screen, else the saved choice", async () => {
    const { hiddenFor } = await import("./reports");
    const req = (q: string) => new Request(`https://hub.example/reports/x/pdf${q}`);
    expect(hiddenFor(req(""), ["activity"])).toEqual(["activity"]);
    expect(hiddenFor(req("?hide=pipeline,details,bogus"), ["activity"])).toEqual([
      "pipeline",
      "details",
    ]);
    expect(hiddenFor(req("?hide="), ["activity"])).toEqual([]);
  });

  it("What you logged shows each person's follow-up once, on their last log, editable by the owner", async () => {
    const { loggedOn } = await import("./today");
    const p = await lead(asha, at(9, "2026-10-01"));
    await quickLog(t.db, asha, p.id, { action: "messageSent" }, { now: at(10) });
    await quickLog(
      t.db,
      asha,
      p.id,
      { action: "callLogged", outcome: "No answer" },
      { now: at(11) },
    );
    await setFollowUp(t.db, asha, p.id, { nextAction: "Call again", date: "2026-11-06" }, at(12));
    const done = await loggedOn(t.db, asha, DAY);
    expect(done.map((d) => [d.what, d.followUp])).toEqual([
      ["Message sent · LinkedIn", null],
      ["Call · Call", { nextAction: "Call again", date: "2026-11-06", canEdit: true }],
    ]);
    // An Admin who logged on Asha's lead may change it too; another rep may not.
    await quickLog(t.db, admin, p.id, { action: "messageSent" }, { now: at(13) });
    expect((await loggedOn(t.db, admin, DAY))[0].followUp?.canEdit).toBe(true);
  });
});

describe("Next follow-up with each entry (D-059)", () => {
  it("logging a message with a follow-up date keeps a follow-up; it shows on that day", async () => {
    const p = await lead(asha, at(9, "2026-10-01"));
    await addEntry(
      t.db,
      asha,
      p.id,
      {
        from: "me",
        channel: "LinkedIn",
        at: at(10),
        text: "Hi, a quick question",
        followUpDate: "2026-11-05",
      },
      { now: at(10) },
    );
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect([row.nextAction, row.nextActionDate]).toEqual(["Follow up", "2026-11-05"]);
    const ahead = await buildDay(t.db, asha, "2026-11-05", at(12));
    expect(ahead.tasks.map((x) => x.name)).toEqual([p.fullName]);
    await expect(
      addEntry(
        t.db,
        asha,
        p.id,
        { from: "them", channel: "LinkedIn", at: at(11), text: "x", followUpDate: "2026-11-01" },
        { now: at(11) },
      ),
    ).rejects.toThrow("Pick today or a later follow-up date.");
  });
});
