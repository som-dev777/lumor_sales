// The v1 → v2 data migration (D-029): v1 data goes through migrations 0005 and 0006 and comes
// out with v2 stages, renamed activity types and stage-change targets, nothing broken.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupLocalDb, pendingMigrations } from "./backup";
import { createDb } from "./client";

const V1_LAST = "0004_person_snooze";
let dir: string;
let v1Folder: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lumor-migrate-"));
  // A copy of the migrations folder as it was at v1.5.0.
  v1Folder = join(dir, "drizzle-v1");
  mkdirSync(join(v1Folder, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === V1_LAST);
  journal.entries = journal.entries.slice(0, cut + 1);
  writeFileSync(join(v1Folder, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries)
    copyFileSync(`drizzle/${e.tag}.sql`, join(v1Folder, `${e.tag}.sql`));
  dbPath = join(dir, "app.db");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const V1_STAGES: [string, string][] = [
  ["Prospect", "Prospect"],
  ["Request sent", "Contacted"],
  ["Connected", "Connected"],
  ["Messaged", "Connected"],
  ["Replied", "Replied"],
  ["Demo booked", "Meeting scheduled"],
  ["Demo done", "Meeting done"],
  ["Trial/Pilot", "Trial"],
  ["Paid", "Paid"],
  ["Lost", "Lost"],
];

describe("v1 → v2 migration", () => {
  it("maps every v1 stage as the PRD says, renames demo activities and fills to_stage", async () => {
    const { db, client } = createDb(`file:${dbPath}`);
    await migrate(db, { migrationsFolder: v1Folder });
    await client.execute(
      "INSERT INTO user (id, name, email) VALUES ('u1', 'Asha', 'asha@lumor.tech')",
    );
    for (const [i, [stage]] of V1_STAGES.entries()) {
      await client.execute({
        sql: `INSERT INTO person (id, full_name, linkedin_url, linkedin_url_normalised, owner_id, stage, sequence_step, lost_reason)
              VALUES (?, ?, ?, ?, 'u1', ?, 'Message 1', ?)`,
        args: [
          `p${i}`,
          `Person ${i}`,
          `linkedin.com/in/p${i}`,
          `linkedin.com/in/p${i}`,
          stage,
          stage === "Lost" ? "No budget" : null,
        ],
      });
    }
    const act = (id: string, type: string, content: string | null) =>
      client.execute({
        sql: "INSERT INTO activity (id, person_id, user_id, occurred_at, type, content) VALUES (?, 'p0', 'u1', 0, ?, ?)",
        args: [id, type, content],
      });
    await act("a1", "Demo booked", "Demo on 2026-10-22");
    await act("a2", "Demo held", null);
    await act("a3", "Stage change", "Demo done → Trial/Pilot");
    await act("a4", "Stage change", "Messaged → Lost (No budget)");
    await act("a5", "Request sent", null);

    expect(await pendingMigrations(client)).toEqual(["0005_v2_plans", "0006_drop_v1_sequence"]);
    await migrate(db, { migrationsFolder: "drizzle" });

    const people = await client.execute("SELECT id, stage FROM person ORDER BY id");
    const byId = Object.fromEntries(people.rows.map((r) => [r.id, r.stage]));
    V1_STAGES.forEach(([, v2], i) => expect(byId[`p${i}`]).toBe(v2));

    const acts = await client.execute(
      "SELECT id, type, to_stage, request_note FROM activity ORDER BY id",
    );
    expect(acts.rows.map((r) => [r.id, r.type, r.to_stage, r.request_note])).toEqual([
      ["a1", "Meeting booked", null, 0],
      ["a2", "Meeting held", null, 0],
      ["a3", "Stage change", "Trial", 0],
      ["a4", "Stage change", "Lost", 0],
      ["a5", "Request sent", null, 0],
    ]);

    const cols = await client.execute("PRAGMA table_info(person)");
    expect(cols.rows.map((r) => r.name)).not.toContain("sequence_step");
    expect(cols.rows.map((r) => r.name)).toEqual(
      expect.arrayContaining(["phone", "do_not_contact", "nurture_until"]),
    );
    const settings = await client.execute("PRAGMA table_info(playbook_settings)");
    expect(settings.rows.map((r) => r.name)).not.toContain("follow_up_1_delay_days");
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
    expect(await pendingMigrations(client)).toEqual([]);
    client.close();
  });

  it("backs up a local database file before migrating, and only local files", async () => {
    const { db, client } = createDb(`file:${dbPath}`);
    await migrate(db, { migrationsFolder: v1Folder });
    client.close();
    const backup = backupLocalDb(
      `file:${dbPath}`,
      "0005_v2_plans",
      new Date("2026-10-18T10:00:00Z"),
    );
    expect(backup).toBe(join(dir, "backups", "app-2026-10-18T10-00-00-before-0005_v2_plans.db"));
    expect(existsSync(backup!)).toBe(true);
    expect(readFileSync(backup!).equals(readFileSync(dbPath))).toBe(true);
    expect(backupLocalDb("libsql://prod.turso.io", "x")).toBeNull();
    expect(backupLocalDb(`file:${join(dir, "missing.db")}`, "x")).toBeNull();
  });
});
