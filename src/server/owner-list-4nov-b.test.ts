// The owner's second list of 4 November (D-055): anything logged clears a follow-up and its
// backlog, Follow-up from the conversation, sorting and filters on Companies and People, and
// voice typing.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, person } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { companySchema, personSchema } from "@/lib/validation/leads";
import { FAKE_TRANSCRIPT, recordingProblem, transcribe } from "./ai/transcribe";
import { createCompany, listCompanies, sortCompanies } from "./leads/companies";
import { stampFollowUp } from "./leads/follow-up";
import { createPerson, listPeople } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import {
  addFollowUp,
  backlogByPerson,
  buildToday,
  classifyLead,
  setFollowUp,
  type LastActivity,
} from "./today";

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
let other: Actor;
const NOW = new Date("2026-11-04T06:30:00Z"); // Wed 4 Nov, 12:00 IST
const on = (d: string) => new Date(`${d}T06:30:00Z`);
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(async () => {
  t = await createTestDb();
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Bina" })).id, role: "User", active: true };
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

let n = 0;
const lead = (fullName: string, extra: Record<string, unknown> = {}, by = rep) => {
  n += 1;
  return createPerson(
    t.db,
    by,
    personSchema.parse({
      fullName,
      linkedinUrl: `linkedin.com/in/d55-${n}`,
      companyName: "Test Co",
      stage: "Connected",
      ...extra,
    }),
  );
};
const today = async (now = NOW) =>
  (await buildToday(t.db, rep, now)).tasks.map((x) => [x.name, x.section]);

describe("anything logged clears the follow-up and its backlog (D-055)", () => {
  const facts = {
    snoozedUntil: null,
    nextAction: "Call",
    nextActionDate: "2026-11-01",
    awaitingReplyUntil: null,
    nudgeCount: 0,
    nurtureUntil: null,
    stage: "Connected",
    converted: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    nextActionSetAt: new Date("2026-10-30T06:00:00Z"),
  };
  const classify = (last?: LastActivity, over = {}) =>
    classifyLead({ ...facts, ...over }, last, null, "2026-11-04", "2026-10-20")?.section ?? null;

  it("a call on or after the date, logged after the follow-up was set, clears it", () => {
    expect(classify()).toBe("followup"); // a backlog (due before today) on Today
    expect(classify({ type: "Call", at: NOW, recordedAt: NOW })).toBeNull();
    // On the due date itself counts too.
    expect(classify({ type: "Message sent", at: on("2026-11-01") })).toBeNull();
    // Before the date doesn't: that was earlier work.
    expect(classify({ type: "Call", at: on("2026-10-31") })).toBe("followup");
    // Logged before the follow-up was set (then the date set again) doesn't either.
    expect(
      classify(
        { type: "Call", at: NOW, recordedAt: new Date("2026-11-04T06:00:00Z") },
        { nextActionSetAt: new Date("2026-11-04T06:10:00Z"), nextActionDate: "2026-11-04" },
      ),
    ).toBe("followup");
    // A call logged now but timed a minute earlier than a note written with the follow-up still
    // counts: what matters is the latest thing logged.
    expect(
      classify(
        {
          type: "Meeting note",
          at: new Date("2026-11-04T06:10:00Z"),
          recordedAt: new Date("2026-11-04T06:10:00Z"),
          logged: {
            at: new Date("2026-11-04T06:09:00Z"),
            recordedAt: new Date("2026-11-04T06:12:00Z"),
          },
        },
        { nextActionSetAt: new Date("2026-11-04T06:10:00Z"), nextActionDate: "2026-11-04" },
      ),
    ).toBeNull();
  });

  it("a follow-up after the reply-by date clears the nudge", () => {
    const deadline = { awaitingReplyUntil: "2026-11-02", nextActionDate: null };
    expect(classify({ type: "Message sent", at: on("2026-10-30") }, deadline)).toBe("deadline");
    expect(classify({ type: "Call", at: NOW }, deadline)).toBeNull();
    // A day later, with no follow-up date, they're asked for one: no longer a nudge.
    expect(classify({ type: "Call", at: on("2026-11-03") }, deadline)).toBe("nodate");
  });

  it("worked on today: not asked for a date until tomorrow", () => {
    const noDate = { nextAction: null, nextActionDate: null };
    expect(classify({ type: "Message sent", at: NOW }, noDate)).toBeNull();
    expect(classify({ type: "Message sent", at: on("2026-11-03") }, noDate)).toBe("nodate");
  });

  it("from the person's page: log a call and the backlog leaves Today and People", async () => {
    const p = await lead("Backlog Lead");
    await setFollowUp(
      t.db,
      rep,
      p.id,
      { nextAction: "Call them", date: "2026-11-01" },
      on("2026-11-01"),
    );
    expect(await today()).toEqual([["Backlog Lead", "backlog"]]);
    expect((await backlogByPerson(t.db, NOW)).has(p.id)).toBe(true);
    await tick();
    // A call keeps the old next action and date, but it's done now.
    await quickLog(t.db, rep, p.id, { action: "callLogged", outcome: "No answer" }, { now: NOW });
    expect(await today()).toEqual([]);
    expect((await backlogByPerson(t.db, NOW)).has(p.id)).toBe(false);
    // A new follow-up set afterwards counts from then: it shows on its day.
    await tick();
    await setFollowUp(t.db, rep, p.id, { nextAction: "Call again", date: "2026-11-04" }, NOW);
    expect(await today()).toEqual([["Backlog Lead", "followup"]]);
  });

  it("the next action date's set time follows real changes only", () => {
    const before = { nextAction: "Call", nextActionDate: "2026-11-01" };
    const at = new Date();
    expect(stampFollowUp(before, { nextAction: "Call", nextActionDate: "2026-11-01" }, at)).toEqual(
      {},
    );
    expect(stampFollowUp(before, { nextActionDate: "2026-11-02" }, at)).toEqual({
      nextActionSetAt: at,
    });
    expect(stampFollowUp(before, { nextAction: null }, at)).toEqual({ nextActionSetAt: at });
    expect(stampFollowUp(before, {}, at)).toEqual({});
  });
});

describe("Follow-up from the conversation (D-055)", () => {
  it("sets the next action and date, adds the note, and shows on Today that day", async () => {
    const p = await lead("Follow Lead");
    const after = await addFollowUp(
      t.db,
      rep,
      p.id,
      {
        nextAction: "Send the case study",
        date: "2026-11-06",
        note: "Asked for retail examples",
        channel: "Email",
      },
      NOW,
    );
    expect(after.nextAction).toBe("Send the case study");
    expect(after.nextActionDate).toBe("2026-11-06");
    const notes = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(notes.map((x) => [x.type, x.channel, x.content])).toEqual([
      [
        "Meeting note",
        "Email",
        "Follow-up on 6 Nov 2026: Send the case study. Asked for retail examples",
      ],
    ]);
    expect(await today()).toEqual([]);
    // The note written with it doesn't count as doing it.
    expect(await today(on("2026-11-06"))).toEqual([["Follow Lead", "followup"]]);
    expect(await today(on("2026-11-07"))).toEqual([["Follow Lead", "backlog"]]);
  });

  it("without a note only the follow-up is saved; dates in the past and other owners are refused", async () => {
    const p = await lead("Plain Lead");
    await addFollowUp(
      t.db,
      rep,
      p.id,
      { nextAction: null, date: "2026-11-04", note: null, channel: "LinkedIn" },
      NOW,
    );
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect([row.nextAction, row.nextActionDate]).toEqual(["Follow up", "2026-11-04"]);
    expect(await t.db.select().from(activity).where(eq(activity.personId, p.id))).toHaveLength(0);
    await expect(
      addFollowUp(
        t.db,
        rep,
        p.id,
        { nextAction: "x", date: "2026-11-03", note: null, channel: "LinkedIn" },
        NOW,
      ),
    ).rejects.toThrow("Pick today or a later date.");
    await expect(
      addFollowUp(
        t.db,
        other,
        p.id,
        { nextAction: "x", date: "2026-11-05", note: "n", channel: "LinkedIn" },
        NOW,
      ),
    ).rejects.toThrow(PermissionError);
  });
});

describe("sorting and filters (D-055)", () => {
  it("Companies: A–Z by default; by activity, added date, backlog and people", () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const list = [
      {
        name: "beta",
        createdAt: d("2026-10-02"),
        lastActivityAt: d("2026-11-01"),
        backlog: 0,
        people: 3,
      },
      { name: "Alpha", createdAt: d("2026-10-05"), lastActivityAt: null, backlog: 2, people: 1 },
      {
        name: "Gamma",
        createdAt: d("2026-10-01"),
        lastActivityAt: d("2026-11-03"),
        backlog: 1,
        people: 0,
      },
    ];
    const names = (s: Parameters<typeof sortCompanies>[1]) =>
      sortCompanies(list, s).map((c) => c.name);
    expect(names("name")).toEqual(["Alpha", "beta", "Gamma"]);
    expect(names("name_desc")).toEqual(["Gamma", "beta", "Alpha"]);
    expect(names("activity")).toEqual(["Gamma", "beta", "Alpha"]); // never active goes last
    expect(names("activity_old")).toEqual(["beta", "Gamma", "Alpha"]);
    expect(names("created")).toEqual(["Alpha", "beta", "Gamma"]);
    expect(names("created_old")).toEqual(["Gamma", "beta", "Alpha"]);
    expect(names("backlog")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(names("people")).toEqual(["beta", "Alpha", "Gamma"]);
  });

  it("Companies: Needs action filters", async () => {
    await createCompany(t.db, rep, companySchema.parse({ name: "Empty Co", status: "Target" }));
    const busy = await createCompany(
      t.db,
      rep,
      companySchema.parse({ name: "Busy Co", status: "Target" }),
    );
    const p = await lead("Busy Person", { companyName: "Busy Co" });
    await quickLog(t.db, rep, p.id, { action: "messageSent" }, { now: on("2026-11-02") });
    const names = async (show: "backlog" | "quiet" | "recent" | "nopeople") =>
      (await listCompanies(t.db, { show }, { now: NOW, backlog: new Map([[busy.id, 1]]) })).map(
        (c) => c.name,
      );
    expect(await names("recent")).toEqual(["Busy Co"]);
    expect(await names("quiet")).toEqual(["Empty Co"]);
    expect(await names("nopeople")).toEqual(["Empty Co"]);
    expect(await names("backlog")).toEqual(["Busy Co"]);
    const [row] = await listCompanies(t.db, { q: "busy" }, { now: NOW });
    expect(row.lastActivityAt?.toISOString()).toBe(on("2026-11-02").toISOString());
  });

  it("People: A–Z by default; recent activity first; activity and plan filters", async () => {
    const z = await lead("Zara Quiet");
    const b = await lead("Bela Busy");
    await lead("Mona Never");
    await t.db.insert(activity).values([
      { personId: z.id, userId: rep.id, occurredAt: on("2026-09-01"), type: "Message sent" },
      {
        personId: b.id,
        userId: rep.id,
        occurredAt: on("2026-11-03"),
        type: "Call",
        channel: "Call",
      },
    ]);
    const names = async (f: Parameters<typeof listPeople>[1]) =>
      (await listPeople(t.db, f, { now: NOW })).rows.map((r) => r.fullName);
    expect(await names({})).toEqual(["Bela Busy", "Mona Never", "Zara Quiet"]);
    expect(await names({ sort: "name_desc" })).toEqual(["Zara Quiet", "Mona Never", "Bela Busy"]);
    expect(await names({ sort: "activity" })).toEqual(["Bela Busy", "Zara Quiet", "Mona Never"]);
    expect(await names({ sort: "activity_old" })).toEqual([
      "Zara Quiet",
      "Bela Busy",
      "Mona Never",
    ]);
    expect(await names({ activity: "recent" })).toEqual(["Bela Busy"]);
    expect(await names({ activity: "quiet" })).toEqual(["Mona Never", "Zara Quiet"]);
    expect(await names({ activity: "never" })).toEqual(["Mona Never"]);
    expect(await names({ plan: "on" })).toEqual([]);
    expect(await names({ plan: "off" })).toHaveLength(3);
    expect(await names({ sort: "backlog", backlogIds: [z.id] })).toEqual([
      "Zara Quiet",
      "Bela Busy",
      "Mona Never",
    ]);
  });
});

describe("voice typing (D-055)", () => {
  it("checks the recording and answers with a stand-in in the browser tests", async () => {
    expect(recordingProblem(null)).toBe("Nothing was recorded. Try again.");
    expect(recordingProblem(new Blob([]))).toBe("Nothing was recorded. Try again.");
    expect(recordingProblem(new Blob(["x"], { type: "text/plain" }))).toBe(
      "That isn't a sound recording.",
    );
    expect(
      recordingProblem(new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "audio/webm" })),
    ).toBe("That recording is too long. Keep it under 3 minutes.");
    const ok = new Blob(["sound"], { type: "audio/webm" });
    expect(recordingProblem(ok)).toBeNull();
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("DATABASE_URL", "file:test.db");
    expect(await transcribe(ok)).toBe(FAKE_TRANSCRIPT);
    vi.stubEnv("AI_FAKE", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(transcribe(ok)).rejects.toThrow("AI isn't set up yet");
  });
});
