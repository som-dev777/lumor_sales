import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, person, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { createPerson, personTimeline } from "./people";
import { forwardStage, quickLog, type QuickLog } from "./quicklog";

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
let rep2: Actor;
let admin: Actor;

beforeEach(async () => {
  t = await createTestDb();
  const a = await insertTestUser(t.db, { name: "Somnath", role: "Admin" });
  const r = await insertTestUser(t.db, { name: "Asha" });
  const r2 = await insertTestUser(t.db, { name: "Ravi" });
  admin = { id: a.id, role: "Admin", active: true };
  rep = { id: r.id, role: "User", active: true };
  rep2 = { id: r2.id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const newLead = (extra: Record<string, unknown> = {}) =>
  createPerson(
    t.db,
    rep,
    personSchema.parse({
      fullName: "Priya Sharma",
      linkedinUrl: "linkedin.com/in/priya-s",
      stage: "Prospect",
      ...extra,
    }),
  );

// Friday 16 Oct 2026, 11:30 IST
const day = (d: number, hour = 6) => new Date(Date.UTC(2026, 9, d, hour, 0));

async function log(personId: string, l: QuickLog, now: Date, actor: Actor = rep) {
  return (await quickLog(t.db, actor, personId, l, { now })).person;
}

describe("quick-log, v2 stages (F15)", () => {
  it("Request sent → Contacted, check acceptance after the withdraw days; the note is recorded", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "requestSent", withNote: true }, day(16))).toMatchObject({
      stage: "Contacted",
      nextAction: "Check acceptance",
      nextActionDate: "2026-10-30",
    });
    const [row] = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(row).toMatchObject({ type: "Request sent", requestNote: true });
  });

  it("Accepted → Connected, Message 1 at least 1 day later (guardrail 1)", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "accepted" }, day(16))).toMatchObject({
      stage: "Connected",
      nextAction: "Send Message 1",
      nextActionDate: "2026-10-17",
    });
  });

  it("Message sent records the channel and template; no fixed follow-up dates any more", async () => {
    const [tpl] = await t.db
      .insert(template)
      .values({
        name: "Opener B",
        type: "Official",
        ownerId: admin.id,
        purpose: "Message 1",
        level: "Any",
        version: "B",
        body: "Hi {Name}",
      })
      .returning();
    const p = await newLead();
    const after = await log(
      p.id,
      { action: "messageSent", channel: "Email", templateId: tpl.id },
      day(16),
    );
    expect(after).toMatchObject({
      stage: "Contacted",
      nextAction: null,
      openerTemplateId: tpl.id,
      openerTemplateVersion: "B",
    });
    const [a] = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(a).toMatchObject({ type: "Message sent", channel: "Email", templateVersion: "B" });
    await log(p.id, { action: "messageSent", channel: "InMail" }, day(20));
    expect((await personTimeline(t.db, p.id))[0].type).toBe("InMail sent");
  });

  it("calls record the outcome; only a connected call moves Prospect to Contacted", async () => {
    const p = await newLead();
    expect((await log(p.id, { action: "callLogged", outcome: "No answer" }, day(16))).stage).toBe(
      "Prospect",
    );
    expect((await log(p.id, { action: "callLogged", outcome: "Connected" }, day(19))).stage).toBe(
      "Contacted",
    );
    const rows = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(rows.map((r) => [r.type, r.channel, r.callOutcome])).toEqual([
      ["Call", "Call", "No answer"],
      ["Call", "Call", "Connected"],
    ]);
  });

  it("Got a reply → Replied, respond today; never moves a lead backwards", async () => {
    const p = await newLead({ stage: "Meeting scheduled" });
    expect(await log(p.id, { action: "gotReply", replyType: "Interested" }, day(17))).toMatchObject(
      { stage: "Meeting scheduled", nextAction: "Respond" },
    );
    const q = await newLead({ linkedinUrl: "linkedin.com/in/other-q" });
    expect((await log(q.id, { action: "gotReply", replyType: null }, day(17))).stage).toBe(
      "Replied",
    );
  });

  it("Meeting booked → Meeting scheduled; Meeting held → Meeting done; Proposal sent", async () => {
    const p = await newLead();
    expect(
      await log(p.id, { action: "meetingBooked", meetingDate: "2026-10-22" }, day(17)),
    ).toMatchObject({
      stage: "Meeting scheduled",
      nextAction: "Hold meeting",
      nextActionDate: "2026-10-22",
    });
    expect(await log(p.id, { action: "meetingHeld" }, day(22))).toMatchObject({
      stage: "Meeting done",
      nextAction: "Send recap",
    });
    expect(await log(p.id, { action: "proposalSent" }, day(23))).toMatchObject({
      stage: "Proposal sent",
      nextActionDate: "2026-10-26",
    });
    const [a] = await personTimeline(t.db, p.id);
    expect(a).toMatchObject({ type: "Stage change", content: "Meeting done → Proposal sent" });
  });

  it("Mark converted → Paid; Mark lost needs the reason", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "markConverted" }, day(30))).toMatchObject({
      stage: "Paid",
      converted: true,
      convertedDate: "2026-10-30",
    });
    const q = await newLead({ linkedinUrl: "linkedin.com/in/lost-q" });
    expect(await log(q.id, { action: "markLost", lostReason: "No budget" }, day(18))).toMatchObject(
      { stage: "Lost", lostReason: "No budget" },
    );
  });

  it("stages only move forward on outreach; closed leads stay closed", () => {
    expect(forwardStage("Prospect", "Contacted")).toBe("Contacted");
    expect(forwardStage("Replied", "Contacted")).toBe("Replied");
    expect(forwardStage("Lost", "Replied")).toBe("Lost");
    expect(forwardStage("Paid", "Replied")).toBe("Paid");
  });
});

describe("quick-log rules", () => {
  it("Users can't log on someone else's lead; Admins can", async () => {
    const p = await newLead();
    await expect(log(p.id, { action: "accepted" }, day(16), rep2)).rejects.toThrow(PermissionError);
    await log(p.id, { action: "accepted" }, day(16), admin);
  });

  it("Do not contact blocks outreach but not replies", async () => {
    const p = await newLead({ doNotContact: true, dncReason: "Asked us to stop" });
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(row.dncDate).not.toBeNull();
    await expect(log(p.id, { action: "messageSent" }, day(16))).rejects.toThrow(/Do not contact/);
    await expect(log(p.id, { action: "requestSent" }, day(16))).rejects.toThrow(/Do not contact/);
    await log(p.id, { action: "gotReply", replyType: "Not interested" }, day(17));
  });

  it("IST: 9pm UTC on the 16th is the 17th in India", async () => {
    const p = await newLead();
    expect(
      (await log(p.id, { action: "accepted" }, new Date(Date.UTC(2026, 9, 16, 21, 0))))
        .nextActionDate,
    ).toBe("2026-10-18");
  });

  it("a note is kept with the activity, and each log is audited", async () => {
    const p = await newLead();
    await quickLog(
      t.db,
      rep,
      p.id,
      { action: "gotReply", replyType: "Not now" },
      { now: day(17), note: "Says try again in January" },
    );
    const [a] = await personTimeline(t.db, p.id);
    expect(a.content).toBe("Says try again in January");
    const entry = (await t.db.select().from(auditLog)).at(-1)!;
    expect(entry).toMatchObject({ entityType: "Person", action: "Updated" });
    expect(entry.changes).toMatchObject({ stage: { before: "Prospect", after: "Replied" } });
  });
});
