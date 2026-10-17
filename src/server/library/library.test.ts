import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, person, persona, proposal, templateRevision } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import {
  accountFilterSchema,
  personaSchema,
  placeholdersIn,
  templateSchema,
} from "@/lib/validation/library";
import {
  approveProposal,
  countPendingProposals,
  listPendingProposals,
  myProposals,
  rejectProposal,
} from "./approvals";
import {
  createItem,
  deleteItem,
  duplicateItem,
  LibraryError,
  loadItem,
  proposeItem,
  setArchived,
  updateItem,
} from "./items";
import { personaOptions } from "./queries";
import { leadStats, templateStats } from "./stats";

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

const personaData = (name = "Research & Insights") =>
  personaSchema.parse({
    name,
    tier: 1,
    functions: ["Research", "Insights"],
    seniority: ["Director"],
    jobTitles: ["Head of Research", " ", "Head of Research"],
    geography: ["India"],
    leadWithAngle: "One platform from survey to panel to report",
    whoItCovers: "",
  });
const filterData = (code = "A1") =>
  accountFilterSchema.parse({
    code,
    name: "Research Agencies",
    industries: ["Market Research"],
    hqLocations: ["India"],
  });
const templateData = (body = "Hi {Name}, how is research set up at {Company}?") =>
  templateSchema.parse({
    name: "Message 1 – R&I",
    purpose: "Message 1",
    level: "Any",
    version: "A",
    body,
  });

const newPersona = (actor: Actor, type: "Official" | "Personal" = "Personal", name?: string) =>
  createItem(t.db, actor, type, { kind: "persona", data: personaData(name) });

let leadN = 0;
async function addLead(over: Partial<typeof person.$inferInsert>) {
  leadN += 1;
  const [row] = await t.db
    .insert(person)
    .values({
      fullName: `Lead ${leadN}`,
      linkedinUrl: `https://linkedin.com/in/lead-${leadN}`,
      linkedinUrlNormalised: `linkedin.com/in/lead-${leadN}-${crypto.randomUUID()}`,
      ownerId: rep.id,
      ...over,
    })
    .returning();
  return row;
}
const log = (
  personId: string,
  type: (typeof activity.$inferInsert)["type"],
  at: string,
  extra: Partial<typeof activity.$inferInsert> = {},
) =>
  t.db
    .insert(activity)
    .values({ personId, userId: rep.id, occurredAt: new Date(at), type, ...extra });

describe("form rules", () => {
  it("clean up lists and empty text", () => {
    const d = personaData();
    expect(d.jobTitles).toEqual(["Head of Research"]);
    expect(d.whoItCovers).toBeNull();
  });
  it("refuse a bad tier or account filter code", () => {
    expect(personaSchema.safeParse({ ...personaData(), tier: 4 }).success).toBe(false);
    expect(accountFilterSchema.safeParse({ ...filterData(), code: "A 1" }).success).toBe(false);
  });
  it("accept new function and seniority options, within limits (D-018)", () => {
    const d = personaSchema.parse({
      ...personaData(),
      functions: ["Operations", " Operations "],
      seniority: ["Founder's office"],
    });
    expect(d.functions).toEqual(["Operations"]);
    expect(d.seniority).toEqual(["Founder's office"]);
    expect(personaSchema.safeParse({ ...personaData(), functions: ["x".repeat(41)] }).success).toBe(
      false,
    );
    expect(personaSchema.safeParse({ ...personaData(), functions: [""] }).success).toBe(false);
  });
  it("find template placeholders", () => {
    expect(placeholdersIn("Hi {Name}, {Company} and {Name} again, {slot 1}")).toEqual([
      "Name",
      "Company",
      "slot 1",
    ]);
  });
});

describe("create and edit (permissions)", () => {
  it("anyone creates Personal items; only Admins create Official ones", async () => {
    const mine = await newPersona(rep);
    expect(mine).toMatchObject({
      type: "Personal",
      ownerId: rep.id,
      status: "Active",
      proposalStatus: "None",
    });
    await expect(newPersona(rep, "Official")).rejects.toThrow(PermissionError);
    expect((await newPersona(admin, "Official")).type).toBe("Official");
  });

  it("only the owner edits a Personal item; only Admins edit Official ones", async () => {
    const mine = await newPersona(rep);
    const official = await newPersona(admin, "Official");
    const edit = (actor: Actor, id: string) =>
      updateItem(t.db, actor, id, { kind: "persona", data: { ...personaData(), name: "Renamed" } });

    expect((await edit(rep, mine.id)).name).toBe("Renamed");
    await expect(edit(rep2, mine.id)).rejects.toThrow(PermissionError);
    await expect(edit(admin, mine.id)).rejects.toThrow(PermissionError); // D-017
    await expect(edit(rep, official.id)).rejects.toThrow(PermissionError);
    expect((await edit(admin, official.id)).name).toBe("Renamed");
  });

  it("writes Created and Updated audit entries with before/after", async () => {
    const mine = await newPersona(rep);
    await updateItem(t.db, rep, mine.id, { kind: "persona", data: { ...personaData(), tier: 2 } });
    const entries = await t.db.select().from(auditLog).orderBy(auditLog.occurredAt);
    expect(entries.map((e) => [e.entityType, e.action])).toEqual([
      ["Persona", "Created"],
      ["Persona", "Updated"],
    ]);
    expect(entries[1].changes).toEqual({ tier: { before: 1, after: 2 } });
  });
});

describe("account filter codes", () => {
  it("are unique among Official filters, free among Personal ones", async () => {
    await createItem(t.db, admin, "Official", { kind: "accountFilter", data: filterData("A1") });
    await expect(
      createItem(t.db, admin, "Official", { kind: "accountFilter", data: filterData("A1") }),
    ).rejects.toThrow(/already uses the code A1/);
    await createItem(t.db, rep, "Personal", { kind: "accountFilter", data: filterData("A1") });
  });
});

describe("templates", () => {
  it("editing the wording keeps the old wording as a revision; other edits don't", async () => {
    const tpl = await createItem(t.db, rep, "Personal", {
      kind: "template",
      data: templateData("First wording {Name}"),
    });
    await updateItem(t.db, rep, tpl.id, {
      kind: "template",
      data: { ...templateData("First wording {Name}"), name: "New name" },
    });
    expect(await t.db.select().from(templateRevision)).toHaveLength(0);

    const edited = await updateItem(t.db, rep, tpl.id, {
      kind: "template",
      data: templateData("Second wording {Name}"),
    });
    expect(edited).toMatchObject({ revision: 2, body: "Second wording {Name}" });
    const revisions = await t.db.select().from(templateRevision);
    expect(revisions).toMatchObject([
      { templateId: tpl.id, revision: 1, body: "First wording {Name}" },
    ]);
  });

  it("can't use an archived persona", async () => {
    const p = await newPersona(rep);
    await setArchived(t.db, rep, "persona", p.id, true);
    await expect(
      createItem(t.db, rep, "Personal", {
        kind: "template",
        data: { ...templateData(), personaId: p.id },
      }),
    ).rejects.toThrow(/archived/);
  });
});

describe("archive, restore and delete", () => {
  it("archive and restore, with audit entries", async () => {
    const p = await newPersona(rep);
    expect((await setArchived(t.db, rep, "persona", p.id, true)).status).toBe("Archived");
    expect((await setArchived(t.db, rep, "persona", p.id, false)).status).toBe("Active");
    await expect(setArchived(t.db, rep2, "persona", p.id, true)).rejects.toThrow(PermissionError);
  });

  it("an unused item can be deleted", async () => {
    const p = await newPersona(rep);
    await deleteItem(t.db, rep, "persona", p.id);
    await expect(loadItem(t.db, "persona", p.id)).rejects.toThrow(LibraryError);
  });

  it("an item leads point to can't be deleted, only archived", async () => {
    const p = await newPersona(rep);
    await addLead({ personaId: p.id });
    await addLead({ personaId: p.id });
    await expect(deleteItem(t.db, rep, "persona", p.id)).rejects.toThrow(
      "This persona is used by 2 leads, so it can't be deleted. Archive it instead.",
    );
    await setArchived(t.db, rep, "persona", p.id, true);
  });

  it("a template with old revisions can still be deleted if unused", async () => {
    const tpl = await createItem(t.db, rep, "Personal", {
      kind: "template",
      data: templateData("A {Name}"),
    });
    await updateItem(t.db, rep, tpl.id, { kind: "template", data: templateData("B {Name}") });
    await deleteItem(t.db, rep, "template", tpl.id);
    expect(await t.db.select().from(templateRevision)).toHaveLength(0);
  });
});

describe("duplicate", () => {
  it("anyone copies anything into their own Personal item", async () => {
    const official = await newPersona(admin, "Official");
    const copy = await duplicateItem(t.db, rep, "persona", official.id);
    expect(copy).toMatchObject({
      type: "Personal",
      ownerId: rep.id,
      name: "Copy of Research & Insights",
      proposalStatus: "None",
      tier: 1,
    });
    expect((copy as typeof persona.$inferSelect).jobTitles).toEqual(["Head of Research"]);
  });

  it("an account filter copy gets a -copy code; a template copy starts at revision 1", async () => {
    const f = await createItem(t.db, admin, "Official", {
      kind: "accountFilter",
      data: filterData("A3"),
    });
    expect(await duplicateItem(t.db, rep, "accountFilter", f.id)).toMatchObject({
      code: "A3-copy",
    });
    const tpl = await createItem(t.db, rep, "Personal", {
      kind: "template",
      data: templateData("A {Name}"),
    });
    await updateItem(t.db, rep, tpl.id, { kind: "template", data: templateData("B {Name}") });
    expect(await duplicateItem(t.db, rep2, "template", tpl.id)).toMatchObject({
      revision: 1,
      body: "B {Name}",
    });
  });
});

describe("proposals (F07)", () => {
  it("only the owner proposes a Personal item, once while pending", async () => {
    const mine = await newPersona(rep);
    await expect(proposeItem(t.db, rep2, "persona", mine.id)).rejects.toThrow(PermissionError);
    await proposeItem(t.db, rep, "persona", mine.id);
    expect((await loadItem(t.db, "persona", mine.id)).proposalStatus).toBe("Proposed");
    await expect(proposeItem(t.db, rep, "persona", mine.id)).rejects.toThrow(/already waiting/);
    const official = await newPersona(admin, "Official");
    await expect(proposeItem(t.db, admin, "persona", official.id)).rejects.toThrow(PermissionError);
    expect(await countPendingProposals(t.db)).toBe(1);
  });

  it("approving makes it Official and Admin-owned; the proposer is kept", async () => {
    const mine = await newPersona(rep);
    const prop = await proposeItem(t.db, rep, "persona", mine.id);
    await expect(approveProposal(t.db, rep, prop.id)).rejects.toThrow(PermissionError);

    const approved = await approveProposal(t.db, admin, prop.id);
    expect(approved).toMatchObject({
      type: "Official",
      ownerId: admin.id,
      proposalStatus: "Approved",
    });
    const [p] = await t.db.select().from(proposal).where(eq(proposal.id, prop.id));
    expect(p).toMatchObject({ decision: "Approved", decidedBy: admin.id, proposedBy: rep.id });

    // Now locked for the User who proposed it
    await expect(
      updateItem(t.db, rep, mine.id, { kind: "persona", data: personaData() }),
    ).rejects.toThrow(PermissionError);
    await expect(approveProposal(t.db, admin, prop.id)).rejects.toThrow(/already been decided/);
  });

  it("rejecting keeps it Personal with the note; the owner can propose again", async () => {
    const mine = await newPersona(rep);
    const prop = await proposeItem(t.db, rep, "persona", mine.id);
    await rejectProposal(t.db, admin, prop.id, "Too close to Research & Insights");
    expect(await loadItem(t.db, "persona", mine.id)).toMatchObject({
      type: "Personal",
      proposalStatus: "Rejected",
    });
    const outcomes = await myProposals(t.db, rep.id, "persona");
    expect(outcomes[0]).toMatchObject({
      decision: "Rejected",
      reviewerNote: "Too close to Research & Insights",
      decidedByName: "Somnath",
    });
    await proposeItem(t.db, rep, "persona", mine.id);
  });

  it("an account filter whose code clashes with an Official one can't be approved", async () => {
    await createItem(t.db, admin, "Official", { kind: "accountFilter", data: filterData("A1") });
    const mine = await createItem(t.db, rep, "Personal", {
      kind: "accountFilter",
      data: filterData("A1"),
    });
    const prop = await proposeItem(t.db, rep, "accountFilter", mine.id);
    await expect(approveProposal(t.db, admin, prop.id)).rejects.toThrow(/already uses the code A1/);
  });

  it("archiving withdraws a pending proposal", async () => {
    const mine = await newPersona(rep);
    await proposeItem(t.db, rep, "persona", mine.id);
    await setArchived(t.db, rep, "persona", mine.id, true);
    expect(await countPendingProposals(t.db)).toBe(0);
    const [p] = await t.db.select().from(proposal);
    expect(p).toMatchObject({ decision: "Rejected", reviewerNote: "Withdrawn by the owner" });
  });

  it("the queue shows the item and who proposed it; audit has Created, Approved", async () => {
    const mine = await newPersona(rep, "Personal", "Agency Ops");
    const prop = await proposeItem(t.db, rep, "persona", mine.id);
    const queue = await listPendingProposals(t.db);
    expect(queue).toMatchObject([
      { id: prop.id, kind: "persona", itemName: "Agency Ops", proposedByName: "Asha" },
    ]);
    await approveProposal(t.db, admin, prop.id);
    const actions = (await t.db.select().from(auditLog).orderBy(auditLog.occurredAt)).map(
      (e) => `${e.entityType}:${e.action}`,
    );
    expect(actions).toEqual(["Persona:Created", "Proposal:Created", "Persona:Approved"]);
  });
});

describe("live stats", () => {
  it("count each persona's own leads, replies, demos, paid and reply rate", async () => {
    const p = await newPersona(rep);
    const other = await newPersona(rep, "Personal", "Other");
    const a = await addLead({ personaId: p.id });
    const b = await addLead({ personaId: p.id, converted: true });
    await addLead({ personaId: p.id });
    await addLead({ personaId: other.id });
    await log(a.id, "Request accepted", "2026-10-01T10:00:00Z");
    await log(b.id, "Request accepted", "2026-10-01T10:00:00Z");
    await log(a.id, "Reply received", "2026-10-03T10:00:00Z", { replyType: "Interested" });
    await log(a.id, "Reply received", "2026-10-04T10:00:00Z", { replyType: "Interested" });
    await log(a.id, "Demo booked", "2026-10-05T10:00:00Z");

    const stats = (await leadStats(t.db, "persona")).get(p.id);
    expect(stats).toEqual({ leads: 3, replied: 1, demos: 1, paid: 1, accepted: 2, replyRate: 0.5 });
    expect((await leadStats(t.db, "persona")).get(other.id)?.replyRate).toBeNull();
  });

  it("templates: times used and reply rate after the first message", async () => {
    const tpl = await createItem(t.db, rep, "Personal", { kind: "template", data: templateData() });
    const a = await addLead({});
    const b = await addLead({});
    await log(a.id, "Message sent", "2026-10-01T10:00:00Z", { templateId: tpl.id });
    await log(b.id, "Message sent", "2026-10-01T10:00:00Z", { templateId: tpl.id });
    await log(b.id, "Message sent", "2026-10-05T10:00:00Z", { templateId: tpl.id });
    await log(a.id, "Reply received", "2026-10-02T10:00:00Z", { replyType: "Not now" });
    await log(b.id, "Reply received", "2026-09-30T10:00:00Z", { replyType: "Not now" }); // before: doesn't count

    expect((await templateStats(t.db)).get(tpl.id)).toEqual({
      timesUsed: 3,
      messaged: 2,
      replied: 1,
      replyRate: 0.5,
    });
  });
});

describe("persona options (D-018)", () => {
  it("offer the built-in lists, then options the team added, A–Z", async () => {
    await createItem(t.db, rep, "Personal", {
      kind: "persona",
      data: personaSchema.parse({
        ...personaData(),
        functions: ["Research", "Operations", "Finance"],
        seniority: ["Founder's office"],
      }),
    });
    const opts = await personaOptions(t.db);
    expect(opts.functions.slice(0, 9)).toEqual([
      "Research",
      "Insights",
      "Product",
      "Design",
      "CX",
      "Brand",
      "Marketing",
      "Leadership",
      "Consulting",
    ]);
    expect(opts.functions.slice(9)).toEqual(["Finance", "Operations"]);
    expect(opts.seniority.at(-1)).toBe("Founder's office");
    expect(opts.seniority).toHaveLength(9);
  });
});

describe("template helpers (F06)", () => {
  it("split a body into text and {placeholders}", async () => {
    const { splitPlaceholders } = await import("@/lib/validation/library");
    expect(splitPlaceholders("Hi {Name}, at {Company}.")).toEqual([
      { text: "Hi ", placeholder: false },
      { text: "{Name}", placeholder: true },
      { text: ", at ", placeholder: false },
      { text: "{Company}", placeholder: true },
      { text: ".", placeholder: false },
    ]);
    expect(splitPlaceholders("No placeholders")).toEqual([
      { text: "No placeholders", placeholder: false },
    ]);
  });

  it("list earlier wordings newest first, with who replaced them", async () => {
    const { templateRevisionsFor } = await import("./queries");
    const tpl = await createItem(t.db, rep, "Personal", {
      kind: "template",
      data: templateData("One {Name}"),
    });
    await updateItem(t.db, rep, tpl.id, { kind: "template", data: templateData("Two {Name}") });
    await updateItem(t.db, rep, tpl.id, { kind: "template", data: templateData("Three {Name}") });
    const revisions = await templateRevisionsFor(t.db, tpl.id);
    expect(revisions.map((r) => [r.revision, r.body, r.replacedBy])).toEqual([
      [2, "Two {Name}", "Asha"],
      [1, "One {Name}", "Asha"],
    ]);
  });
});
