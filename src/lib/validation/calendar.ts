// Form rules for the calendar (F22): availability, meeting types and the public booking form.
// Used in the browser and again on the server.
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { QUESTION_TYPES } from "../db/enums";
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

export const MAX_RANGES_PER_DAY = 12;
export const MAX_QUESTIONS = 10;
export const MAX_OPTIONS = 20;

/**
 * A work email: something@domain.ending, where the ending has at least two letters
 * (.com, .in, .tech…). Stricter than the browser's check, which accepts "a@b".
 */
export const workEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, "That email is too long.")
  .pipe(
    z
      .email("Enter a valid email, like name@company.com.")
      .regex(
        /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/,
        "Enter a valid email, like name@company.com.",
      ),
  );

export const availabilitySchema = z.object({
  slug: slugSchema,
  weeklyHours: z
    .record(
      z.enum(["1", "2", "3", "4", "5", "6", "7"]),
      z.array(range).max(MAX_RANGES_PER_DAY, `At most ${MAX_RANGES_PER_DAY} ranges a day.`),
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
  // Where booking emails go; empty = the login email.
  notifyEmail: z
    .union([z.literal(""), z.null(), workEmail])
    .optional()
    .transform((v) => (v ? v : null)),
});
export type AvailabilityData = z.infer<typeof availabilitySchema>;

const int = (min: number, max: number, message: string) =>
  z.coerce.number().int(message).min(min, message).max(max, message);

export const questionSchema = z
  .object({
    label: z.string().trim().min(1, "Write the question.").max(200, "Too long."),
    required: z.boolean(),
    type: z.enum(QUESTION_TYPES).default("short"),
    options: z
      .array(z.string().trim().max(100, "Keep each choice under 100 characters."))
      .optional(),
  })
  .transform((q) => {
    const choice = q.type === "dropdown" || q.type === "checkboxes";
    const options = choice ? [...new Set((q.options ?? []).filter(Boolean))] : undefined;
    return { label: q.label, required: q.required, type: q.type, ...(options ? { options } : {}) };
  })
  .superRefine((q, ctx) => {
    if (!q.options) return;
    if (q.options.length < 2) {
      ctx.addIssue({ code: "custom", message: "Add at least 2 choices.", path: ["options"] });
    }
    if (q.options.length > MAX_OPTIONS) {
      ctx.addIssue({
        code: "custom",
        message: `At most ${MAX_OPTIONS} choices.`,
        path: ["options"],
      });
    }
  });
export type QuestionData = z.output<typeof questionSchema>;

export const meetingTypeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80, "Use at most 80 characters."),
  slug: slugSchema,
  durationMin: z.coerce
    .number()
    .int("Use whole minutes.")
    .min(5, "Use 5 to 240 minutes.")
    .max(240, "Use 5 to 240 minutes.")
    .refine((n) => n % 5 === 0, "Use steps of 5 minutes."),
  description: optionalText(1000),
  location: optionalText(500),
  bufferMin: int(0, 60, "Use 0 to 60 minutes."),
  minNoticeHours: int(0, 72, "Use 0 to 72 hours."),
  maxDaysAhead: int(1, 90, "Use 1 to 90 days."),
  maxPerDay: z
    .union([z.literal(""), z.null(), z.undefined(), int(1, 20, "Use 1 to 20, or leave it empty.")])
    .transform((v) => (typeof v === "number" ? v : null)),
  googleMeet: z.boolean().default(true),
  questions: z.array(questionSchema).max(MAX_QUESTIONS, `At most ${MAX_QUESTIONS} questions.`),
});
export type MeetingTypeInput = z.input<typeof meetingTypeSchema>;
export type MeetingTypeData = z.output<typeof meetingTypeSchema>;

/** "+91 98765 43210" for a valid number in that country, or null. */
export function formatPhone(country: string, number: string): string | null {
  const p = parsePhoneNumberFromString(number.trim(), country.toUpperCase() as CountryCode);
  return p?.isValid() ? p.formatInternational() : null;
}

/** An answer: text for short/paragraph/dropdown, a list for checkboxes. */
const answer = z.union([
  z.string().trim().max(2000, "Too long."),
  z.array(z.string().trim().max(100)).max(MAX_OPTIONS),
]);

export const bookingFormSchema = z
  .object({
    startsAt: z.iso.datetime({ message: "Pick a time." }),
    name: z.string().trim().min(2, "Enter your name.").max(120, "Name is too long."),
    email: workEmail,
    company: z.string().trim().min(1, "Enter your company.").max(200, "Too long."),
    phoneCountry: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .optional()
      .nullable(),
    phone: optionalText(30),
    linkedin: optionalText(500).refine(
      (v) => v === null || normaliseLinkedInUrl(v).ok,
      "Use a LinkedIn profile link (linkedin.com/in/…), or leave it empty.",
    ),
    answers: z.array(answer).max(MAX_QUESTIONS),
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
  })
  .transform((v, ctx) => {
    if (!v.phone) return { ...v, phone: null };
    // Numbers typed with their own +country code are fine whatever the dropdown says.
    const phone = formatPhone(v.phoneCountry ?? "IN", v.phone);
    if (!phone) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid phone number for the country you picked.",
        path: ["phone"],
      });
      return z.NEVER;
    }
    return { ...v, phone };
  });
export type BookingFormInput = z.input<typeof bookingFormSchema>;
export type BookingFormData = z.output<typeof bookingFormSchema>;

/** Checks the answers against the meeting type's questions; returns the stored answers. */
export function checkAnswers(
  questions: { label: string; required: boolean; type?: string; options?: string[] }[],
  answers: (string | string[])[],
):
  | { ok: true; answers: { question: string; answer: string }[] }
  | { ok: false; index: number; message: string } {
  const out: { question: string; answer: string }[] = [];
  for (const [i, q] of questions.entries()) {
    const raw = answers[i];
    const type = q.type ?? "short";
    let text: string;
    if (type === "checkboxes") {
      const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
      if (picked.some((p) => !q.options?.includes(p))) {
        return { ok: false, index: i, message: "Pick from the choices given." };
      }
      text = picked.join(", ");
    } else {
      text = (Array.isArray(raw) ? raw.join(", ") : (raw ?? "")).trim();
      if (type === "dropdown" && text && !q.options?.includes(text)) {
        return { ok: false, index: i, message: "Pick from the choices given." };
      }
      if (type === "short" && text.length > 300) {
        return { ok: false, index: i, message: "Keep it under 300 characters." };
      }
    }
    if (q.required && !text) {
      return {
        ok: false,
        index: i,
        message: type === "checkboxes" ? "Pick at least one." : "This question is required.",
      };
    }
    out.push({ question: q.label, answer: text });
  }
  return { ok: true, answers: out };
}
