import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, playbookSettings, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { createPerson, personTimeline } from "./people";
import { nextFollowUp, quickLog, type QuickLog } from "./quicklog";

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

const newLead = (url = "linkedin.com/in/priya-s") =>
  createPerson(
    t.db,
    rep,
    personSchema.parse({ fullName: "Priya Sharma", linkedinUrl: url, stage: "Prospect" }),
  );

// Friday 16 Oct 2026, 11:30 IST
const day = (d: number, hour = 6) => new Date(Date.UTC(2026, 9, d, hour, 0));

async function log(personId: string, l: QuickLog, now: Date, actor: Actor = rep) {
  return (await quickLog(t.db, actor, personId, l, { now })).person;
}

describe("quick-log table (PRD)", () => {
  it("Request sent → Request sent, check acceptance in 14 days", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "requestSent" }, day(16))).toMatchObject({
      stage: "Request sent",
      sequenceStep: "Request sent",
      nextAction: "Check acceptance",
      nextActionDate: "2026-10-30",
    });
  });

  it("Accepted → Connected, step Message 1, send Message 1 today", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "accepted" }, day(16))).toMatchObject({
      stage: "Connected",
      sequenceStep: "Message 1",
      nextAction: "Send Message 1",
      nextActionDate: "2026-10-16",
    });
  });

  it("Message 1 then three follow-ups, all counted from the Message 1 date (4, 7, 10)", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "message1Sent" }, day(16))).toMatchObject({
      stage: "Messaged",
      sequenceStep: "Message 1",
      nextAction: "Send Follow-up 1",
      nextActionDate: "2026-10-20",
    });
    // Follow-up 1 sent a day late: next dates still count from Message 1 (16 Oct).
    expect(await log(p.id, { action: "followUpSent" }, day(21))).toMatchObject({
      sequenceStep: "Follow-up 1",
      nextAction: "Send Follow-up 2",
      nextActionDate: "2026-10-23",
    });
    expect(await log(p.id, { action: "followUpSent" }, day(23))).toMatchObject({
      sequenceStep: "Follow-up 2",
      nextAction: "Send Break-up",
      nextActionDate: "2026-10-26",
    });
    expect(await log(p.id, { action: "followUpSent" }, day(26))).toMatchObject({
      sequenceStep: "Nurture",
      nextAction: "Nurture",
      nextActionDate: null,
    });
    await expect(log(p.id, { action: "followUpSent" }, day(27))).rejects.toThrow(
      /No follow-up is due/,
    );
    const contents = (await personTimeline(t.db, p.id)).map((a) => a.content).reverse();
    expect(contents).toEqual(["Message 1", "Follow-up 1", "Follow-up 2", "Break-up"]);
  });

  it("follow-up delays come from Playbook Settings", async () => {
    await t.db
      .update(playbookSettings)
      .set({ followUp1DelayDays: 3 })
      .where(eq(playbookSettings.id, 1));
    const p = await newLead();
    expect((await log(p.id, { action: "message1Sent" }, day(16))).nextActionDate).toBe(
      "2026-10-19",
    );
  });

  it("Got a reply → Replied, stopped, respond today; reply type saved", async () => {
    const p = await newLead();
    await log(p.id, { action: "message1Sent" }, day(16));
    expect(await log(p.id, { action: "gotReply", replyType: "Interested" }, day(17))).toMatchObject(
      {
        stage: "Replied",
        sequenceStep: "Stopped (replied)",
        nextAction: "Respond",
        nextActionDate: "2026-10-17",
      },
    );
    const [reply] = await personTimeline(t.db, p.id);
    expect(reply).toMatchObject({ type: "Reply received", replyType: "Interested" });
    expect(nextFollowUp("Stopped (replied)")).toBeNull();
  });

  it("Demo booked → hold demo on the demo date; Demo held → Demo done, send recap today", async () => {
    const p = await newLead();
    expect(
      await log(p.id, { action: "demoBooked", demoDate: "2026-10-22" }, day(17)),
    ).toMatchObject({
      stage: "Demo booked",
      sequenceStep: "Stopped (replied)",
      nextAction: "Hold demo",
      nextActionDate: "2026-10-22",
    });
    expect(await log(p.id, { action: "demoHeld" }, day(22))).toMatchObject({
      stage: "Demo done",
      sequenceStep: "Stopped (replied)",
      nextAction: "Send recap",
      nextActionDate: "2026-10-22",
    });
  });

  it("Mark converted → Paid, converted today, no next action", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "markConverted" }, day(30))).toMatchObject({
      stage: "Paid",
      converted: true,
      convertedDate: "2026-10-30",
      nextAction: null,
      nextActionDate: null,
    });
    expect((await personTimeline(t.db, p.id))[0].type).toBe("Deal update");
  });

  it("Mark lost → Lost with the reason, stopped, no next action", async () => {
    const p = await newLead();
    expect(await log(p.id, { action: "markLost", lostReason: "No budget" }, day(18))).toMatchObject(
      {
        stage: "Lost",
        lostReason: "No budget",
        sequenceStep: "Stopped (replied)",
        nextAction: null,
      },
    );
    expect((await personTimeline(t.db, p.id))[0]).toMatchObject({
      type: "Stage change",
      content: "Prospect → Lost (No budget)",
    });
  });
});

describe("quick-log rules", () => {
  it("Users can't log on someone else's lead; Admins can", async () => {
    const p = await newLead();
    await expect(log(p.id, { action: "accepted" }, day(16), rep2)).rejects.toThrow(PermissionError);
    await log(p.id, { action: "accepted" }, day(16), admin);
  });

  it("IST: 9pm UTC on the 16th is the 17th in India", async () => {
    const p = await newLead();
    expect(
      (await log(p.id, { action: "accepted" }, new Date(Date.UTC(2026, 9, 16, 21, 0))))
        .nextActionDate,
    ).toBe("2026-10-17");
  });

  it("Message 1 records the template and its version, and sets the opener", async () => {
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
    const updated = await log(p.id, { action: "message1Sent", templateId: tpl.id }, day(16));
    expect(updated).toMatchObject({ openerTemplateId: tpl.id, openerTemplateVersion: "B" });
    const [a] = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(a).toMatchObject({ templateId: tpl.id, templateVersion: "B" });
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
