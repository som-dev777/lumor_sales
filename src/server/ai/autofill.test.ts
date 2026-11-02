// F24: Fill with AI. Only empty fields are filled; list names become ids; low confidence fills
// nothing; the Bangalore/India rule is in the prompt; only users who can add leads.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { accountFilter, industry, persona } from "@/lib/db/schema";
import { companyFillSchema, fillCompany, fillPerson } from "./autofill";
import { PROMPTS } from "./prompts";

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;

beforeEach(async () => {
  t = await createTestDb();
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  vi.stubEnv("AI_FAKE", "1");
  vi.stubEnv("DATABASE_URL", "file:test.db");
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

describe("Fill with AI: company (P08)", () => {
  it("fills only the empty fields, and adds its notes below the rep's", async () => {
    await t.db.insert(industry).values([{ name: "Market Research" }]);
    const r = await fillCompany(t.db, rep, {
      name: "Acme Panels",
      website: "https://acme.example",
      country: "India",
      notes: "Met at a meetup.",
    });
    expect(r.confidence).toBe("high");
    expect(r.searched).toBe(true);
    expect(r.values).toEqual({
      linkedinUrl: "https://www.linkedin.com/company/acmepanels",
      industry: "Market Research",
      headcountBand: "51–200",
      city: "Bangalore",
      notes:
        "Met at a meetup.\n\nAcme Panels runs consumer research panels. Headquarters: London, United Kingdom.",
    });
  });

  it("matches the account filter by code; a name is needed first", async () => {
    const [f] = await t.db
      .insert(accountFilter)
      .values({ code: "AF-01", name: "Research agencies", type: "Official", ownerId: rep.id })
      .returning();
    const r = await fillCompany(t.db, rep, { name: "Beta" });
    expect(r.values.accountFilterId).toBe(f.id);
    await expect(fillCompany(t.db, rep, { name: " " })).rejects.toThrow(
      "Type the company name first.",
    );
  });

  it("low confidence fills nothing", async () => {
    const r = await fillCompany(t.db, rep, { name: "Unknown Co" });
    expect(r.confidence).toBe("low");
    expect(r.values).toEqual({});
  });

  it("deactivated users can't use it", async () => {
    await expect(fillCompany(t.db, { ...rep, active: false }, { name: "Acme" })).rejects.toThrow(
      PermissionError,
    );
  });

  it("the prompt keeps addresses in India, Bangalore first, and notes a foreign headquarters", () => {
    const p = PROMPTS.P08.system;
    expect(p).toContain('If the company has an office in Bangalore, city is "Bangalore"');
    expect(p).toContain('country is "India"');
    expect(p).toContain("Headquarters: London, United Kingdom");
  });

  it("the answer's shape has a confidence", () => {
    expect(() =>
      companyFillSchema.parse({
        website: null,
        linkedinUrl: null,
        industry: null,
        headcountBand: null,
        city: null,
        country: null,
        accountFilterCode: null,
        notes: null,
        confidence: "unsure",
        sources: [],
        checks: [],
      }),
    ).toThrow();
  });
});

describe("Fill with AI: person (P09)", () => {
  it("matches the persona by name and fills only what's empty", async () => {
    const [p] = await t.db
      .insert(persona)
      .values({ name: "Insights Lead", type: "Official", ownerId: rep.id, tier: 1 })
      .returning();
    const r = await fillPerson(t.db, rep, {
      fullName: "Priya Sharma",
      companyName: "Acme",
      title: "VP Insights",
      market: "India",
      level: "",
      doNotContact: false,
    });
    expect(r.values).toEqual({
      personaId: p.id,
      level: "Leader",
      seniority: "Director",
      notes: "Leads the research team.",
    });
    expect(r.checks).toEqual(["Check the title on their LinkedIn profile."]);
  });

  it("an unknown persona is ignored; the name and a company or LinkedIn link are needed", async () => {
    const r = await fillPerson(t.db, rep, { fullName: "Priya", linkedinUrl: "linkedin.com/in/p" });
    expect(r.values.personaId).toBeUndefined();
    await expect(fillPerson(t.db, rep, { fullName: "Priya" })).rejects.toThrow(
      "Type the full name and the company (or LinkedIn link) first.",
    );
  });
});
