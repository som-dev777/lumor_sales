// Form rules for the calendar (F22): availability, meeting types and the public booking form.
// Used in the browser and again on the server.
import { z } from "zod";
import { MEETING_LENGTHS } from "../db/enums";
import { normaliseLinkedInUrl } from "../linkedin";
import { checkRanges } from "../slots";
import { isIstDate } from "../time";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/,
    "Use 2–40 lower-case letters, numbers and hyphens (not at the start or end).",
  );

/** Turns a name into a link name: "Lumor Demo (30 min)" → "lumor-demo-30-min". */
export function toSlug(name: string, fallback = "meeting"): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s.length >= 2 ? s : fallback;
}

const range = z.object({ start: z.string(), end: z.string() });

export const availabilitySchema = z.object({
  slug: slugSchema,
  weeklyHours: z
    .record(
      z.enum(["1", "2", "3", "4", "5", "6", "7"]),
      z.array(range).max(4, "At most 4 ranges a day."),
    )
    .superRefine((hours, ctx) => {
      for (const [day, ranges] of Object.entries(hours)) {
        const problem = checkRanges(ranges);
        if (problem) ctx.addIssue({ code: "custom", message: problem, path: [day] });
      }
    }),
  daysOff: z
    .array(z.string().refine((d) => isIstDate(d), "Pick a valid date."))
    .max(200, "That's too many days off."),
});
export type AvailabilityData = z.infer<typeof availabilitySchema>;

const int = (min: number, max: number, message: string) =>
  z.coerce.number().int(message).min(min, message).max(max, message);

export const meetingTypeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80, "Use at most 80 characters."),
  slug: slugSchema,
  durationMin: z.coerce
    .number()
    .refine((n) => (MEETING_LENGTHS as readonly number[]).includes(n), "Choose a length."),
  description: optionalText(1000),
  location: optionalText(500),
  bufferMin: int(0, 60, "Use 0 to 60 minutes."),
  minNoticeHours: int(0, 72, "Use 0 to 72 hours."),
  maxDaysAhead: int(1, 90, "Use 1 to 90 days."),
  maxPerDay: z
    .union([z.literal(""), z.null(), z.undefined(), int(1, 20, "Use 1 to 20, or leave it empty.")])
    .transform((v) => (typeof v === "number" ? v : null)),
  questions: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Write the question.").max(200, "Too long."),
        required: z.boolean(),
      }),
    )
    .max(5, "At most 5 questions."),
});
export type MeetingTypeInput = z.input<typeof meetingTypeSchema>;
export type MeetingTypeData = z.output<typeof meetingTypeSchema>;

export const bookingFormSchema = z.object({
  startsAt: z.iso.datetime({ message: "Pick a time." }),
  name: z.string().trim().min(2, "Enter your name.").max(120, "Name is too long."),
  email: z.email("Enter your work email.").trim().toLowerCase().max(200),
  company: z.string().trim().min(1, "Enter your company.").max(200, "Too long."),
  phone: optionalText(30),
  linkedin: optionalText(500).refine(
    (v) => v === null || normaliseLinkedInUrl(v).ok,
    "Use a LinkedIn profile link (linkedin.com/in/…), or leave it empty.",
  ),
  note: optionalText(1000),
  answers: z.array(z.string().trim().max(1000, "Too long.")).max(5),
  timeZone: z
    .string()
    .max(60)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone."),
  // A field people never see; robots fill it in.
  website: z.string().max(0, "Couldn't book. Please try again.").optional(),
});
export type BookingFormData = z.infer<typeof bookingFormSchema>;
