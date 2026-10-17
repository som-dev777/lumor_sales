import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { playbookSettingsSchema, productFactsSchema } from "@/lib/validation/settings";
import { createPerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import {
  factsMissing,
  getPlaybookSettings,
  getProductFacts,
  savePlaybookSettings,
  saveProductFacts,
} from "./settings";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
beforeEach(async () => {
  t = await createTestDb();
  const a = await insertTestUser(t.db, { name: "Somnath", role: "Admin" });
  const r = await insertTestUser(t.db, { name: "Asha" });
  admin = { id: a.id, role: "Admin", active: true };
  rep = { id: r.id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const facts = (over: Record<string, unknown> = {}) =>
  productFactsSchema.parse({
    whatLumorDoes: "AI research assistant",
    liveFeatures: "Survey analysis",
    calendarLink: "https://cal.com/lumor/demo",
    ...over,
  });
const playbook = (over: Record<string, unknown> = {}) =>
  playbookSettingsSchema.parse({
    withdrawAfterDays: 14,
    dailyConnectionTarget: 20,
    dailyMessageTarget: 10,
    staleLeadDays: 21,
    msgAfterAcceptMinDays: 1,
    msgAfterAcceptMaxDays: 3,
    minGapDays: 3,
    maxFollowUps: 4,
    weeklyTouchLimit: 2,
    outreachMaxDays: 30,
    outreachMaxDaysSenior: 45,
    nurtureDays: 60,
    replyDeadlineMinDays: 1,
    replyDeadlineMaxDays: 10,
    ...over,
  });

describe("Product Facts (F12)", () => {
  it("starts empty; an Admin saves, and it's audited with the changed fields", async () => {
    expect(factsMissing(await getProductFacts(t.db))).toBe(true);
    await saveProductFacts(t.db, admin, facts());
    const saved = await getProductFacts(t.db);
    expect(saved).toMatchObject({ whatLumorDoes: "AI research assistant", editorName: "Somnath" });
    expect(saved.lastEditedAt).toBeInstanceOf(Date);
    expect(factsMissing(saved)).toBe(false);
    const [entry] = await t.db.select().from(auditLog);
    expect(entry).toMatchObject({
      entityType: "Product Facts",
      action: "Updated",
      userId: admin.id,
    });
    expect(entry.changes).toMatchObject({
      liveFeatures: { before: null, after: "Survey analysis" },
    });
    expect(entry.changes).not.toHaveProperty("lastEditedAt");
  });

  it("saving with nothing changed writes no audit entry", async () => {
    await saveProductFacts(t.db, admin, facts());
    await saveProductFacts(t.db, admin, facts());
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });

  it("Users can read but not edit", async () => {
    await expect(saveProductFacts(t.db, rep, facts())).rejects.toThrow(PermissionError);
    expect((await getProductFacts(t.db)).whatLumorDoes).toBeNull();
  });

  it("the calendar link must be https; text is limited to 5,000 characters", () => {
    expect(productFactsSchema.safeParse({ calendarLink: "http://cal.com/x" }).success).toBe(false);
    expect(productFactsSchema.safeParse({ calendarLink: "cal.com/x" }).success).toBe(false);
    expect(productFactsSchema.parse({ calendarLink: "" }).calendarLink).toBeNull();
    expect(productFactsSchema.safeParse({ liveFeatures: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("Playbook Settings (F13)", () => {
  it("an Admin changes a guardrail value; the next quick-log uses it; audited", async () => {
    await savePlaybookSettings(t.db, admin, playbook({ msgAfterAcceptMinDays: 2 }));
    expect((await getPlaybookSettings(t.db)).msgAfterAcceptMinDays).toBe(2);
    const [entry] = await t.db.select().from(auditLog);
    expect(entry.changes).toEqual({ msgAfterAcceptMinDays: { before: 1, after: 2 } });

    const p = await createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: "Priya",
        linkedinUrl: "linkedin.com/in/priya-x",
        stage: "Prospect",
      }),
    );
    const { person } = await quickLog(
      t.db,
      rep,
      p.id,
      { action: "accepted" },
      { now: new Date(Date.UTC(2026, 9, 16, 6)) },
    );
    expect(person.nextActionDate).toBe("2026-10-18");
  });

  it("Users are refused", async () => {
    await expect(savePlaybookSettings(t.db, rep, playbook())).rejects.toThrow(PermissionError);
  });

  it("minimums can't exceed maximums; values stay within their limits", () => {
    const bad = (over: Record<string, unknown>) =>
      playbookSettingsSchema.safeParse({ ...playbook(), ...over });
    expect(bad({ msgAfterAcceptMaxDays: 0 }).error?.issues[0]).toMatchObject({
      path: ["msgAfterAcceptMaxDays"],
      message: "Can't be less than the minimum.",
    });
    expect(bad({ outreachMaxDaysSenior: 20 }).success).toBe(false);
    expect(bad({ replyDeadlineMaxDays: 0 }).success).toBe(false);
    expect(bad({ minGapDays: 0 }).success).toBe(false);
    expect(bad({ staleLeadDays: 366 }).success).toBe(false);
    expect(bad({ dailyConnectionTarget: 2.5 }).success).toBe(false);
    expect(bad({ dailyConnectionTarget: "25" }).success).toBe(true);
  });
});
