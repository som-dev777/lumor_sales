import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { knowledgeSchema } from "@/lib/validation/ai-resources";
import {
  createKnowledge,
  knowledgeFor,
  listKnowledge,
  revisionsOf,
  seedKnowledge,
  titleOf,
  updateKnowledge,
} from "./knowledge";
import { readSeedKnowledge } from "./knowledge-files";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const order = (block: string) =>
  [...block.matchAll(/=== FILE: (\S+)\.md/g)].map((m) => m[1].slice(0, 2));

describe("the starting knowledge base (F20)", () => {
  it("loads the 8 files word for word, once", async () => {
    const first = await seedKnowledge(t.db, readSeedKnowledge());
    expect(first.added).toHaveLength(8);
    const files = await listKnowledge(t.db);
    const pricing = files.find((f) => f.slug === "04-pricing-and-plans")!;
    expect(pricing.content).toBe(readFileSync("docs/ai-knowledge/04-pricing-and-plans.md", "utf8"));
    expect(pricing.title).toBe("Pricing and plans");
    expect(await seedKnowledge(t.db, readSeedKnowledge())).toEqual({
      added: [],
      skipped: first.added,
    });
  });

  it("each prompt reads the files the knowledge base's README lists, guardrails last", async () => {
    await seedKnowledge(t.db, readSeedKnowledge());
    expect(order(await knowledgeFor(t.db, "P01"))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "07",
      "08",
    ]);
    expect(order(await knowledgeFor(t.db, "P02"))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
    ]);
    expect(order(await knowledgeFor(t.db, "P03"))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "06",
      "07",
      "08",
    ]);
    expect(order(await knowledgeFor(t.db, "P04"))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "07",
      "08",
    ]);
  });

  it("a new file goes before the guardrails; inactive files are skipped", async () => {
    await seedKnowledge(t.db, readSeedKnowledge());
    const added = await createKnowledge(
      t.db,
      admin,
      knowledgeSchema.parse({
        title: "Case studies",
        content: "# Case studies\n\nNone yet.",
        loadFor: ["P02"],
      }),
    );
    expect(added.slug).toBe("case-studies");
    expect(order(await knowledgeFor(t.db, "P02")).slice(-2)).toEqual(["ca", "08"]);
    await updateKnowledge(
      t.db,
      admin,
      added.id,
      knowledgeSchema.parse({ ...added, active: false }),
    );
    expect(await knowledgeFor(t.db, "P02")).not.toContain("Case studies");
  });
});

describe("editing knowledge", () => {
  it("only Admins edit; a text change keeps the old text as a version and is audited", async () => {
    await seedKnowledge(t.db, readSeedKnowledge());
    const f = (await listKnowledge(t.db)).find((x) => x.slug === "07-upcoming-features")!;
    const changed = knowledgeSchema.parse({ ...f, content: `${f.content}\n| Interviews | New |` });
    await expect(updateKnowledge(t.db, rep, f.id, changed)).rejects.toThrow(PermissionError);
    const after = await updateKnowledge(t.db, admin, f.id, changed);
    expect(after.version).toBe(2);
    const [old] = await revisionsOf(t.db, f.id);
    expect(old).toMatchObject({ version: 1, content: f.content });
    const entry = (await t.db.select().from(auditLog)).at(-1)!;
    expect(entry).toMatchObject({ entityType: "Knowledge file", action: "Updated" });
    expect(entry.changes).toMatchObject({
      version: { before: 1, after: 2 },
      textChanged: { after: true },
    });
    // Saving the same thing again changes nothing.
    expect((await updateKnowledge(t.db, admin, f.id, changed)).version).toBe(2);
  });

  it("a file needs a title, text and at least one AI feature", () => {
    expect(knowledgeSchema.safeParse({ title: "X", content: "a", loadFor: ["P01"] }).success).toBe(
      false,
    );
    expect(
      knowledgeSchema.safeParse({ title: "Notes", content: " ", loadFor: ["P01"] }).success,
    ).toBe(false);
    expect(knowledgeSchema.safeParse({ title: "Notes", content: "a", loadFor: [] }).success).toBe(
      false,
    );
    expect(
      knowledgeSchema.parse({ title: "Notes", content: "a", loadFor: ["P04", "P01"] }).loadFor,
    ).toEqual(["P01", "P04"]);
    expect(titleOf("intro\n# Big title\ntext", "x")).toBe("Big title");
  });
});
