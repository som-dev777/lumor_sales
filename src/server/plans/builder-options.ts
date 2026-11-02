// What the plan builder needs to offer: personas, templates and the guardrail values (F17).
import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { persona, planStep, template } from "@/lib/db/schema";
import { getPlaybookSettings } from "../leads/quicklog";
import type { GuardSettings } from "./guardrails";

export async function builderOptions(db: DbOrTx) {
  const [personas, templates, s, steps] = await Promise.all([
    db
      .select({ id: persona.id, name: persona.name })
      .from(persona)
      .where(eq(persona.status, "Active"))
      .orderBy(asc(persona.name)),
    db
      .select({
        id: template.id,
        name: template.name,
        version: template.version,
        purpose: template.purpose,
      })
      .from(template)
      .where(eq(template.status, "Active"))
      .orderBy(asc(template.purpose), asc(template.name)),
    getPlaybookSettings(db),
    db
      .select({ channels: planStep.channels, customPurpose: planStep.customPurpose })
      .from(planStep),
  ]);
  // Custom task names and purposes used in any plan, offered again to everyone (D-043).
  const sorted = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => Boolean(x)))].sort((a, b) =>
      a.localeCompare(b),
    );
  const customTasks = sorted(steps.flatMap((r) => r.channels.map((c) => c.label)));
  const customPurposes = sorted(steps.map((r) => r.customPurpose));
  const settings: GuardSettings = {
    msgAfterAcceptMinDays: s.msgAfterAcceptMinDays,
    msgAfterAcceptMaxDays: s.msgAfterAcceptMaxDays,
    minGapDays: s.minGapDays,
    maxFollowUps: s.maxFollowUps,
    weeklyTouchLimit: s.weeklyTouchLimit,
    outreachMaxDays: s.outreachMaxDays,
  };
  return {
    personas: personas.map((p) => ({ id: p.id, label: p.name })),
    templates: templates.map((t) => ({ id: t.id, label: `${t.name} (${t.version})` })),
    settings,
    customTasks,
    customPurposes,
  };
}
