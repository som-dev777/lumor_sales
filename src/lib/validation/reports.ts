// Report and schedule inputs (F19).
import { z } from "zod";
import { REPORT_FREQUENCIES, REPORT_RECIPIENTS, REPORT_SCOPES } from "@/lib/db/enums";
import { REPORT_PRESETS } from "@/lib/report-periods";
import { isIstDate } from "@/lib/time";

const date = z.string().refine((v) => v === "" || isIstDate(v), "Pick a valid date.");

export const reportRequestSchema = z
  .object({
    // "me", "team", or a user id (Admins).
    who: z.string().min(1, "Choose who the report is about."),
    preset: z.enum(REPORT_PRESETS.map((p) => p.key) as [string, ...string[]]),
    from: date.optional().default(""),
    to: date.optional().default(""),
  })
  .refine((r) => r.preset !== "custom" || (r.from && r.to && r.from <= r.to), {
    message: "Pick a From date on or before the To date.",
    path: ["to"],
  });
export type ReportRequest = z.input<typeof reportRequestSchema>;

export const scheduleSchema = z
  .object({
    name: z.string().trim().min(2, "Give the schedule a name.").max(80),
    frequency: z.enum(REPORT_FREQUENCIES),
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):(00|30)$/, "Pick a time on the hour or half hour."),
    day: z.coerce.number().int().nullable().default(null),
    scope: z.enum(REPORT_SCOPES),
    personUserId: z
      .string()
      .nullish()
      .transform((v) => v || null),
    recipients: z.enum(REPORT_RECIPIENTS),
    emails: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.email("Check the email addresses.")).max(20, "At most 20 addresses.")),
    active: z.boolean().default(true),
  })
  .superRefine((s, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (s.frequency === "Weekly" && (s.day === null || s.day < 1 || s.day > 7))
      issue("day", "Choose the weekday.");
    if (!["Daily", "Weekly"].includes(s.frequency) && (s.day === null || s.day < 1 || s.day > 28))
      issue("day", "Choose a day of the month from 1 to 28.");
    if (s.scope === "person" && !s.personUserId) issue("personUserId", "Choose the person.");
    if (s.recipients === "emails" && s.emails.length === 0)
      issue("emails", "Add at least one email address.");
    if (s.recipients === "each-rep" && s.scope !== "each-rep")
      issue("recipients", "'Each rep' only works when each rep gets their own report.");
    if (s.scope === "each-rep" && s.recipients !== "each-rep" && s.recipients !== "admins")
      issue("recipients", "Send each rep's report to that rep, or to Admins.");
  })
  .transform((s) => ({
    ...s,
    day: s.frequency === "Daily" ? null : s.day,
    personUserId: s.scope === "person" ? s.personUserId : null,
    emails: s.recipients === "emails" ? s.emails : [],
  }));
export type ScheduleInput = z.input<typeof scheduleSchema>;
export type ScheduleData = z.output<typeof scheduleSchema>;
