// D-063: a report counts everything on the date it was registered for. Something logged today
// for 13 Nov is in 13 Nov's report, never today's. Demos scheduled include a demo date agreed in
// the conversation; Replies and outcomes and the events' counts are gone.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { person } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { NUMBER_SECTIONS, PIPELINE_COLUMNS, headlines } from "@/lib/report-columns";
import { REPORT_SECTIONS } from "@/lib/report-shape";
import { personSchema } from "@/lib/validation/leads";
import { addEntry } from "./conversation";
import { createPerson } from "./leads/people";
import { mentionsDemo } from "./report-events";
import { buildReport } from "./reports";

const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00+05:30`);
const TODAY = "2026-11-17";
const EARLIER = "2026-11-13";
const span = (d: string) => ({ from: d, to: d });

let t: Awaited<ReturnType<typeof createTestDb>>;
let asha: Actor;
let n = 0;

beforeEach(async () => {
  t = await createTestDb();
  await insertTestUser(t.db, { name: "Somnath", role: "Admin" });
  asha = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
});
afterEach(() => t.cleanup());

async function lead(addedOn: string) {
  n += 1;
  const p = await createPerson(
    t.db,
    asha,
    personSchema.parse({
      fullName: `Dev Dates${n}`,
      linkedinUrl: `linkedin.com/in/dates-${n}`,
      companyName: `Dates Co ${n}`,
      stage: "Prospect",
    }),
  );
  await t.db
    .update(person)
    .set({ createdAt: at(addedOn, 9) })
    .where(eq(person.id, p.id));
  return p;
}

/** Logs a conversation entry for `on`, typed in on `typedOn`. */
const say = (personId: string, from: "me" | "them", text: string, on: string, typedOn = TODAY) =>
  addEntry(
    t.db,
    asha,
    personId,
    {
      from,
      channel: "LinkedIn",
      at: at(on, 11),
      text,
      replyType: null,
      replyBy: null,
      followUpDate: null,
    },
    { now: at(typedOn, 15) },
  );

const report = (day: string) =>
  buildReport(t.db, { scope: "person", userId: asha.id }, span(day), at(day, 18));
const listed = (r: Awaited<ReturnType<typeof report>>) =>
  r.events!.companies.flatMap((c) => c.people.map((p) => p.name));

describe("the date registered is the only truth (D-063)", () => {
  it("a person added today with a first message registered for the 13th is the 13th's new outreach", async () => {
    const p = await lead(TODAY);
    await say(p.id, "me", "Hi Dev, how do you run your studies?", EARLIER);

    const today = await report(TODAY);
    expect(today.pipeline!.total).toMatchObject({ newOutreach: 0, followUps: 0 });
    expect(listed(today)).not.toContain(p.fullName);

    const then = await report(EARLIER);
    expect(then.pipeline!.total).toMatchObject({ newOutreach: 1, followUps: 0 });
    const shown = then
      .events!.companies.flatMap((c) => c.people)
      .find((x) => x.name === p.fullName)!;
    expect(shown.isNew).toBe(true);
    expect(shown.facts.slice(0, 2)).toEqual([
      "New outreach: first contacted 13 Nov",
      "On the day: 1 message or call from us",
    ]);
  });

  it("a person added today and not contacted yet is today's new outreach", async () => {
    const p = await lead(TODAY);
    const r = await report(TODAY);
    expect(r.pipeline!.total.newOutreach).toBe(1);
    expect(listed(r)).toContain(p.fullName);
  });

  it("a follow-up and a reply registered for the 13th count on the 13th, not today", async () => {
    const p = await lead("2026-11-01");
    await say(p.id, "me", "Hi Dev, how do you run your studies?", "2026-11-02", "2026-11-02");
    await say(p.id, "me", "Sharing a short case study on panels.", EARLIER);
    await say(p.id, "them", "Thanks, this is useful.", EARLIER);

    const today = await report(TODAY);
    expect(today.pipeline!.total).toMatchObject({ newOutreach: 0, followUps: 0, replied: 0 });
    expect(listed(today)).toEqual([]);

    const then = await report(EARLIER);
    expect(then.pipeline!.total).toMatchObject({ newOutreach: 0, followUps: 1, replied: 1 });
    const facts = then.events!.companies[0].people[0].facts;
    expect(facts[0]).toBe("On the day: 1 message or call from us, 1 reply");
    // Nothing from before the period in the facts.
    expect(facts.join(" ")).not.toContain("2 Nov");
  });

  it("a demo date agreed in the conversation counts as Demos scheduled, even tentative", async () => {
    const p = await lead("2026-11-01");
    await say(p.id, "me", "Hi Dev, how do you run your studies?", "2026-11-02", "2026-11-02");
    await say(p.id, "them", "Interesting. Could we do a demo on Thursday at 3 pm?", TODAY);
    const quiet = await lead("2026-11-01");
    await say(quiet.id, "me", "Would a demo help?", TODAY);

    const r = await report(TODAY);
    expect(r.pipeline!.total.demosScheduled).toBe(1);
    expect(headlines(r).find((h) => h.label === "Demos scheduled")!.value).toBe(1);
    const people = r.events!.companies.flatMap((c) => c.people);
    const demo = people.find((x) => x.name === p.fullName)!;
    expect(demo.demoScheduled).toBe(true);
    expect(demo.facts).toContain("Demo scheduled");
    expect(people.find((x) => x.name === quiet.fullName)!.demoScheduled).toBe(false);
    // The same talk on another day isn't in the 13th's report.
    expect((await report(EARLIER)).pipeline!.total.demosScheduled).toBe(0);
  });

  it("spots a demo with a day or time, not a demo offer with none", () => {
    expect(mentionsDemo(["Happy to do the demo tomorrow"])).toBe(true);
    expect(mentionsDemo(["Let's do a walkthrough on 20 Nov"])).toBe(true);
    expect(mentionsDemo(["Maybe a demo early next week?"])).toBe(true);
    expect(mentionsDemo(["Would a demo help?"])).toBe(false);
    expect(mentionsDemo(["See you Thursday", null])).toBe(false);
  });
});

describe("the simpler report (D-063)", () => {
  it("has no Replies and outcomes, no events counts, and New outreach (people added) as one column", async () => {
    expect(NUMBER_SECTIONS.map((s) => s.key)).toEqual(["activity"]);
    expect(REPORT_SECTIONS.map((s) => s.key)).not.toContain("outcomes");
    expect(PIPELINE_COLUMNS.map((c) => c.label)).toEqual([
      "New outreach (people added)",
      "Companies added",
      "Follow-ups",
      "Responded",
      "Demos scheduled",
      "Converted",
    ]);
    await lead(TODAY);
    const r = await report(TODAY);
    expect(r.version).toBe(5);
    expect(r.events!.counts).toBeUndefined();
    expect(headlines(r).map((h) => h.label)).toEqual([
      "New outreach (people added)",
      "Follow-ups",
      "Responded",
      "Demos scheduled",
      "Demos conducted",
    ]);
  });
});
