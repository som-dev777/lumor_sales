import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accountFilter,
  activity,
  auditLog,
  persona,
  person,
  playbookSettings,
  productFacts,
  session,
  user,
} from "./schema";
import { createTestDb, dbErrorText, insertTestUser } from "./test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const futureDate = () => new Date(Date.now() + 86_400_000);

async function addSession(userId: string) {
  await t.db
    .insert(session)
    .values({ userId, token: crypto.randomUUID(), expiresAt: futureDate() });
}

async function addAuditEntry(userId: string) {
  const [row] = await t.db
    .insert(auditLog)
    .values({
      userId,
      entityType: "User",
      recordName: "Test",
      recordId: userId,
      action: "Created",
      changes: { name: { before: null, after: "Test" } },
    })
    .returning();
  return row;
}

function personValues(ownerId: string, overrides: Partial<typeof person.$inferInsert> = {}) {
  return {
    fullName: "Priya S",
    linkedinUrl: "https://www.linkedin.com/in/priya-s/",
    linkedinUrlNormalised: "linkedin.com/in/priya-s",
    ownerId,
    ...overrides,
  };
}

describe("migrations", () => {
  it("create every table", async () => {
    const res = await t.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name",
    );
    expect(res.rows.map((r) => r.name)).toEqual([
      "account",
      "account_filter",
      "activity",
      "app_release",
      "audit_log",
      "company",
      "invite",
      "person",
      "persona",
      "playbook_settings",
      "product_facts",
      "proposal",
      "session",
      "template",
      "template_revision",
      "user",
      "verification",
    ]);
  });

  it("create the single settings rows with the PRD defaults", async () => {
    const settings = await t.db.select().from(playbookSettings);
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({
      id: 1,
      followUp1DelayDays: 4,
      followUp2DelayDays: 7,
      breakUpDelayDays: 10,
      withdrawAfterDays: 14,
      dailyConnectionTarget: 20,
      dailyMessageTarget: 10,
      staleLeadDays: 21,
    });
    expect(await t.db.select().from(productFacts)).toHaveLength(1);
  });

  it("refuse a second settings row", async () => {
    const err = await dbErrorText(() => t.db.insert(playbookSettings).values({ id: 2 }));
    expect(err).toMatch(/CHECK constraint failed/);
  });
});

describe("audit log lock (F14)", () => {
  it("accepts new entries", async () => {
    const u = await insertTestUser(t.db);
    const entry = await addAuditEntry(u.id);
    expect(entry.changes).toEqual({ name: { before: null, after: "Test" } });
  });

  it("rejects any update, even through raw SQL", async () => {
    const u = await insertTestUser(t.db);
    const entry = await addAuditEntry(u.id);
    const err = await dbErrorText(() =>
      t.db.update(auditLog).set({ recordName: "Changed" }).where(eq(auditLog.id, entry.id)),
    );
    expect(err).toMatch(/audit_log is insert-only/);
    const rawErr = await dbErrorText(() =>
      t.client.execute("UPDATE audit_log SET action = 'Deleted'"),
    );
    expect(rawErr).toMatch(/audit_log is insert-only/);
  });

  it("rejects any delete", async () => {
    const u = await insertTestUser(t.db);
    await addAuditEntry(u.id);
    const err = await dbErrorText(() => t.client.execute("DELETE FROM audit_log"));
    expect(err).toMatch(/audit_log is insert-only/);
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });

  it("only allows the PRD's audit actions", async () => {
    const u = await insertTestUser(t.db);
    const err = await dbErrorText(() =>
      t.client.execute({
        sql: "INSERT INTO audit_log (id, entity_type, record_name, record_id, action, changes, occurred_at, user_id) VALUES ('x', 'User', 'n', 'r', 'Hacked', '{}', 0, ?)",
        args: [u.id],
      }),
    );
    expect(err).toMatch(/CHECK constraint failed/);
  });
});

describe("user locks (F01)", () => {
  it("users cannot be deleted", async () => {
    const u = await insertTestUser(t.db);
    const err = await dbErrorText(() => t.db.delete(user).where(eq(user.id, u.id)));
    expect(err).toMatch(/users cannot be deleted/);
  });

  it("deactivating keeps the session, so the app knows to show 'Access disabled' (D-010)", async () => {
    const a = await insertTestUser(t.db);
    await addSession(a.id);
    await t.db.update(user).set({ active: false }).where(eq(user.id, a.id));
    expect(await t.db.select().from(session).where(eq(session.userId, a.id))).toHaveLength(1);
  });

  it("role must be Admin or User", async () => {
    const err = await dbErrorText(() =>
      t.client.execute(
        "INSERT INTO user (id, name, email, role) VALUES ('x', 'X', 'x@example.com', 'superadmin')",
      ),
    );
    expect(err).toMatch(/CHECK constraint failed/);
  });
});

describe("links between tables", () => {
  it("are enforced, including inside transactions", async () => {
    const err = await dbErrorText(() =>
      t.db.transaction(async (tx) => {
        await tx.insert(person).values(personValues("no-such-user"));
      }),
    );
    expect(err).toMatch(/FOREIGN KEY constraint failed/);
  });

  it("an item that leads point to cannot be deleted (archive instead)", async () => {
    const u = await insertTestUser(t.db);
    const [p] = await t.db
      .insert(persona)
      .values({ name: "Research & Insights", type: "Official", ownerId: u.id, tier: 1 })
      .returning();
    await t.db.insert(person).values(personValues(u.id, { personaId: p.id }));
    const err = await dbErrorText(() => t.db.delete(persona).where(eq(persona.id, p.id)));
    expect(err).toMatch(/FOREIGN KEY constraint failed/);
  });
});

describe("person rules", () => {
  it("normalised LinkedIn URL is unique", async () => {
    const u = await insertTestUser(t.db);
    await t.db.insert(person).values(personValues(u.id));
    const err = await dbErrorText(() => t.db.insert(person).values(personValues(u.id)));
    expect(err).toMatch(/UNIQUE constraint failed: person.linkedin_url_normalised/);
  });

  it("main LinkedIn field must be a public /in/ profile", async () => {
    const u = await insertTestUser(t.db);
    const err = await dbErrorText(() =>
      t.db
        .insert(person)
        .values(
          personValues(u.id, { linkedinUrl: "https://www.linkedin.com/sales/lead/ACwAA123" }),
        ),
    );
    expect(err).toMatch(/CHECK constraint failed/);
  });

  it("stage Lost requires a lost reason", async () => {
    const u = await insertTestUser(t.db);
    const err = await dbErrorText(() =>
      t.db.insert(person).values(personValues(u.id, { stage: "Lost" })),
    );
    expect(err).toMatch(/CHECK constraint failed: person_lost_needs_reason/);
    await t.db
      .insert(person)
      .values(personValues(u.id, { stage: "Lost", lostReason: "No budget" }));
  });
});

describe("activity rules", () => {
  it("reply type is only allowed on Reply received", async () => {
    const u = await insertTestUser(t.db);
    const [p] = await t.db.insert(person).values(personValues(u.id)).returning();
    const base = { personId: p.id, userId: u.id, occurredAt: new Date() };

    const err = await dbErrorText(() =>
      t.db.insert(activity).values({ ...base, type: "Message sent", replyType: "Interested" }),
    );
    expect(err).toMatch(/CHECK constraint failed: activity_reply_type_only_on_reply/);
    await t.db
      .insert(activity)
      .values({ ...base, type: "Reply received", replyType: "Interested" });
  });
});

describe("account filter codes", () => {
  it("are unique among Official filters but Personal filters may reuse them", async () => {
    const u = await insertTestUser(t.db);
    const base = { code: "A1", name: "Research Agencies", ownerId: u.id };
    await t.db.insert(accountFilter).values({ ...base, type: "Official" });
    await t.db.insert(accountFilter).values({ ...base, type: "Personal" });
    const err = await dbErrorText(() =>
      t.db.insert(accountFilter).values({ ...base, type: "Official" }),
    );
    expect(err).toMatch(/UNIQUE constraint failed/);
  });
});

describe("defaults", () => {
  it("timestamps are filled in by the database too (UTC milliseconds)", async () => {
    await t.client.execute(
      "INSERT INTO user (id, name, email) VALUES ('raw', 'Raw', 'raw@example.com')",
    );
    const res = await t.db.get<{ created_at: number }>(
      sql`SELECT created_at FROM user WHERE id = 'raw'`,
    );
    expect(Math.abs(res!.created_at - Date.now())).toBeLessThan(5_000);
  });
});
