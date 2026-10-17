// Form rules for Product Facts (F12) and Playbook Settings (F13). Used in the browser and
// again on the server.
import { z } from "zod";

const factText = z
  .string()
  .trim()
  .max(5000, "Use at most 5,000 characters.")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const productFactsSchema = z.object({
  whatLumorDoes: factText,
  liveFeatures: factText,
  featuresNotLive: factText,
  pricingGuidance: factText,
  positioningRules: factText,
  calendarLink: z
    .string()
    .trim()
    .max(500, "That link is too long.")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => {
      if (v === null) return true;
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "Use a full link starting with https://"),
});
export type ProductFactsInput = z.input<typeof productFactsSchema>;
export type ProductFactsData = z.output<typeof productFactsSchema>;

const days = (min: number, max: number) =>
  z.coerce
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(min, `At least ${min}.`)
    .max(max, `At most ${max}.`);

export const playbookSettingsSchema = z
  .object({
    followUp1DelayDays: days(1, 60),
    followUp2DelayDays: days(1, 60),
    breakUpDelayDays: days(1, 90),
    withdrawAfterDays: days(1, 90),
    dailyConnectionTarget: days(0, 200),
    dailyMessageTarget: days(0, 200),
    staleLeadDays: days(1, 365),
  })
  .superRefine((v, ctx) => {
    // All delays count from Message 1, so they must go up in order (F13).
    if (v.followUp2DelayDays <= v.followUp1DelayDays)
      ctx.addIssue({
        code: "custom",
        path: ["followUp2DelayDays"],
        message: "Must be more days than Follow-up 1.",
      });
    if (v.breakUpDelayDays <= v.followUp2DelayDays)
      ctx.addIssue({
        code: "custom",
        path: ["breakUpDelayDays"],
        message: "Must be more days than Follow-up 2.",
      });
  });
export type PlaybookSettingsInput = z.input<typeof playbookSettingsSchema>;
export type PlaybookSettingsData = z.output<typeof playbookSettingsSchema>;
