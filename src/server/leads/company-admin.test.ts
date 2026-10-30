// Owner's QA round (2026-10-30): every person has a company; company notes are editable;
// Admins delete and merge companies and delete people; new industries join the shared list;
// adding a person counts as new outreach on Today.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, company, industry, person, planEnrolment } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { companySchema, personSchema } from "@/lib/validation/leads";
import {
  addIndustry,
  deleteIndustry,
  listIndustries,
  renameIndustry,
  seedIndustries,
} from "../industries";
import { buildToday } from "../today";
import {
  createCompany,
  deleteCompany,
  mergeCompanies,
  updateCompany,
  updateCompanyNotes,
} from "./companies";
import { createPerson, deletePerson } from "./people";

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

const newCompany = (name: string, extra: Record<string, unknown> = {}, actor = rep) =>
  createCompany(t.db, actor, companySchema.parse({ name, status: "Target", ...extra }));
let n = 0;
const newPerson = (companyName: string, actor = rep) => {
  n += 1;
  return createPerson(
    t.db,
    actor,
    personSchema.parse({
      fullName: `Person ${n}`,
      linkedinUrl: `linkedin.com/in/qa-${n}`,
      companyName,
      stage: "Prospect",
    }),
  );
};

describe("people need a company", () => {
  it("a person can't be saved without one", () => {
    const r = personSchema.safeParse({
      fullName: "No Company",
      linkedinUrl: "linkedin.com/in/no-company",
      stage: "Prospect",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.find((i) => i.path[0] === "companyName")?.message).toBe(
      "Choose the company.",
    );
  });
});

describe("company notes", () => {
  it("the owner or an Admin edits them, with an audit entry; others can't", async () => {
    const c = await newCompany("Acme");
    await updateCompanyNotes(t.db, rep, c.id, "  Met at the meetup.  ");
    expect((await t.db.select().from(company).where(eq(company.id, c.id)))[0].notes).toBe(
      "Met at the meetup.",
    );
    const other: Actor = { id: (await insertTestUser(t.db)).id, role: "User", active: true };
    await expect(updateCompanyNotes(t.db, other, c.id, "x")).rejects.toThrow(PermissionError);
    const last = (await t.db.select().from(auditLog)).at(-1)!;
    expect(last.changes).toEqual({ notes: { before: null, after: "Met at the meetup." } });
  });
});

describe("deleting and merging (Admins)", () => {
  it("a company with people can't be deleted; an empty one can", async () => {
    const full = await newCompany("Acme");
    await newPerson("Acme");
    await expect(deleteCompany(t.db, admin, full.id)).rejects.toThrow(/still has 1 person/);
    const empty = await newCompany("Empty Co");
    await expect(deleteCompany(t.db, rep, empty.id)).rejects.toThrow(PermissionError);
    await deleteCompany(t.db, admin, empty.id);
    expect(await t.db.select().from(company).where(eq(company.id, empty.id))).toEqual([]);
  });

  it("merging moves people and history, fills gaps, keeps notes and the further status", async () => {
    const keep = await newCompany("Acme Insights", { notes: "Main account." });
    const dupe = await newCompany("Acme Insights Pvt Ltd", {
      website: "acme.example",
      industry: "Market Research",
      status: "Engaged",
      notes: "Talked to procurement.",
    });
    const p = await newPerson("Acme Insights Pvt Ltd");
    await t.db.insert(activity).values({
      personId: p.id,
      companyId: dupe.id,
      userId: rep.id,
      occurredAt: new Date(),
      type: "Message sent",
    });
    await expect(mergeCompanies(t.db, rep, dupe.id, keep.id)).rejects.toThrow(PermissionError);
    await expect(mergeCompanies(t.db, admin, keep.id, keep.id)).rejects.toThrow(/different/);

    const { target, moved } = await mergeCompanies(t.db, admin, dupe.id, keep.id);
    expect(moved).toBe(1);
    expect(target).toMatchObject({
      website: "acme.example",
      industry: "Market Research",
      status: "Engaged",
      notes: "Main account.\n\nMerged from Acme Insights Pvt Ltd:\nTalked to procurement.",
    });
    expect((await t.db.select().from(person).where(eq(person.id, p.id)))[0].companyId).toBe(
      keep.id,
    );
    expect((await t.db.select().from(activity))[0].companyId).toBe(keep.id);
    expect(await t.db.select().from(company).where(eq(company.id, dupe.id))).toEqual([]);
    const audit = await t.db.select().from(auditLog).where(eq(auditLog.entityType, "Company"));
    expect(audit.find((a) => a.recordId === dupe.id && a.action === "Deleted")).toBeTruthy();
    expect(audit.find((a) => a.recordId === keep.id && a.action === "Updated")).toBeTruthy();
  });

  it("deleting a person removes their activities and plan history; Admins only", async () => {
    await newCompany("Acme");
    const p = await newPerson("Acme");
    await t.db.insert(activity).values({
      personId: p.id,
      userId: rep.id,
      occurredAt: new Date(),
      type: "Message sent",
    });
    await expect(deletePerson(t.db, rep, p.id)).rejects.toThrow(PermissionError);
    await deletePerson(t.db, admin, p.id);
    expect(await t.db.select().from(person).where(eq(person.id, p.id))).toEqual([]);
    expect(await t.db.select().from(activity)).toEqual([]);
    expect(await t.db.select().from(planEnrolment)).toEqual([]);
    const last = (await t.db.select().from(auditLog)).at(-1)!;
    expect(last).toMatchObject({ action: "Deleted", recordName: p.fullName });
  });
});

describe("industries", () => {
  it("start from what's in use, join the list when used, and renames and deletes follow", async () => {
    await newCompany("Acme", { industry: "Market Research" });
    // Saving a company with a new industry adds it to the list.
    const beta = await newCompany("Beta");
    await updateCompany(
      t.db,
      rep,
      beta.id,
      companySchema.parse({ name: "Beta", status: "Target", industry: "Retail" }),
    );
    expect((await listIndustries(t.db)).map((i) => [i.name, i.companies])).toEqual([
      ["Market Research", 1],
      ["Retail", 1],
    ]);
    expect(await seedIndustries(t.db)).toEqual([]); // the list isn't empty

    await addIndustry(t.db, rep, "Software");
    await expect(addIndustry(t.db, rep, "software")).rejects.toThrow("already on the list");
    const [retail] = await t.db.select().from(industry).where(eq(industry.name, "Retail"));
    await expect(renameIndustry(t.db, rep, retail.id, "Retail & Consumer")).rejects.toThrow(
      PermissionError,
    );
    await renameIndustry(t.db, admin, retail.id, "Retail & Consumer");
    expect((await t.db.select().from(company).where(eq(company.id, beta.id)))[0].industry).toBe(
      "Retail & Consumer",
    );
    await deleteIndustry(t.db, admin, retail.id);
    expect(
      (await t.db.select().from(company).where(eq(company.id, beta.id)))[0].industry,
    ).toBeNull();
  });
});

describe("new outreach on Today", () => {
  it("each person added today counts once, even with a connection request too", async () => {
    await newCompany("Acme");
    const a = await newPerson("Acme");
    await newPerson("Acme");
    await t.db.insert(activity).values({
      personId: a.id,
      userId: rep.id,
      occurredAt: new Date(),
      type: "Request sent",
    });
    const plan = await buildToday(t.db, rep);
    expect(plan.outreach.sent).toBe(2);
    expect(plan.outreach.left).toBe(plan.outreach.target - 2);
  });
});
