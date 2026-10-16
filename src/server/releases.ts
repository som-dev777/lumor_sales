// Releases for the About page (F16). docs/CHANGELOG.md is the source; `npm run releases:sync`
// copies released versions into the app_release table, which the About page reads.
import { desc } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { appRelease } from "@/lib/db/schema";
import { isIstDate } from "@/lib/time";

export type Release = { version: string; releaseDate: string; summary: string; changes: string[] };

export class ChangelogError extends Error {
  constructor(line: number, message: string) {
    super(`CHANGELOG.md line ${line}: ${message}`);
    this.name = "ChangelogError";
  }
}

const HEADING = /^## \[([^\]]+)\](?:\s+-\s+(.+))?\s*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Reads the CHANGELOG format described at the top of docs/CHANGELOG.md:
 * `## [X.Y.Z] - YYYY-MM-DD`, then a one-sentence summary line, then `- ` bullets.
 * "Unreleased" is skipped. Anything malformed is an error naming the line, so a typo can't
 * silently drop a release.
 */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let current: (Release & { line: number }) | null = null;
  let skipping = false;

  const finish = () => {
    if (!current) return;
    if (!current.summary)
      throw new ChangelogError(current.line, `release ${current.version} has no summary line.`);
    if (current.changes.length === 0)
      throw new ChangelogError(current.line, `release ${current.version} lists no changes.`);
    const { line: _line, ...release } = current;
    releases.push(release);
    current = null;
  };

  markdown.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trimEnd();

    if (text.startsWith("## ")) {
      finish();
      const m = HEADING.exec(text);
      if (!m) throw new ChangelogError(line, `heading must look like "## [1.0.0] - 2026-10-16".`);
      const [, version, date] = m;
      if (version.toLowerCase() === "unreleased") {
        skipping = true;
        return;
      }
      skipping = false;
      if (!SEMVER.test(version))
        throw new ChangelogError(line, `"${version}" isn't a version like 1.0.0.`);
      if (!date || !isIstDate(date.trim()))
        throw new ChangelogError(line, `release ${version} needs a date like 2026-10-16.`);
      if (releases.some((r) => r.version === version))
        throw new ChangelogError(line, `release ${version} appears twice.`);
      current = { version, releaseDate: date.trim(), summary: "", changes: [], line };
      return;
    }

    if (skipping || !current || !text.trim()) return;
    const release: Release & { line: number } = current;
    if (text.startsWith("- ")) {
      release.changes.push(text.slice(2).trim());
    } else if (/^\s+\S/.test(raw) && release.changes.length > 0) {
      // An indented line continues the previous bullet.
      release.changes[release.changes.length - 1] += ` ${text.trim()}`;
    } else if (!release.summary) {
      release.summary = text.trim();
    } else {
      throw new ChangelogError(
        line,
        `unexpected text in release ${release.version}; use "- " bullets.`,
      );
    }
  });
  finish();

  return releases;
}

/** Adds releases that aren't in the database yet (existing ones are never changed). */
export async function syncReleases(db: Db, releases: Release[]) {
  return db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ v: appRelease.version }).from(appRelease)).map((r) => r.v),
    );
    const added: Release[] = [];
    for (const r of releases) {
      if (existing.has(r.version)) continue;
      const [row] = await tx.insert(appRelease).values(r).returning();
      await writeAudit(tx, {
        userId: null,
        entityType: "AppRelease",
        recordId: row.id,
        recordName: `v${r.version}`,
        action: "Created",
        after: { version: r.version, releaseDate: r.releaseDate, summary: r.summary },
      });
      added.push(r);
    }
    return added;
  });
}

/** The newest releases first, compared by version number (1.10.0 is newer than 1.9.0). */
export async function latestReleases(db: DbOrTx, limit = 5) {
  const rows = await db.select().from(appRelease).orderBy(desc(appRelease.releaseDate));
  return rows.sort((a, b) => compareVersions(b.version, a.version)).slice(0, limit);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
