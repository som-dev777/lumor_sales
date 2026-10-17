import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accountFilter, auditLog, persona, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { seedLibrary } from "./seed";

let t: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeEach(async () => {
  t = await createTestDb();
  ownerId = (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id;
});
afterEach(() => t.cleanup());

describe("seedLibrary", () => {
  it("loads 5 personas, 6 account filters and 12 templates as Official, owned by the Admin", async () => {
    const res = await seedLibrary(t.db, ownerId);
    expect(res.added).toHaveLength(23);
    const personas = await t.db.select().from(persona);
    const filters = await t.db.select().from(accountFilter);
    const templates = await t.db.select().from(template);
    expect(personas).toHaveLength(5);
    expect(filters.map((f) => f.code).sort()).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(templates).toHaveLength(12);
    for (const row of [...personas, ...filters, ...templates]) {
      expect(row).toMatchObject({
        type: "Official",
        ownerId,
        status: "Active",
        proposalStatus: "None",
      });
    }
  });

  it("matches the PRD: tiers, geography, HQ and exclusions", async () => {
    await seedLibrary(t.db, ownerId);
    const personas = await t.db.select().from(persona);
    const tiers = Object.fromEntries(personas.map((p) => [p.name, p.tier]));
    expect(tiers).toEqual({
      "Research & Insights": 1,
      "Product & Design": 2,
      "CX, Brand & Marketing": 2,
      "Founders & Agency Directors": 1,
      "Independent Researchers & Consultants": 1,
    });
    expect(personas.every((p) => p.geography.join() === "India")).toBe(true);

    const [a6] = await t.db.select().from(accountFilter).where(eq(accountFilter.code, "A6"));
    expect(a6.hqLocations).toEqual(["Bengaluru", "Mumbai", "Delhi NCR"]);
    const [a4] = await t.db.select().from(accountFilter).where(eq(accountFilter.code, "A4"));
    expect(a4.exclusions).toBe("Market Research, Staffing, Higher Ed, Hospitals, Biotech, Pharma");
  });

  it("links openers to their persona and level; generic templates have none", async () => {
    await seedLibrary(t.db, ownerId);
    const [ri] = await t.db
      .select()
      .from(persona)
      .where(and(eq(persona.type, "Official"), eq(persona.name, "Research & Insights")));
    const [leader] = await t.db
      .select()
      .from(template)
      .where(eq(template.name, "Message 1 – Research & Insights, Leader"));
    expect(leader).toMatchObject({
      personaId: ri.id,
      level: "Leader",
      version: "A",
      purpose: "Message 1",
    });
    const [breakUp] = await t.db.select().from(template).where(eq(template.name, "Break-up"));
    expect(breakUp).toMatchObject({ personaId: null, level: "Any", purpose: "Break-up" });
    expect(breakUp.body).toContain("{Name}");
  });

  it("running it again adds nothing and keeps Admin edits", async () => {
    await seedLibrary(t.db, ownerId);
    await t.db
      .update(persona)
      .set({ notes: "Edited by an Admin" })
      .where(eq(persona.name, "Product & Design"));
    const again = await seedLibrary(t.db, ownerId);
    expect(again.added).toEqual([]);
    expect(again.skipped).toHaveLength(23);
    const [pd] = await t.db.select().from(persona).where(eq(persona.name, "Product & Design"));
    expect(pd.notes).toBe("Edited by an Admin");
  });

  it("each added item is audited as created by the seed script", async () => {
    await seedLibrary(t.db, ownerId);
    const entries = await t.db.select().from(auditLog);
    expect(entries).toHaveLength(23);
    expect(entries.every((e) => e.userId === null && e.action === "Created")).toBe(true);
  });
});
