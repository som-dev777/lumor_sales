import { afterEach, describe, expect, it, vi } from "vitest";
import { noonIst, testDateAllowed } from "./clock";

afterEach(() => vi.unstubAllEnvs());

describe("test date switch (D-033 F10)", () => {
  it("refuses to work unless the database is the local file", () => {
    vi.stubEnv("DATABASE_URL", "libsql://lumor-sales.turso.io");
    expect(testDateAllowed()).toBe(false);
    vi.stubEnv("DATABASE_URL", "");
    expect(testDateAllowed()).toBe(false);
    vi.stubEnv("DATABASE_URL", "file:data/app.db");
    expect(testDateAllowed()).toBe(true);
  });

  it("a test date means noon in India that day", () => {
    expect(noonIst("2026-10-23").toISOString()).toBe("2026-10-23T06:30:00.000Z");
  });
});
