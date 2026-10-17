import { describe, expect, it } from "vitest";
import { checkSalesNavUrl, normaliseLinkedInUrl, profileHref, SALES_NAV_REFUSED } from "./linkedin";

const norm = (raw: string) => normaliseLinkedInUrl(raw);

describe("normaliseLinkedInUrl (PRD rule)", () => {
  it("matches the PRD example", () => {
    expect(norm("https://www.LinkedIn.com/in/Priya-S/?utm_source=x")).toEqual({
      ok: true,
      normalised: "linkedin.com/in/priya-s",
    });
  });

  it("gives one result for every common variant of the same profile (R3 exit check)", () => {
    const variants = [
      "https://www.linkedin.com/in/Priya-S/",
      "http://linkedin.com/in/priya-s",
      "linkedin.com/in/PRIYA-S?utm_source=share&utm_medium=member_desktop",
      "https://m.linkedin.com/in/priya-s/#experience",
      "https://in.linkedin.com/in/priya-s/",
      "  www.linkedin.com/in/priya-s/details/experience/  ",
    ];
    const results = variants.map((v) => norm(v));
    expect(new Set(results.map((r) => (r.ok ? r.normalised : r.error)))).toEqual(
      new Set(["linkedin.com/in/priya-s"]),
    );
  });

  it("treats percent-encoded names as the same person", () => {
    expect(norm("https://www.linkedin.com/in/ren%C3%A9e-k/")).toEqual(
      norm("linkedin.com/in/renée-k"),
    );
  });

  it("refuses Sales Navigator links with the PRD's message", () => {
    expect(norm("https://www.linkedin.com/sales/lead/ACwAAA123,NAME_SEARCH")).toEqual({
      ok: false,
      error: SALES_NAV_REFUSED,
    });
  });

  it("refuses links that aren't LinkedIn profiles", () => {
    for (const raw of [
      "https://www.linkedin.com/company/lumor",
      "https://notlinkedin.com/in/priya",
      "https://linkedin.com.evil.com/in/priya",
      "priya-s",
      "https://www.linkedin.com/in/",
    ]) {
      expect(norm(raw).ok).toBe(false);
    }
    expect(norm("   ")).toEqual({ ok: false, error: "Paste the person's LinkedIn profile link." });
  });
});

describe("Sales Navigator field", () => {
  it("accepts Sales Navigator links or nothing, and refuses profile links", () => {
    expect(checkSalesNavUrl("")).toEqual({ ok: true });
    expect(checkSalesNavUrl("https://www.linkedin.com/sales/lead/ACwAAA123")).toEqual({ ok: true });
    expect(checkSalesNavUrl("https://www.linkedin.com/in/priya-s").ok).toBe(false);
  });
});

describe("profileHref", () => {
  it("adds https:// when the link was pasted without it", () => {
    expect(profileHref("linkedin.com/in/priya-s")).toBe("https://linkedin.com/in/priya-s");
    expect(profileHref("https://www.linkedin.com/in/priya-s/")).toBe(
      "https://www.linkedin.com/in/priya-s/",
    );
  });
});
