import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, company, person, user } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import {
  companySchema,
  customerSchema,
  personSchema,
  type PersonInput,
} from "@/lib/validation/leads";
import {
  companyTimeline,
  createCompany,
  getCompany,
  LeadError,
  listCompanies,
  markAsCustomer,
  updateCompany,
} from "./companies";
import {
  addNote,
  createPerson,
  listPeople,
  personTimeline,
  reassignPeople,
  updatePerson,
} from "./people";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let rep2: Actor;

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

const input = (over: Partial<PersonInput> = {}): PersonInput => ({
  fullName: "Priya Sharma",
  title: "Head of Research",
  linkedinUrl: "https://www.linkedin.com/in/Priya-S/?utm_source=x",
  salesNavUrl: "",
  companyName: "Acme Insights",
  stage: "Prospect",
  ...over,
});
const data = (over: Partial<PersonInput> = {}) => personSchema.parse(input(over));

describe("person form rules", () => {
  it("refuse a Sales Navigator link in the main field, with the PRD message", () => {
    const r = personSchema.safeParse(
      input({ linkedinUrl: "https://www.linkedin.com/sales/lead/ACw123" }),
    );
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Paste the public profile link (linkedin.com/in/…)");
  });
  it("need a lost reason for Lost, and drop it for other stages", () => {
    expect(personSchema.safeParse(input({ stage: "Lost" })).success).toBe(false);
    expect(data({ stage: "Lost", lostReason: "No budget" }).lostReason).toBe("No budget");
    expect(data({ stage: "Messaged", lostReason: "No budget" }).lostReason).toBeNull();
  });
  it("check the Sales Navigator field and dates", () => {
    expect(
      personSchema.safeParse(input({ salesNavUrl: "https://linkedin.com/in/x" })).success,
    ).toBe(false);
    expect(personSchema.safeParse(input({ nextActionDate: "2026-02-30" })).success).toBe(false);
  });
});

describe("adding people", () => {
  it("stores the normalised link, links or creates the company, and audits", async () => {
    const p = await createPerson(t.db, rep, data());
    expect(p).toMatchObject({
      linkedinUrlNormalised: "linkedin.com/in/priya-s",
      ownerId: rep.id,
      market: "India",
    });
    const [c] = await t.db.select().from(company);
    expect(c).toMatchObject({ name: "Acme Insights", ownerId: rep.id, status: "Target" });
    const second = await createPerson(
      t.db,
      rep2,
      data({ linkedinUrl: "linkedin.com/in/other", companyName: "  ACME insights " }),
    );
    expect(second.companyId).toBe(c.id);
    const actions = (await t.db.select().from(auditLog)).map((e) => `${e.entityType}:${e.action}`);
    expect(actions).toEqual(["Company:Created", "Person:Created", "Person:Created"]);
  });

  it("the same person through any link variant is refused: 'Already added by {owner}'", async () => {
    const first = await createPerson(t.db, rep, data());
    for (const url of [
      "http://linkedin.com/in/priya-s",
      "https://m.linkedin.com/in/PRIYA-S/#about",
      "https://in.linkedin.com/in/priya-s/",
      "www.linkedin.com/in/priya-s/details/experience/",
    ]) {
      const err = await createPerson(t.db, rep2, data({ linkedinUrl: url })).catch((e) => e);
      expect(err).toBeInstanceOf(LeadError);
      expect(err.message).toBe("Already added by Asha.");
      expect(err.link).toBe(`/people/${first.id}`);
    }
    expect(await t.db.select().from(person)).toHaveLength(1);
  });

  it("only Admins can add a lead for someone else, and only to an active user", async () => {
    await expect(createPerson(t.db, rep, data({ ownerId: rep2.id }))).rejects.toThrow(
      PermissionError,
    );
    const p = await createPerson(t.db, admin, data({ ownerId: rep2.id }));
    expect(p.ownerId).toBe(rep2.id);
    await t.db.update(user).set({ active: false }).where(eq(user.id, rep.id));
    await expect(
      createPerson(t.db, admin, data({ ownerId: rep.id, linkedinUrl: "linkedin.com/in/z" })),
    ).rejects.toThrow(/deactivated/);
  });
});

describe("editing people", () => {
  it("the owner or an Admin edits; others are refused (claimed)", async () => {
    const p = await createPerson(t.db, rep, data());
    await updatePerson(t.db, rep, p.id, data({ title: "Director of Research" }));
    await updatePerson(t.db, admin, p.id, data({ title: "VP Research" }));
    await expect(updatePerson(t.db, rep2, p.id, data())).rejects.toThrow(PermissionError);
  });

  it("editing into a duplicate link is refused, also on edit", async () => {
    await createPerson(t.db, rep, data());
    const other = await createPerson(
      t.db,
      rep,
      data({ linkedinUrl: "linkedin.com/in/other", fullName: "Other" }),
    );
    await expect(
      updatePerson(t.db, rep, other.id, data({ linkedinUrl: "https://linkedin.com/in/Priya-S" })),
    ).rejects.toThrow("Already added by Asha.");
  });

  it("a manual stage change logs a 'Stage change' activity", async () => {
    const p = await createPerson(t.db, rep, data());
    await updatePerson(t.db, rep, p.id, data({ stage: "Lost", lostReason: "Using competitor" }));
    const [a] = await personTimeline(t.db, p.id);
    expect(a).toMatchObject({
      type: "Stage change",
      content: "Prospect → Lost (Using competitor)",
      userName: "Asha",
    });
    await updatePerson(
      t.db,
      rep,
      p.id,
      data({ stage: "Lost", lostReason: "Using competitor", title: "x" }),
    );
    expect(await personTimeline(t.db, p.id)).toHaveLength(1);
  });

  it("anyone can add a note to anyone's lead", async () => {
    const p = await createPerson(t.db, rep, data());
    await addNote(t.db, rep2, p.id, "Met at the research conference.");
    const [note] = await personTimeline(t.db, p.id);
    expect(note).toMatchObject({
      type: "Meeting note",
      content: "Met at the research conference.",
      userName: "Ravi",
    });
  });
});

describe("bulk reassign (Admin)", () => {
  it("moves several people, one audit entry each; Users are refused", async () => {
    const a = await createPerson(t.db, rep, data());
    const b = await createPerson(
      t.db,
      rep,
      data({ linkedinUrl: "linkedin.com/in/b", fullName: "Bina" }),
    );
    await expect(reassignPeople(t.db, rep, [a.id], rep2.id)).rejects.toThrow(PermissionError);
    expect(await reassignPeople(t.db, admin, [a.id, b.id], rep2.id)).toBe(2);
    const owners = (await t.db.select().from(person)).map((p) => p.ownerId);
    expect(owners).toEqual([rep2.id, rep2.id]);
    const reassigned = (await t.db.select().from(auditLog)).filter(
      (e) => e.action === "Reassigned",
    );
    expect(reassigned).toHaveLength(2);
  });
});

describe("people list and filters", () => {
  async function seedList() {
    const now = new Date("2026-10-16T06:00:00Z"); // Friday 16 Oct 2026, IST
    await createPerson(
      t.db,
      rep,
      data({ fullName: "Overdue", linkedinUrl: "linkedin.com/in/a", nextActionDate: "2026-10-14" }),
    );
    await createPerson(
      t.db,
      rep,
      data({ fullName: "Today", linkedinUrl: "linkedin.com/in/b", nextActionDate: "2026-10-16" }),
    );
    await createPerson(
      t.db,
      rep2,
      data({
        fullName: "Sunday",
        linkedinUrl: "linkedin.com/in/c",
        nextActionDate: "2026-10-18",
        companyName: "Zeta Labs",
      }),
    );
    await createPerson(
      t.db,
      rep2,
      data({
        fullName: "Next week",
        linkedinUrl: "linkedin.com/in/d",
        nextActionDate: "2026-10-19",
      }),
    );
    await createPerson(
      t.db,
      rep,
      data({
        fullName: "Lost overdue",
        linkedinUrl: "linkedin.com/in/e",
        nextActionDate: "2026-10-01",
        stage: "Lost",
        lostReason: "Other",
      }),
    );
    return now;
  }
  const names = (r: { rows: { fullName: string }[] }) => r.rows.map((x) => x.fullName).sort();

  it("My leads vs All leads", async () => {
    const now = await seedList();
    expect((await listPeople(t.db, { mine: true, viewerId: rep.id }, { now })).total).toBe(3);
    expect((await listPeople(t.db, {}, { now })).total).toBe(5);
  });

  it("next action buckets follow IST and skip closed leads", async () => {
    const now = await seedList();
    expect(names(await listPeople(t.db, { next: "overdue" }, { now }))).toEqual(["Overdue"]);
    expect(names(await listPeople(t.db, { next: "today" }, { now }))).toEqual(["Today"]);
    // This week = Mon 12 – Sun 18 Oct (IST), so it includes Wednesday's overdue lead.
    expect(names(await listPeople(t.db, { next: "week" }, { now }))).toEqual([
      "Overdue",
      "Sunday",
      "Today",
    ]);
  });

  it("search covers name, title and company", async () => {
    const now = await seedList();
    expect(names(await listPeople(t.db, { q: "zeta" }, { now }))).toEqual(["Sunday"]);
    expect(names(await listPeople(t.db, { q: "sund" }, { now }))).toEqual(["Sunday"]);
  });
});

describe("companies", () => {
  const cdata = (over: Record<string, unknown> = {}) =>
    companySchema.parse({ name: "Acme Insights", status: "Target", ...over });

  it("names are unique ignoring case and spaces", async () => {
    await createCompany(t.db, rep, cdata());
    await expect(createCompany(t.db, rep2, cdata({ name: " acme INSIGHTS " }))).rejects.toThrow(
      /already exists/,
    );
  });

  it("owner or Admin edits; mark as customer sets plan, deal, date and status", async () => {
    const c = await createCompany(t.db, rep, cdata());
    await expect(updateCompany(t.db, rep2, c.id, cdata({ city: "Pune" }))).rejects.toThrow(
      PermissionError,
    );
    await updateCompany(t.db, rep, c.id, cdata({ city: "Pune" }));
    const done = await markAsCustomer(
      t.db,
      admin,
      c.id,
      customerSchema.parse({
        planTier: "Team",
        dealValueInr: "240000",
        customerStartDate: "2026-11-01",
      }),
    );
    expect(done).toMatchObject({
      status: "Customer",
      planTier: "Team",
      dealValueInr: 240000,
      customerStartDate: "2026-11-01",
      city: "Pune",
    });
  });

  it("lists with people counts; detail has people and a combined timeline", async () => {
    const p1 = await createPerson(t.db, rep, data());
    await createPerson(
      t.db,
      rep2,
      data({ fullName: "Kiran", linkedinUrl: "linkedin.com/in/kiran" }),
    );
    await addNote(t.db, rep, p1.id, "Budget approved in Q4.");
    const [c] = await listCompanies(t.db, {});
    expect(c).toMatchObject({ name: "Acme Insights", people: 2 });
    const detail = await getCompany(t.db, c.id);
    expect(detail?.people.map((p) => p.fullName)).toEqual(["Kiran", "Priya Sharma"]);
    const timeline = await companyTimeline(t.db, c.id);
    expect(timeline[0]).toMatchObject({ type: "Meeting note", personName: "Priya Sharma" });
    expect(await t.db.select().from(activity)).toHaveLength(1);
  });
});
