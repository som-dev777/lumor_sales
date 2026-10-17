// Seed plans (F17). The Official Outreach plan is exactly the PRD's, as decided in D-033: five
// steps, waits 2 → 4 → 7 → 10, with step 4 trying Call, then Email, then LinkedIn. The Meeting
// follow-up, Trial and Onboarding plans are drafts: seeded as Proposed so an Admin approves
// them (Approvals) before use. Safe to run again: existing plans (same name) are left alone.
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import type { PlanType } from "@/lib/db/enums";
import { plan, planStep, proposal, type ChannelOption } from "@/lib/db/schema";

type SeedStep = Omit<typeof planStep.$inferInsert, "planId" | "version" | "stepOrder">;
type SeedPlan = { name: string; planType: PlanType; draft: boolean; steps: SeedStep[] };

const only = (channel: ChannelOption["channel"]): ChannelOption[] => [{ channel, when: "always" }];

export const OUTREACH_CALL_SCRIPT =
  "Hi {First name}, this is {My name} from Lumor. I sent you a note on LinkedIn about running research from brief to report in one place. Is now a bad time for two minutes? (If yes: when is better?) Ask how they run surveys and recruitment today, listen, then offer a 20-minute look at it on a study like theirs.";

export const SEED_PLANS: SeedPlan[] = [
  {
    name: "Official Outreach",
    planType: "Outreach",
    draft: false,
    steps: [
      { channels: only("LinkedIn connection request"), waitDays: 0 },
      { channels: only("LinkedIn message"), templatePurpose: "Message 1", waitDays: 2 },
      { channels: only("LinkedIn message"), templatePurpose: "Follow-up 1", waitDays: 4 },
      {
        channels: [
          { channel: "Call", when: "phone" },
          { channel: "Email", when: "email" },
          { channel: "LinkedIn message", when: "always" },
        ],
        templatePurpose: "Follow-up 2",
        script: OUTREACH_CALL_SCRIPT,
        waitDays: 7,
      },
      { channels: only("LinkedIn message"), templatePurpose: "Break-up", waitDays: 10 },
    ],
  },
  {
    name: "Meeting follow-up (draft)",
    planType: "Meeting follow-up",
    draft: true,
    steps: [
      { channels: only("LinkedIn message"), templatePurpose: "Post-demo recap", waitDays: 0 },
      {
        channels: [
          { channel: "Email", when: "email" },
          { channel: "LinkedIn message", when: "always" },
        ],
        script:
          "Share one resource that answers a question they raised in the meeting, and ask one question about their next study.",
        waitDays: 3,
      },
      {
        channels: [
          { channel: "Call", when: "phone" },
          { channel: "LinkedIn message", when: "always" },
        ],
        script:
          "Check in on the decision: who else needs to see it, and what would make a trial useful.",
        waitDays: 5,
      },
    ],
  },
  {
    name: "Trial (draft)",
    planType: "Trial",
    draft: true,
    steps: [
      {
        channels: only("Manual task"),
        script: "Check the trial workspace is set up and their first study is drafted.",
        waitDays: 1,
      },
      {
        channels: [
          { channel: "Call", when: "phone" },
          { channel: "Email", when: "email" },
          { channel: "LinkedIn message", when: "always" },
        ],
        script:
          "Trial check-in: what have they tried, what's blocking them, and offer a 15-minute walk-through.",
        waitDays: 3,
      },
      {
        channels: [
          { channel: "Email", when: "email" },
          { channel: "LinkedIn message", when: "always" },
        ],
        script: "Send one example or tip that fits the study they're running.",
        waitDays: 5,
      },
      {
        channels: [
          { channel: "Call", when: "phone" },
          { channel: "LinkedIn message", when: "always" },
        ],
        script:
          "Trial review: results so far, and agree the next step (plan, pricing, or more time).",
        waitDays: 7,
      },
    ],
  },
  {
    name: "Onboarding (draft)",
    planType: "Onboarding",
    draft: true,
    steps: [
      {
        channels: only("WhatsApp"),
        script: "Create the WhatsApp group with the customer's team and introduce yourself.",
        waitDays: 0,
      },
      {
        channels: only("Manual task"),
        script: "Kick-off call: set up their first live study together. Log the minutes as a note.",
        waitDays: 1,
      },
      {
        channels: [
          { channel: "Call", when: "phone" },
          { channel: "WhatsApp", when: "always" },
        ],
        script: "One-week check-in: anything stuck? Share a tip for their next study.",
        waitDays: 7,
      },
      {
        channels: [
          { channel: "Email", when: "email" },
          { channel: "WhatsApp", when: "always" },
        ],
        script: "30-day review: what they've run, what's next, and who else could use Lumor.",
        waitDays: 21,
      },
    ],
  },
];

export type PlanSeedResult = { added: string[]; skipped: string[] };

/** `ownerId` is the Admin who owns the seed plans (the first default Admin). */
export async function seedPlans(db: Db, ownerId: string): Promise<PlanSeedResult> {
  return db.transaction(async (tx) => {
    const result: PlanSeedResult = { added: [], skipped: [] };
    for (const seed of SEED_PLANS) {
      const [existing] = await tx
        .select({ id: plan.id })
        .from(plan)
        .where(eq(plan.name, seed.name));
      if (existing) {
        result.skipped.push(seed.name);
        continue;
      }
      const [row] = await tx
        .insert(plan)
        .values({
          name: seed.name,
          planType: seed.planType,
          type: seed.draft ? "Personal" : "Official",
          ownerId,
          proposalStatus: seed.draft ? "Proposed" : "None",
          currentVersion: 1,
          skipWeekends: true,
        })
        .returning();
      await tx
        .insert(planStep)
        .values(seed.steps.map((s, i) => ({ ...s, planId: row.id, version: 1, stepOrder: i + 1 })));
      if (seed.draft) {
        await tx.insert(proposal).values({ itemType: "Plan", itemId: row.id, proposedBy: ownerId });
      }
      await writeAudit(tx, {
        userId: null,
        entityType: "Plan",
        recordId: row.id,
        recordName: row.name,
        action: "Created",
        after: {
          name: row.name,
          planType: row.planType,
          type: row.type,
          steps: seed.steps.length,
          source: "seed script",
        },
      });
      result.added.push(seed.name);
    }
    return result;
  });
}
