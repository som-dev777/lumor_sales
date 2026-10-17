import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatChangeValue, fieldLabel, summariseChanges } from "@/lib/audit-format";
import { csvCell, toCsv } from "@/lib/csv";
import { auditLog } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import {
  allMatchingEntries,
  auditFilterOptions,
  historyFor,
  parseAuditFilters,
  searchAuditLog,
} from "./audit-query";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

async function seed() {
  const admin = await insertTestUser(t.db, {
    name: "Somnath",
    email: "somnath@lumor.tech",
    role: "Admin",
  });
  const rep = await insertTestUser(t.db, { name: "Asha Rep", email: "asha@lumor.tech" });
  const at = (iso: string) => new Date(iso);
  await t.db.insert(auditLog).values([
    // 14 Oct 2026, 23:00 IST (17:30 UTC)
    {
      occurredAt: at("2026-10-14T17:30:00Z"),
      userId: null,
      entityType: "User",
      recordName: "Somnath",
      recordId: admin.id,
      action: "Created",
      changes: { source: { before: null, after: "seed script" } },
    },
    // 15 Oct 2026, 00:30 IST (19:00 UTC on the 14th): an IST date boundary case
    {
      occurredAt: at("2026-10-14T19:00:00Z"),
      userId: admin.id,
      entityType: "Invite",
      recordName: "partner@agency.com",
      recordId: "inv-1",
      action: "Created",
      changes: { role: { before: null, after: "User" } },
    },
    {
      occurredAt: at("2026-10-16T05:00:00Z"),
      userId: admin.id,
      entityType: "User",
      recordName: "Asha Rep",
      recordId: rep.id,
      action: "Role changed",
      changes: { role: { before: "User", after: "Admin" } },
    },
    {
      occurredAt: at("2026-10-16T06:00:00Z"),
      userId: admin.id,
      entityType: "User",
      recordName: "Asha Rep",
      recordId: rep.id,
      action: "Deactivated",
      changes: { active: { before: true, after: false } },
    },
  ]);
  return { admin, rep };
}

describe("searchAuditLog", () => {
  it("lists newest first, with the person's name (or System)", async () => {
    await seed();
    const { entries, total } = await searchAuditLog(t.db, {});
    expect(total).toBe(4);
    expect(entries.map((e) => e.action)).toEqual([
      "Deactivated",
      "Role changed",
      "Created",
      "Created",
    ]);
    expect(entries[0].userName).toBe("Somnath");
    expect(entries[3].userName).toBeNull();
  });

  it("filters by user, including System", async () => {
    const { admin } = await seed();
    expect((await searchAuditLog(t.db, { userId: admin.id })).total).toBe(3);
    expect((await searchAuditLog(t.db, { userId: "system" })).total).toBe(1);
  });

  it("filters by entity type and action", async () => {
    await seed();
    expect((await searchAuditLog(t.db, { entityType: "Invite" })).total).toBe(1);
    expect((await searchAuditLog(t.db, { action: "Deactivated" })).total).toBe(1);
  });

  it("filters by IST date: 00:30 IST on the 15th counts as the 15th", async () => {
    await seed();
    const on15 = await searchAuditLog(t.db, { from: "2026-10-15", to: "2026-10-15" });
    expect(on15.entries.map((e) => e.recordName)).toEqual(["partner@agency.com"]);
    expect((await searchAuditLog(t.db, { to: "2026-10-14" })).total).toBe(1);
    expect((await searchAuditLog(t.db, { from: "2026-10-16" })).total).toBe(2);
  });

  it("searches names, emails, record names and changed values", async () => {
    await seed();
    expect((await searchAuditLog(t.db, { q: "agency" })).total).toBe(1);
    expect((await searchAuditLog(t.db, { q: "asha" })).total).toBe(2);
    expect((await searchAuditLog(t.db, { q: "somnath@lumor" })).total).toBe(3);
    expect((await searchAuditLog(t.db, { q: "seed script" })).total).toBe(1);
    expect((await searchAuditLog(t.db, { q: "100%" })).total).toBe(0);
  });

  it("pages through results", async () => {
    await seed();
    const page2 = await searchAuditLog(t.db, {}, { limit: 3, offset: 3 });
    expect(page2.entries).toHaveLength(1);
    expect(page2.total).toBe(4);
  });
});

describe("other reads", () => {
  it("one record's history, newest first", async () => {
    const { rep } = await seed();
    const history = await historyFor(t.db, "User", rep.id);
    expect(history.map((e) => e.action)).toEqual(["Deactivated", "Role changed"]);
  });

  it("filter choices come from the data", async () => {
    await seed();
    const opts = await auditFilterOptions(t.db);
    expect(opts.entityTypes).toEqual(["Invite", "User"]);
    expect(opts.users.map((u) => u.name)).toEqual(["Asha Rep", "Somnath"]);
  });

  it("export returns every match", async () => {
    await seed();
    expect(await allMatchingEntries(t.db, { entityType: "User" })).toHaveLength(3);
  });
});

describe("parseAuditFilters", () => {
  it("keeps valid values and drops invalid ones", () => {
    expect(
      parseAuditFilters({
        q: "  asha ",
        action: "Deactivated",
        from: "2026-10-01",
        to: "31/10/2026",
        type: "User",
        user: "",
      }),
    ).toEqual({
      q: "asha",
      action: "Deactivated",
      from: "2026-10-01",
      to: undefined,
      entityType: "User",
      userId: undefined,
    });
    expect(parseAuditFilters({ action: "Hacked" }).action).toBeUndefined();
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvCell(null)).toBe("");
  });

  it("defuses spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+91 98")).toBe("'+91 98");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("builds a file Excel reads as UTF-8", () => {
    const file = toCsv(["A", "B"], [["1", "x,y"]]);
    expect(file).toBe(String.fromCharCode(0xfeff) + 'A,B\r\n1,"x,y"\r\n');
  });
});

describe("readable changes", () => {
  it("labels fields and formats values", () => {
    expect(fieldLabel("mustChangePassword")).toBe("Must change password");
    expect(formatChangeValue(true)).toBe("Yes");
    expect(formatChangeValue(null)).toBe("—");
    expect(formatChangeValue(["A", "B"])).toBe("A, B");
    expect(formatChangeValue("2026-10-16T09:00:00.000Z")).toBe("16 Oct 2026, 2:30 pm");
    expect(summariseChanges({ role: { before: "User", after: "Admin" } })).toBe(
      "Role: User → Admin",
    );
    expect(
      summariseChanges({
        name: { before: null, after: "Asha" },
        role: { before: null, after: "User" },
      }),
    ).toBe("Name: Asha; Role: User");
  });
});

describe("readable history (names instead of ids)", () => {
  it("labels id fields plainly and shows names for ids", async () => {
    const { admin } = await seed();
    const { auditNameMap } = await import("./audit-names");
    const changes = {
      ownerId: { before: null, after: admin.id },
      linkedinUrl: { before: null, after: "x" },
    };
    const names = await auditNameMap(t.db, [changes]);
    expect(names[admin.id]).toBe("Somnath");
    expect(fieldLabel("ownerId")).toBe("Owner");
    expect(fieldLabel("companyId")).toBe("Company");
    expect(fieldLabel("linkedinUrl")).toBe("LinkedIn link");
    expect(formatChangeValue(admin.id, names)).toBe("Somnath");
    expect(summariseChanges(changes, names)).toBe("Owner: Somnath; LinkedIn link: x");
  });

  it("leaves out fields that are empty before and after", () => {
    expect(
      summariseChanges({
        name: { before: null, after: "Asha" },
        title: { before: null, after: null },
        tags: { before: [], after: [] },
      }),
    ).toBe("Name: Asha");
  });
});
