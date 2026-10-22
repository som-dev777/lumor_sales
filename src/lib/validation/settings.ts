// Form rules for Playbook Settings (F13). Used in the browser and
// again on the server.
import { z } from "zod";

const days = (min: number, max: number) =>
  z.coerce
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(min, `At least ${min}.`)
    .max(max, `At most ${max}.`);

export const playbookSettingsSchema = z
  .object({
    withdrawAfterDays: days(1, 90),
    dailyConnectionTarget: days(0, 200),
    dailyMessageTarget: days(0, 200),
    staleLeadDays: days(1, 365),
    // Cadence guardrails (F17, D-030).
    msgAfterAcceptMinDays: days(0, 14),
    msgAfterAcceptMaxDays: days(0, 14),
    minGapDays: days(1, 30),
    maxFollowUps: days(1, 10),
    weeklyTouchLimit: days(1, 7),
    outreachMaxDays: days(7, 120),
    outreachMaxDaysSenior: days(7, 180),
    nurtureDays: days(1, 365),
    // AI reply-deadline bounds (F18).
    replyDeadlineMinDays: days(1, 30),
    replyDeadlineMaxDays: days(1, 30),
  })
  .superRefine((v, ctx) => {
    const order = (low: keyof typeof v, high: keyof typeof v, message: string) => {
      if (v[high] < v[low]) ctx.addIssue({ code: "custom", path: [high], message });
    };
    order("msgAfterAcceptMinDays", "msgAfterAcceptMaxDays", "Can't be less than the minimum.");
    order("outreachMaxDays", "outreachMaxDaysSenior", "Can't be less than the normal limit.");
    order("replyDeadlineMinDays", "replyDeadlineMaxDays", "Can't be less than the minimum.");
  });
export type PlaybookSettingsInput = z.input<typeof playbookSettingsSchema>;
export type PlaybookSettingsData = z.output<typeof playbookSettingsSchema>;
