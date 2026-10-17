// Form rules for plans (F17). Used in the browser and again on the server; the cadence
// guardrails (src/server/plans/guardrails.ts) are checked on top of these.
import { z } from "zod";
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

export const planStepSchema = z.object({
  channels: z
    .array(z.object({ channel: z.enum(STEP_CHANNELS), when: z.enum(CHANNEL_CONDITIONS) }))
    .min(1, "Choose a channel.")
    .max(4, "At most 4 channel options."),
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
});
export type PlanStepData = z.output<typeof planStepSchema>;

export const planSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80, "Use at most 80 characters."),
  planType: z.enum(PLAN_TYPES),
  personaId: optionalId,
  type: z.enum(LIBRARY_TYPES),
  skipWeekends: z.boolean().default(true),
  steps: z.array(planStepSchema).min(1, "Add at least one step.").max(12, "At most 12 steps."),
});
export type PlanInput = z.input<typeof planSchema>;
export type PlanData = z.output<typeof planSchema>;
