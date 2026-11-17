// D-062: My tasks reads the database a fixed handful of times, however many people there are.
// On the live database every read is a round trip; one set of reads per person made the page
// hang for reps with a few hundred people.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { person, plan } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { enrolPeople, planState } from "./plans/enrolment";
import { seedPlans } from "./plans/seed";
import { buildToday } from "./today";

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
const ids: string[] = [];

beforeEach(async () => {
  t = await createTestDb();
  const u = await insertTestUser(t.db, { name: "Asha" });
  rep = { id: u.id, role: "User", active: true };
  await seedPlans(t.db, u.id);
  const [pl] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
  ids.length = 0;
  for (let i = 0; i < 300; i++) {
    const [row] = await t.db
      .insert(person)
      .values({
        fullName: `Load Person ${i}`,
        linkedinUrl: `https://www.linkedin.com/in/load-${i}`,
        linkedinUrlNormalised: `linkedin.com/in/load-${i}`,
        ownerId: u.id,
        stage: "Contacted",
        createdBy: u.id,
      })
      .returning();
    ids.push(row.id);
  }
  await enrolPeople(t.db, rep, ids.slice(0, 150), pl.id, new Date("2026-10-19T06:30:00Z"));
});
afterEach(() => t.cleanup());

it("300 people, 150 on a plan: My tasks takes at most 20 reads, with every plan step listed", async () => {
  let reads = 0;
  const execute = t.client.execute.bind(t.client);
  t.client.execute = ((...args: Parameters<typeof execute>) => {
    reads++;
    return execute(...args);
  }) as typeof t.client.execute;
  const today = await buildToday(t.db, rep, new Date("2026-10-19T06:30:00Z"));
  t.client.execute = execute;
  expect(reads).toBeLessThanOrEqual(20);
  const steps = today.tasks.filter((x) => x.kind === "step");
  expect(steps).toHaveLength(150);
  // The same answer as reading one person at a time.
  const one = await planState(t.db, ids[0], "2026-10-19");
  expect(steps.find((x) => x.personId === ids[0])).toMatchObject({
    detail: `Step 1 of 5: ${one!.channel}`,
    planName: "Official Outreach",
  });
});
