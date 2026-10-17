// Form rules for people (F02) and companies (F03). Used in the browser and again on the server.
import { z } from "zod";
import {
  CALL_OUTCOMES,
  COMPANY_STATUSES,
  LEVELS,
  LOST_REASONS,
  REPLY_TYPES,
  SENIORITIES,
  STAGES,
} from "../db/enums";
import { checkSalesNavUrl, normaliseLinkedInUrl } from "../linkedin";
import { isIstDate } from "../time";

const optionalText = (max = 2000) =>
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

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isIstDate(v), "Pick a valid date.");

export const personSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the person's name.").max(120, "Name is too long."),
    title: optionalText(200),
    linkedinUrl: z
      .string()
      .trim()
      .max(500, "That link is too long.")
      .superRefine((v, ctx) => {
        const r = normaliseLinkedInUrl(v);
        if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
      }),
    salesNavUrl: optionalText(1000).superRefine((v, ctx) => {
      const r = checkSalesNavUrl(v ?? "");
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
    }),
    companyName: optionalText(200),
    personaId: optionalId,
    level: z
      .enum(LEVELS)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    accountFilterId: optionalId,
    market: optionalText(100),
    /** Only Admins may set someone else as owner; empty = the person adding it. */
    ownerId: optionalId,
    stage: z.enum(STAGES),
    lostReason: z
      .enum(LOST_REASONS)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    openerTemplateId: optionalId,
    nextAction: optionalText(200),
    nextActionDate: optionalDate,
    notes: optionalText(5000),
    // v2 (R7): contact details, seniority, Do not contact.
    phone: optionalText(30).refine(
      (v) => v === null || /^[+()\d\s-]{6,30}$/.test(v),
      "Use digits, spaces, + ( ) or -.",
    ),
    email: optionalText(200).refine(
      (v) => v === null || z.email().safeParse(v).success,
      "That doesn't look like an email address.",
    ),
    seniority: z
      .enum(SENIORITIES)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    doNotContact: z.boolean().optional().default(false),
    dncReason: optionalText(500),
  })
  .refine((d) => !d.doNotContact || d.dncReason !== null, {
    message: "Say why this person must not be contacted.",
    path: ["dncReason"],
  })
  .refine((d) => d.stage !== "Lost" || d.lostReason !== null, {
    message: "Choose why this lead was lost.",
    path: ["lostReason"],
  })
  .transform((d) => ({ ...d, lostReason: d.stage === "Lost" ? d.lostReason : null }));
export type PersonInput = z.input<typeof personSchema>;
export type PersonData = z.output<typeof personSchema>;

export const noteSchema = z
  .string()
  .trim()
  .min(1, "Write the note.")
  .max(5000, "The note is too long.");

export const companySchema = z.object({
  name: z.string().trim().min(1, "Enter the company name.").max(200, "Name is too long."),
  website: optionalText(500),
  linkedinUrl: optionalText(500),
  industry: optionalText(100),
  headcountBand: optionalText(50),
  city: optionalText(100),
  country: optionalText(100),
  accountFilterId: optionalId,
  ownerId: optionalId,
  status: z.enum(COMPANY_STATUSES),
  notes: optionalText(5000),
});
export type CompanyInput = z.input<typeof companySchema>;
export type CompanyData = z.output<typeof companySchema>;

export const customerSchema = z.object({
  planTier: z.string().trim().min(1, "Enter the plan or tier.").max(100, "Too long."),
  dealValueInr: z.coerce
    .number({ error: "Enter the deal value in rupees." })
    .int("Use whole rupees.")
    .min(0, "Can't be negative.")
    .max(1_000_000_000, "That looks too large."),
  customerStartDate: z.string().refine((v) => isIstDate(v), "Pick the start date."),
});
export type CustomerInput = z.input<typeof customerSchema>;
export type CustomerData = z.output<typeof customerSchema>;

/** One quick-log click (F15). Reply type, demo date and lost reason are required where used. */
export const quickLogSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("requestSent"), withNote: z.boolean().optional() }),
  z.object({ action: z.literal("accepted") }),
  z.object({
    action: z.literal("messageSent"),
    channel: z.enum(["LinkedIn", "InMail", "Email", "WhatsApp"]).optional(),
    templateId: optionalId,
  }),
  z.object({
    action: z.literal("callLogged"),
    outcome: z.enum(CALL_OUTCOMES, { error: "Choose the call outcome." }),
  }),
  z.object({
    action: z.literal("gotReply"),
    replyType: z.enum(REPLY_TYPES, { error: "Choose the reply type." }),
  }),
  z.object({
    action: z.literal("meetingBooked"),
    meetingDate: z.string().refine((v) => isIstDate(v), "Pick the meeting date."),
  }),
  z.object({ action: z.literal("meetingHeld") }),
  z.object({ action: z.literal("proposalSent") }),
  z.object({ action: z.literal("markConverted") }),
  z.object({
    action: z.literal("markLost"),
    lostReason: z.enum(LOST_REASONS, { error: "Choose a reason." }),
  }),
]);
export type QuickLogData = z.output<typeof quickLogSchema>;
