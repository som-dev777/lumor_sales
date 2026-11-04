// The owner's list of 4 November (D-054): company offices (F28) with owner-change notifications,
// Remove on Today, Ask AI about a company (P10) and the demo-link rule in the AI guardrails.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, auditLog, companyOffice, notification, person } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { companySchema, officeSchema, personSchema } from "@/lib/validation/leads";
import { askAboutCompany } from "./ai/autofill";
import { GUARDRAILS, PROMPTS } from "./ai/prompts";
import { createCompany, deleteCompany, mergeCompanies, updateCompany } from "./leads/companies";
import { createOffice, deleteOffice, listOffices, updateOffice } from "./leads/offices";
import { createPerson, getPerson, reassignPeople, updatePerson } from "./leads/people";
import { buildToday, classifyLead, removeFollowUp, setFollowUp } from "./today";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let a: Actor;
let b: Actor;
let c: Actor;
const NOW = new Date("2026-11-04T06:30:00Z");

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  a = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  b = { id: (await insertTestUser(t.db, { name: "Bina" })).id, role: "User", active: true };
  c = { id: (await insertTestUser(t.db, { name: "Chetan" })).id, role: "User", active: true };
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

const office = (input: Record<string, unknown>) => officeSchema.parse(input);
const newCompany = (name: string, by = a) =>
  createCompany(t.db, by, companySchema.parse({ name, status: "Target" }));
let n = 0;
const newPerson = (by: Actor, companyName: string, extra: Record<string, unknown> = {}) => {
  n += 1;
  return createPerson(
    t.db,
    by,
    personSchema.parse({
      fullName: `Person ${n}`,
      linkedinUrl: `linkedin.com/in/p4-${n}`,
      companyName,
      stage: "Contacted",
      ...extra,
    }),
  );
};
const notesFor = async (who: Actor) =>
  (await t.db.select().from(notification)).filter((x) => x.userId === who.id);

describe("company offices (F28)", () => {
  it("different reps add offices; one main office; people at an office owned by someone else", async () => {
    const acme = await newCompany("Acme Research");
    // Rep A adds the corporate office in the UK; rep B a Bangalore office.
    const hq = await createOffice(
      t.db,
      a,
      acme.id,
      office({ name: "Corporate office", city: "London", country: "United Kingdom", isMain: true }),
    );
    const blr = await createOffice(
      t.db,
      b,
      acme.id,
      office({ name: "Bangalore office", city: "Bangalore", country: "India" }),
    );
    expect(hq.ownerId).toBe(a.id);
    expect(blr.ownerId).toBe(b.id);
    // Same name again is refused.
    await expect(
      createOffice(t.db, c, acme.id, office({ name: " bangalore OFFICE " })),
    ).rejects.toThrow("already has an office called Bangalore office");
    // Rep C adds a person at rep B's office.
    const p = await newPerson(c, "Acme Research", { officeId: blr.id });
    expect(p.officeId).toBe(blr.id);
    expect(p.ownerId).toBe(c.id);
    const view = (await getPerson(t.db, p.id))!;
    expect(view).toMatchObject({ officeName: "Bangalore office", addedByName: "Chetan" });
    // The list: main office first, with owner, who added it and the people count.
    const list = await listOffices(t.db, acme.id);
    expect(list.map((o) => [o.name, o.isMain, o.ownerName, o.addedByName, o.peopleCount])).toEqual([
      ["Corporate office", true, "Asha", "Asha", 0],
      ["Bangalore office", false, "Bina", "Bina", 1],
    ]);
    // Marking Bangalore as main moves the mark (one main office per company).
    await updateOffice(t.db, b, blr.id, office({ name: "Bangalore office", isMain: true }));
    const after = await listOffices(t.db, acme.id);
    expect(after.filter((o) => o.isMain).map((o) => o.name)).toEqual(["Bangalore office"]);
  });

  it("a person's office must be at their company; a new company clears it", async () => {
    const acme = await newCompany("Acme Research");
    await newCompany("Beta Labs");
    const blr = await createOffice(t.db, a, acme.id, office({ name: "Bangalore office" }));
    await expect(newPerson(a, "Beta Labs", { officeId: blr.id })).rejects.toThrow(
      "isn't one of this company's offices",
    );
    const p = await newPerson(a, "Acme Research", { officeId: blr.id });
    const moved = await updatePerson(
      t.db,
      a,
      p.id,
      personSchema.parse({
        fullName: p.fullName,
        linkedinUrl: p.linkedinUrl,
        companyName: "Beta Labs",
        stage: "Contacted",
        officeId: blr.id,
      }),
    );
    expect(moved.officeId).toBeNull();
  });

  it("edit and delete: the office's owner, the company's owner or an Admin; not with people", async () => {
    const acme = await newCompany("Acme Research", a);
    const blr = await createOffice(t.db, b, acme.id, office({ name: "Bangalore office" }));
    // Rep C owns neither the office nor the company.
    await expect(updateOffice(t.db, c, blr.id, office({ name: "BLR" }))).rejects.toThrow(
      PermissionError,
    );
    await expect(deleteOffice(t.db, c, blr.id)).rejects.toThrow(PermissionError);
    // The company's owner can edit it, but only the office's owner (or an Admin) changes its owner.
    await updateOffice(t.db, a, blr.id, office({ name: "Bangalore office (Indiranagar)" }));
    await expect(
      updateOffice(t.db, a, blr.id, office({ name: "Bangalore office", ownerId: c.id })),
    ).rejects.toThrow("Only the office's owner or an Admin");
    await newPerson(c, "Acme Research", { officeId: blr.id });
    await expect(deleteOffice(t.db, admin, blr.id)).rejects.toThrow(
      "1 person works from this office",
    );
    const mum = await createOffice(t.db, c, acme.id, office({ name: "Mumbai office" }));
    await deleteOffice(t.db, a, mum.id);
    const audits = await t.db.select().from(auditLog).where(eq(auditLog.recordId, mum.id));
    expect(audits.map((x) => x.action)).toEqual(["Created", "Deleted"]);
  });

  it("owner changes notify the previous and the new owner (office, person, company)", async () => {
    const acme = await newCompany("Acme Research", a);
    const blr = await createOffice(t.db, b, acme.id, office({ name: "Bangalore office" }));
    // Rep B hands the office to rep C.
    await updateOffice(t.db, b, blr.id, office({ name: "Bangalore office", ownerId: c.id }));
    expect((await notesFor(c)).map((x) => x.title)).toEqual([
      "You now own the office Acme Research · Bangalore office",
    ]);
    expect(await notesFor(b)).toHaveLength(0); // B made the change
    // An Admin moves it again: both C (before) and A (after) hear about it.
    await updateOffice(t.db, admin, blr.id, office({ name: "Bangalore office", ownerId: a.id }));
    const toC = (await notesFor(c)).find((x) => x.title.startsWith("New owner"))!;
    expect(toC.body).toBe(
      "Somnath made Asha the owner of the office Acme Research · Bangalore office. You were its owner.",
    );
    expect((await notesFor(a)).map((x) => x.kind)).toEqual(["added"]);
    // A person reassigned by an Admin, one by one and in bulk.
    const p = await newPerson(b, "Acme Research");
    await updatePerson(
      t.db,
      admin,
      p.id,
      personSchema.parse({
        fullName: p.fullName,
        linkedinUrl: p.linkedinUrl,
        companyName: "Acme Research",
        stage: "Contacted",
        ownerId: c.id,
      }),
    );
    expect(
      (await notesFor(b)).some((x) => x.title === `New owner for the person ${p.fullName}`),
    ).toBe(true);
    await reassignPeople(t.db, admin, [p.id], a.id);
    expect(
      (await notesFor(c)).some((x) => x.title === `New owner for the person ${p.fullName}`),
    ).toBe(true);
    // A company given a new owner.
    await updateCompany(
      t.db,
      admin,
      acme.id,
      companySchema.parse({ name: "Acme Research", status: "Target", ownerId: b.id }),
    );
    expect(
      (await notesFor(a)).some((x) => x.title === "New owner for the company Acme Research"),
    ).toBe(true);
    expect(
      (await notesFor(b)).some((x) => x.title === "You now own the company Acme Research"),
    ).toBe(true);
  });

  it("deleting a company removes its offices; merging moves them (renamed on a clash, one main)", async () => {
    const acme = await newCompany("Acme Research");
    const dup = await newCompany("Acme Research Pvt Ltd");
    await createOffice(t.db, a, acme.id, office({ name: "Corporate office", isMain: true }));
    await createOffice(t.db, a, dup.id, office({ name: "Corporate office", isMain: true }));
    await createOffice(t.db, a, dup.id, office({ name: "Delhi office" }));
    await mergeCompanies(t.db, admin, dup.id, acme.id);
    const merged = await listOffices(t.db, acme.id);
    expect(merged.map((o) => [o.name, o.isMain])).toEqual([
      ["Corporate office", true],
      ["Corporate office (from Acme Research Pvt Ltd)", false],
      ["Delhi office", false],
    ]);
    const gone = await newCompany("Gone Ltd");
    await createOffice(t.db, a, gone.id, office({ name: "Pune office" }));
    await deleteCompany(t.db, admin, gone.id);
    expect(
      await t.db.select().from(companyOffice).where(eq(companyOffice.companyId, gone.id)),
    ).toEqual([]);
  });
});

describe("Remove on Today (D-054)", () => {
  it("clears the follow-up and keeps them off Today until something new happens", async () => {
    await newCompany("Acme Research");
    const p = await newPerson(a, "Acme Research", {
      nextAction: "Send the deck",
      nextActionDate: "2026-11-01",
    });
    const onToday = async () =>
      (await buildToday(t.db, a, NOW)).tasks.filter((x) => x.personId === p.id).map((x) => x.kind);
    expect(await onToday()).toEqual(["followup"]);
    // Only the owner (or an Admin) can remove it.
    await expect(removeFollowUp(t.db, b, p.id, NOW)).rejects.toThrow(PermissionError);
    await removeFollowUp(t.db, a, p.id, NOW);
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(row).toMatchObject({ nextAction: null, nextActionDate: null, snoozedUntil: null });
    expect(row.followUpRemovedAt).toEqual(NOW);
    // Not "needs a follow-up date" either (they're Contacted, with no date now).
    expect(await onToday()).toEqual([]);
    // New activity brings them back where the rules say.
    await t.db.insert(activity).values({
      personId: p.id,
      userId: a.id,
      occurredAt: new Date(NOW.getTime() + 60_000),
      type: "Reply received",
    });
    expect(await onToday()).toEqual(["quick"]);
    // A new follow-up date clears the mark.
    await setFollowUp(t.db, a, p.id, { nextAction: "Call", date: "2026-11-04" }, NOW);
    const [later] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(later.followUpRemovedAt).toBeNull();
  });

  it("the rule: removed people skip the no-date and no-activity lists only", () => {
    const base = {
      snoozedUntil: null,
      nextAction: null,
      nextActionDate: null,
      awaitingReplyUntil: null,
      nudgeCount: 0,
      nurtureUntil: null,
      stage: "Contacted",
      converted: false,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    };
    expect(classifyLead(base, undefined, null, "2026-11-04", "2026-10-25")?.section).toBe("nodate");
    expect(
      classifyLead(
        { ...base, followUpRemovedAt: NOW },
        undefined,
        null,
        "2026-11-04",
        "2026-10-25",
      ),
    ).toBeNull();
    // A follow-up date set later still shows.
    expect(
      classifyLead(
        { ...base, followUpRemovedAt: NOW, nextAction: "Call", nextActionDate: "2026-11-04" },
        undefined,
        null,
        "2026-11-04",
        "2026-10-25",
      )?.section,
    ).toBe("followup");
  });
});

describe("Ask AI about a company (P10, D-054)", () => {
  it("answers from the web with sources; needs a name and a question", async () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("DATABASE_URL", "file:test.db");
    const r = await askAboutCompany(
      t.db,
      a,
      {
        company: { name: "Panelwise", city: "Bangalore" },
        chat: [],
        question: "Where are their offices?",
      },
      NOW,
    );
    expect(r.answer).toContain("Panelwise");
    expect(r.sources).toEqual(["https://www.panelwise.com"]);
    await expect(
      askAboutCompany(t.db, a, { company: { name: "P" }, chat: [], question: "Hi" }, NOW),
    ).rejects.toThrow("Type the company name first.");
    await expect(
      askAboutCompany(t.db, a, { company: { name: "Panelwise" }, chat: [], question: "  " }, NOW),
    ).rejects.toThrow("Type a question first.");
  });
});

describe("demo invitations (D-054)", () => {
  it("the shared rules give the booking link or ask for a date and time, no invented slots", () => {
    expect(GUARDRAILS).toContain("share the CALENDAR LINK exactly as given");
    expect(GUARDRAILS).toContain("reply with a date and time that suits them");
    expect(GUARDRAILS).not.toContain("two specific 20-minute demo slots");
    for (const id of ["P01", "P02", "P03", "P04", "P07"] as const) {
      expect(PROMPTS[id].system).toContain(GUARDRAILS);
    }
    expect(PROMPTS.P10.system).not.toContain(GUARDRAILS);
  });
});
