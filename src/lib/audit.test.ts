import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffChanges, writeAudit } from "./audit";
import { auditLog, user } from "./db/schema";
import { createTestDb, insertTestUser } from "./db/test-db";

describe("diffChanges", () => {
  it("lists only the fields that changed, with before and after", () => {
    expect(
      diffChanges(
        { name: "Asha", role: "User", active: true },
        { name: "Asha", role: "Admin", active: true },
      ),
    ).toEqual({ role: { before: "User", after: "Admin" } });
  });

  it("lists every field when a record is created", () => {
    expect(diffChanges(null, { name: "Asha", role: "User" })).toEqual({
      name: { before: null, after: "Asha" },
      role: { before: null, after: "User" },
    });
  });

  it("lists every field when a record is deleted", () => {
    expect(diffChanges({ name: "Asha" }, null)).toEqual({ name: { before: "Asha", after: null } });
  });

  it("never records passwords, tokens or bookkeeping timestamps", () => {
    const changes = diffChanges(null, {
      email: "a@example.com",
      password: "hash",
      token: "t",
      tokenHash: "h",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(Object.keys(changes)).toEqual(["email"]);
  });

  it("stores dates as ISO text and compares them by value", () => {
    const d = "2026-10-16T09:00:00.000Z";
    expect(diffChanges({ at: new Date(d) }, { at: new Date(d) })).toEqual({});
    expect(diffChanges({ at: null }, { at: new Date(d) })).toEqual({
      at: { before: null, after: d },
    });
  });

  it("compares lists by content", () => {
    expect(diffChanges({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toEqual({});
    expect(diffChanges({ tags: ["a"] }, { tags: ["a", "b"] })).toEqual({
      tags: { before: ["a"], after: ["a", "b"] },
    });
  });

  it("ignores fields a partial update didn't touch", () => {
    expect(diffChanges({ name: "Asha", role: "User" }, { role: "Admin" })).toEqual({
      role: { before: "User", after: "Admin" },
    });
  });
});

describe("writeAudit", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    t = await createTestDb();
  });
  afterEach(() => t.cleanup());

  it("writes one entry with the actor, record and changes", async () => {
    const actor = await insertTestUser(t.db, { role: "Admin" });
    const target = await insertTestUser(t.db, { name: "Asha" });

    const written = await writeAudit(t.db, {
      userId: actor.id,
      entityType: "User",
      recordId: target.id,
      recordName: "Asha",
      action: "Role changed",
      before: { role: "User" },
      after: { role: "Admin" },
    });

    expect(written).toBe(true);
    const [row] = await t.db.select().from(auditLog);
    expect(row).toMatchObject({
      userId: actor.id,
      createdBy: actor.id,
      entityType: "User",
      recordId: target.id,
      recordName: "Asha",
      action: "Role changed",
      changes: { role: { before: "User", after: "Admin" } },
    });
    expect(Math.abs(row.occurredAt.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("skips an Updated entry when nothing changed", async () => {
    const written = await writeAudit(t.db, {
      userId: null,
      entityType: "User",
      recordId: "x",
      recordName: "X",
      action: "Updated",
      before: { name: "Same" },
      after: { name: "Same" },
    });
    expect(written).toBe(false);
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
  });

  it("is saved or undone together with the change it describes", async () => {
    const target = await insertTestUser(t.db, { name: "Asha" });

    await expect(
      t.db.transaction(async (tx) => {
        await tx.update(user).set({ name: "Renamed" }).where(eq(user.id, target.id));
        await writeAudit(tx, {
          userId: null,
          entityType: "User",
          recordId: target.id,
          recordName: "Asha",
          action: "Updated",
          before: { name: "Asha" },
          after: { name: "Renamed" },
        });
        throw new Error("something later in the same action failed");
      }),
    ).rejects.toThrow("something later");

    const [still] = await t.db.select().from(user).where(eq(user.id, target.id));
    expect(still.name).toBe("Asha");
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
  });
});
