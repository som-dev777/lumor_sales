// Migration 0022 (Outreach Desk, D-056) is additive only: every existing row is unchanged after
// migrating, the new columns are empty, and the Desk thread shows every old activity in date
// order. The database is first built only up to 0021, filled, snapshotted, then migrated.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { deskThread } from "./ai/desk-thread";

const TAG = "0022_outreach_desk";
let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A copy of drizzle/ that stops before 0022. */
function migrationsBefore(tag: string) {
  const folder = join(dir, "drizzle-before");
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const at = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
  expect(at).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, at);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

const TABLES = ["activity", "person", "user", "ai_chat", "ai_chat_message", "playbook_settings"];
const NEW_COLUMNS: Record<string, string[]> = {
  activity: ["desk_channel", "subject", "from_draft_id", "option_index"],
  person: ["brief"],
  user: ["job_title"],
};

describe("migration 0022 (Outreach Desk) changes no existing data", () => {
  it("keeps every row byte-for-byte, and the thread shows every activity in date order", async () => {
    dir = mkdtempSync(join(tmpdir(), "lumor-mig-"));
    const { db, client } = createDb(`file:${join(dir, "test.db")}`);
    await migrate(db, { migrationsFolder: migrationsBefore(TAG) });
    const has = await client.execute(
      "SELECT count(*) AS n FROM sqlite_master WHERE name = 'desk_entry'",
    );
    expect(Number(has.rows[0].n)).toBe(0);

    // Data as it exists before the Desk: every activity type, a reply type, an AI suggestion,
    // request notes, notes and events, and an AI chat with drafts.
    const sql = (s: string, args: (string | number | null)[] = []) =>
      client.execute({ sql: s, args });
    await sql(
      "INSERT INTO user (id, name, email, role) VALUES ('u1', 'Asha Rao', 'asha@x.com', 'User'), ('u2', 'Somnath', 's@x.com', 'Admin')",
    );
    await sql(
      "INSERT INTO company (id, name, status, owner_id) VALUES ('c1', 'Acme', 'Target', 'u1')",
    );
    await sql(
      "INSERT INTO person (id, full_name, linkedin_url, linkedin_url_normalised, company_id, owner_id, stage) VALUES ('p1', 'Priya Sharma', 'linkedin.com/in/priya', 'linkedin.com/in/priya', 'c1', 'u1', 'Replied')",
    );
    const day = (d: number, h = 10) => Date.UTC(2026, 9, d, h, 0, 0);
    const acts: [
      string,
      number,
      string,
      string,
      string | null,
      string | null,
      string | null,
      number,
      number,
      string | null,
    ][] = [
      // id, occurred, type, channel, direction, content, reply_type, ai_used, request_note, approach
      ["a01", day(1), "Request sent", "LinkedIn", null, null, null, 0, 0, null],
      ["a02", day(2), "Request sent", "LinkedIn", null, "Note text", null, 0, 1, null],
      ["a03", day(3), "Request accepted", "LinkedIn", null, null, null, 0, 0, null],
      ["a04", day(4), "Message sent", "LinkedIn", "out", "Hi Priya", null, 1, 0, "Question first"],
      ["a05", day(5), "InMail sent", "InMail", "out", "Subject-less InMail", null, 0, 0, null],
      ["a06", day(6), "Reply received", "LinkedIn", "in", "Tell me more", "Interested", 0, 0, null],
      ["a07", day(7), "Call", "Call", "out", "Connected", null, 0, 0, null],
      ["a08", day(8), "Meeting note", "LinkedIn", null, "Met at a meetup", null, 0, 0, null],
      ["a09", day(9), "Meeting note", "In person", "out", "Said in the meeting", null, 0, 0, null],
      ["a10", day(10), "Stage change", "LinkedIn", null, "Connected → Replied", null, 0, 0, null],
      ["a11", day(11), "Plan change", "LinkedIn", null, "Plan paused", null, 0, 0, null],
      [
        "a12",
        day(12),
        "Meeting booked",
        "LinkedIn",
        null,
        "Meeting on 2026-10-20",
        null,
        0,
        0,
        null,
      ],
      ["a13", day(13), "Message sent", "WhatsApp", "out", "WhatsApp hello", null, 0, 0, null],
      ["a14", day(13), "Message sent", "Email", "out", "Same-time email", null, 0, 0, null],
      ["a15", day(14), "Profile viewed", "LinkedIn", null, null, null, 0, 0, null],
    ];
    for (const [id, at, type, channel, direction, content, replyType, ai, note, approach] of acts) {
      await sql(
        "INSERT INTO activity (id, person_id, company_id, user_id, occurred_at, created_at, type, channel, direction, content, reply_type, ai_suggestion_used, request_note, suggestion_approach) VALUES (?, 'p1', 'c1', 'u1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          at,
          at + Number(id.slice(1)),
          type,
          channel,
          direction,
          content,
          replyType,
          ai,
          note,
          approach,
        ],
      );
    }
    await sql(
      "INSERT INTO ai_chat (id, person_id, user_id, title, created_at, updated_at) VALUES ('ch1', 'p1', 'u1', 'Help', ?, ?)",
      [day(6, 12), day(6, 12)],
    );
    await sql(
      "INSERT INTO ai_chat_message (id, chat_id, role, content, drafts, flags, created_at) VALUES ('m1', 'ch1', 'rep', 'How do I reply?', '[]', '[]', ?), ('m2', 'ch1', 'ai', 'Here''s a draft.', ?, '[]', ?)",
      [
        day(6, 12),
        JSON.stringify([{ approach: "Book", text: "Hi Priya, 20 minutes?" }]),
        day(6, 12) + 1,
      ],
    );

    const snapshot = async () => {
      const out: Record<string, Record<string, unknown>[]> = {};
      for (const table of TABLES) {
        out[table] = (await sql(`SELECT * FROM "${table}" ORDER BY rowid`)).rows.map((r) => ({
          ...r,
        }));
      }
      return out;
    };
    const before = await snapshot();

    // The real migrator applies 0022 on top.
    await migrate(db, { migrationsFolder: "drizzle" });
    const after = await snapshot();

    for (const table of TABLES) {
      expect(after[table]).toHaveLength(before[table].length);
      after[table].forEach((row, i) => {
        const old = before[table][i];
        // Every old column is exactly as it was.
        for (const [col, value] of Object.entries(old))
          expect(row[col], `${table}.${col}`).toEqual(value);
        // Only the Desk's new columns were added, and they're empty.
        const added = Object.keys(row).filter((c) => !(c in old));
        expect(added.sort()).toEqual([...(NEW_COLUMNS[table] ?? [])].sort());
        for (const col of added) expect(row[col]).toBeNull();
      });
    }
    const fk = await sql("PRAGMA foreign_key_check");
    expect(fk.rows).toHaveLength(0);

    // The thread shows every activity exactly once, in date order, mapped for display.
    const thread = await deskThread(db, { id: "u1" }, "p1");
    const activityItems = thread.filter((i) => acts.some((a) => a[0] === i.id));
    expect(activityItems.map((i) => i.id)).toEqual(acts.map((a) => a[0]));
    const kinds = Object.fromEntries(activityItems.map((i) => [i.id, i.kind]));
    expect(kinds).toEqual({
      a01: "sent",
      a02: "sent",
      a03: "event",
      a04: "sent",
      a05: "sent",
      a06: "them",
      a07: "sent",
      a08: "info",
      a09: "sent",
      a10: "event",
      a11: "event",
      a12: "event",
      a13: "sent",
      a14: "sent",
      a15: "event",
    });
    expect(thread.find((i) => i.id === "a02")).toMatchObject({
      channel: "LinkedIn connection note",
    });
    expect(thread.find((i) => i.id === "a04")).toMatchObject({ approach: "Question first" });
    expect(thread.find((i) => i.id === "a06")).toMatchObject({ replyType: "Interested" });
    expect(thread.find((i) => i.id === "a07")).toMatchObject({ called: true });
    // The chat shows to its author, in time order (after the reply on day 6), and not to others.
    const ids = thread.map((i) => i.id);
    expect(ids.indexOf("m1")).toBe(ids.indexOf("a06") + 1);
    expect(thread.find((i) => i.id === "m2")).toMatchObject({ kind: "draft", source: "chat" });
    expect((await deskThread(db, { id: "u2" }, "p1")).map((i) => i.id)).toEqual(
      acts.map((a) => a[0]),
    );
    // Reading the thread changed nothing.
    expect(await snapshot()).toEqual(after);
    client.close();
  });
});
