import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loginAttempt } from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { loginPausedUntil, recordLoginAttempt } from "./login-limit";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const base = Date.UTC(2026, 9, 17, 6, 0);
const min = (m: number) => new Date(base + m * 60_000);
const fail = (m: number, email = "asha@lumor.tech") =>
  recordLoginAttempt(t.db, email, false, min(m));

describe("pausing logins after wrong passwords (D-023)", () => {
  it("5 wrong passwords within 15 minutes pause that email for 15 minutes", async () => {
    for (const m of [0, 1, 2, 3]) await fail(m);
    expect(await loginPausedUntil(t.db, "asha@lumor.tech", min(4))).toBeNull();
    await fail(4);
    expect(await loginPausedUntil(t.db, "ASHA@lumor.tech", min(5))).toEqual(min(19));
    expect(await loginPausedUntil(t.db, "asha@lumor.tech", min(19))).toBeNull();
    // Another email isn't affected.
    expect(await loginPausedUntil(t.db, "ravi@lumor.tech", min(5))).toBeNull();
  });

  it("failures spread over more than 15 minutes don't pause", async () => {
    for (const m of [0, 5, 10, 16, 20]) await fail(m);
    expect(await loginPausedUntil(t.db, "asha@lumor.tech", min(21))).toBeNull();
  });

  it("a successful login resets the count", async () => {
    for (const m of [0, 1, 2]) await fail(m);
    await recordLoginAttempt(t.db, "asha@lumor.tech", true, min(3));
    for (const m of [4, 5]) await fail(m);
    expect(await loginPausedUntil(t.db, "asha@lumor.tech", min(6))).toBeNull();
  });

  it("attempts older than a day are pruned", async () => {
    await fail(0);
    await fail(60 * 25);
    expect(await t.db.select().from(loginAttempt)).toHaveLength(1);
  });
});
