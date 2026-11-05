// Conversation thread inputs (F18): who, where, when and what. Times are entered in IST.
import { z } from "zod";
import { REPLY_TYPES, THREAD_CHANNELS } from "@/lib/db/enums";
import { fromIstLocal, isIstDate } from "@/lib/time";

const when = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const at = fromIstLocal(v);
    if (!at) {
      ctx.addIssue({ code: "custom", message: "Pick the date and time." });
      return z.NEVER;
    }
    return at;
  });

const text = z
  .string()
  .trim()
  .min(1, "Write the message first.")
  .max(5000, "That message is too long (5,000 characters).");

export const entrySchema = z
  .object({
    // "request": a LinkedIn connection request, with the note sent with it if any (D-058).
    from: z.enum(["request", "me", "them", "note"]),
    channel: z.enum(THREAD_CHANNELS, "Choose where it happened."),
    at: when,
    text: z.string().trim().max(5000, "That message is too long (5,000 characters)."),
    replyType: z
      .union([z.enum(REPLY_TYPES), z.literal("")])
      .nullish()
      .transform((v) => v || null),
    replyBy: z
      .string()
      .nullish()
      .refine((v) => !v || isIstDate(v), "Pick a valid date.")
      .transform((v) => v || null),
    // The next follow-up, set with the entry (D-059); tomorrow by default in the form.
    followUpDate: z
      .string()
      .nullish()
      .refine((v) => !v || isIstDate(v), "Pick a valid follow-up date.")
      .transform((v) => v || null),
  })
  .refine((e) => e.from === "request" || e.text.length > 0, {
    message: "Write the message first.",
    path: ["text"],
  });
export type EntryInput = z.input<typeof entrySchema>;

export const pastedRowsSchema = z
  .array(
    z.object({
      from: z.enum(["me", "them"]),
      channel: z.enum(THREAD_CHANNELS, "Choose where it happened."),
      at: when,
      text,
    }),
  )
  .min(1, "Tick at least one message to save.")
  .max(100, "Save at most 100 messages at a time.");

/** Follow-up from the conversation (D-055): what's next, when, and an optional note. */
export const followUpSchema = z.object({
  nextAction: z
    .string()
    .trim()
    .max(200, "Keep the next action under 200 characters.")
    .nullish()
    .transform((v) => v || null),
  date: z.string().refine((v) => isIstDate(v), "Pick the follow-up date."),
  note: z
    .string()
    .trim()
    .max(5000, "That note is too long (5,000 characters).")
    .nullish()
    .transform((v) => v || null),
  channel: z.enum(THREAD_CHANNELS).catch("LinkedIn"),
});
