import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { calendarLinkSchema } from "@/lib/validation/ai-resources";
import { playbookSettingsSchema } from "@/lib/validation/settings";
import { createPerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import {
  getCalendarLink,
  getPlaybookSettings,
  saveCalendarLink,
  savePlaybookSettings,
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

describe("calendar link (F20)", () => {
  it("Admins set it; it's audited; Users are refused; it must be https", async () => {
    expect((await getCalendarLink(t.db)).calendarLink).toBeNull();
    await saveCalendarLink(t.db, admin, "https://cal.com/lumor/demo");
    expect(await getCalendarLink(t.db)).toMatchObject({
      calendarLink: "https://cal.com/lumor/demo",
      editorName: "Somnath",
    });
    const [entry] = await t.db.select().from(auditLog);
    expect(entry).toMatchObject({ entityType: "Calendar link", action: "Updated" });
    await expect(saveCalendarLink(t.db, rep, null)).rejects.toThrow(PermissionError);
    expect(calendarLinkSchema.safeParse({ calendarLink: "http://cal.com/x" }).success).toBe(false);
    expect(calendarLinkSchema.parse({ calendarLink: "" }).calendarLink).toBeNull();
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
