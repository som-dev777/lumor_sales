import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { compareVersions, latestReleases, parseChangelog, syncReleases } from "./releases";

const SAMPLE = `# Changelog

Intro text that isn't a release.

## [Unreleased]

Work in progress.

- Not shipped yet.

## [1.1.0] - 2026-11-02

Library release.

- Personas and account filters.
- Templates with versions, which
  can wrap onto a second line.

## [1.0.0] - 2026-10-16

Foundation release.

- Login and users.
`;

describe("parseChangelog", () => {
  it("reads releases, skips Unreleased, joins wrapped bullets", () => {
    expect(parseChangelog(SAMPLE)).toEqual([
      {
        version: "1.1.0",
        releaseDate: "2026-11-02",
        summary: "Library release.",
        changes: [
          "Personas and account filters.",
          "Templates with versions, which can wrap onto a second line.",
        ],
      },
      {
        version: "1.0.0",
        releaseDate: "2026-10-16",
        summary: "Foundation release.",
        changes: ["Login and users."],
      },
    ]);
  });

  it("names the line of a malformed heading", () => {
    expect(() => parseChangelog("## 1.0.0 - 2026-10-16\n\nX.\n\n- y")).toThrow(/line 1: heading/);
    expect(() => parseChangelog("## [1.0] - 2026-10-16\n\nX.\n\n- y")).toThrow(/isn't a version/);
    expect(() => parseChangelog("## [1.0.0]\n\nX.\n\n- y")).toThrow(/needs a date/);
    expect(() => parseChangelog("## [1.0.0] - 2026-02-30\n\nX.\n\n- y")).toThrow(/needs a date/);
  });

  it("refuses a release without a summary or without changes, or listed twice", () => {
    expect(() => parseChangelog("## [1.0.0] - 2026-10-16\n\n- only a bullet")).toThrow(
      /no summary/,
    );
    expect(() => parseChangelog("## [1.0.0] - 2026-10-16\n\nJust a summary.")).toThrow(
      /no changes/,
    );
    const twice = "## [1.0.0] - 2026-10-16\n\nA.\n\n- a\n\n## [1.0.0] - 2026-10-17\n\nB.\n\n- b";
    expect(() => parseChangelog(twice)).toThrow(/appears twice/);
  });

  it("compares versions as numbers", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("syncReleases", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    t = await createTestDb();
  });
  afterEach(() => t.cleanup());

  it("adds missing releases once, newest shown first, each audited", async () => {
    const releases = parseChangelog(SAMPLE);
    expect((await syncReleases(t.db, releases)).map((r) => r.version)).toEqual(["1.1.0", "1.0.0"]);
    expect(await syncReleases(t.db, releases)).toEqual([]);
    expect((await latestReleases(t.db)).map((r) => r.version)).toEqual(["1.1.0", "1.0.0"]);
    const audit = await t.db.select().from(auditLog);
    expect(audit.map((a) => [a.entityType, a.recordName])).toEqual([
      ["AppRelease", "v1.1.0"],
      ["AppRelease", "v1.0.0"],
    ]);
  });

  it("shows at most 5", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      version: `1.${i}.0`,
      releaseDate: `2026-10-${String(10 + i).padStart(2, "0")}`,
      summary: `Release ${i}.`,
      changes: ["x"],
    }));
    await syncReleases(t.db, many);
    expect((await latestReleases(t.db)).map((r) => r.version)).toEqual([
      "1.6.0",
      "1.5.0",
      "1.4.0",
      "1.3.0",
      "1.2.0",
    ]);
  });
});

describe("the real CHANGELOG", () => {
  it("is valid", () => {
    expect(() => parseChangelog(readFileSync("docs/CHANGELOG.md", "utf8"))).not.toThrow();
  });

  it("package.json's version matches the newest release (or is 0.x before the first)", () => {
    const releases = parseChangelog(readFileSync("docs/CHANGELOG.md", "utf8"));
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const newest = [...releases].sort((a, b) => compareVersions(b.version, a.version))[0];
    if (newest) expect(version).toBe(newest.version);
    else expect(version.startsWith("0.")).toBe(true);
  });
});
