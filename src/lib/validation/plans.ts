// Form rules for plans (F17). Used in the browser and again on the server; the cadence
// guardrails (src/server/plans/guardrails.ts) are checked on top of these.
import { z } from "zod";
import type { ChannelOption } from "../db/schema/plan";
import {
  CHANNEL_CONDITIONS,
  LIBRARY_TYPES,
  PLAN_TYPES,
  STEP_CHANNELS,
  TEMPLATE_PURPOSES,
} from "../db/enums";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** One task option; a Custom task carries its own name (D-043). */
const taskOption = z
  .object({
    channel: z.enum(STEP_CHANNELS),
    when: z.enum(CHANNEL_CONDITIONS),
    label: z.string().trim().max(60, "Keep the task name under 60 characters.").optional(),
  })
  .superRefine((o, ctx) => {
    if (o.channel === "Custom" && !o.label) {
      ctx.addIssue({ code: "custom", message: "Name the custom task.", path: ["label"] });
    }
  })
  .transform((o): ChannelOption =>
    o.channel === "Custom"
      ? { channel: o.channel, when: o.when, label: o.label }
      : { channel: o.channel, when: o.when },
  );

export const planStepSchema = z
  .object({
    channels: z.array(taskOption).min(1, "Choose a task.").max(4, "At most 4 task options."),
    templatePurpose: z
      .enum(TEMPLATE_PURPOSES)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    templateId: optionalId,
    script: optionalText(2000),
    waitDays: z.coerce
      .number({ error: "Enter a whole number of days." })
      .int("Enter a whole number of days.")
      .min(0, "At least 0.")
      .max(90, "At most 90."),
    // A purpose the author names (D-043); no template is picked for it.
    customPurpose: optionalText(60),
  })
  .transform((s) => (s.customPurpose ? { ...s, templatePurpose: null } : s));
export type PlanStepData = z.output<typeof planStepSchema>;

export const planSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80, "Use at most 80 characters."),
  planType: z.enum(PLAN_TYPES),
  personaId: optionalId,
  type: z.enum(LIBRARY_TYPES),
  skipWeekends: z.boolean().default(true),
  steps: z.array(planStepSchema).min(1, "Add at least one step.").max(12, "At most 12 steps."),
  // When saving a changed plan: move the people on older versions to the new one (D-043).
  moveEnrolled: z.boolean().optional().default(false),
});
export type PlanInput = z.input<typeof planSchema>;
export type PlanData = z.output<typeof planSchema>;
