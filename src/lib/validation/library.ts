// Form rules for personas, account filters and templates (F04–F06). Used in the browser and
// again on the server.
import { z } from "zod";
import { TEMPLATE_LEVELS, TEMPLATE_PURPOSES, TEMPLATE_VERSIONS } from "../db/enums";

/** Optional text: trimmed; an empty box is stored as "nothing" (null). */
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** A list of short entries (titles, industries…): trimmed, blanks and repeats removed. */
const textList = (maxItems = 50) =>
  z
    .array(z.string().trim().max(100, "Each entry can be at most 100 characters."))
    .max(maxItems, `At most ${maxItems} entries.`)
    .transform((list) => [...new Set(list.filter(Boolean))]);

/** Tick-box choices that also accept new options: short, trimmed, no repeats. */
const optionList = z
  .array(z.string().trim().min(1).max(40, "Each option can be at most 40 characters."))
  .max(20, "At most 20 options.")
  .transform((list) => [...new Set(list)]);

const name = z.string().trim().min(2, "Enter a name.").max(100, "Use at most 100 characters.");

export const personaSchema = z.object({
  name,
  tier: z.coerce
    .number()
    .int()
    .pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])),
  // The built-in lists are suggestions; the team can add its own options (D-018).
  functions: optionList,
  seniority: optionList,
  jobTitles: textList(),
  geography: textList(20),
  whoItCovers: optionalText(),
  toolsUsedToday: optionalText(),
  leadWithAngle: optionalText(),
  notes: optionalText(),
});
export type PersonaInput = z.input<typeof personaSchema>;
export type PersonaData = z.output<typeof personaSchema>;

export const accountFilterSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a code, e.g. A7.")
    .max(10, "Use at most 10 characters.")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only."),
  name,
  industries: textList(),
  companyHeadcount: optionalText(50),
  hqLocations: textList(20),
  keyFilters: optionalText(),
  exclusions: optionalText(),
  keywords: optionalText(),
  whyItMatters: optionalText(),
});
export type AccountFilterInput = z.input<typeof accountFilterSchema>;
export type AccountFilterData = z.output<typeof accountFilterSchema>;

export const templateSchema = z.object({
  name,
  purpose: z.enum(TEMPLATE_PURPOSES),
  personaId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  level: z.enum(TEMPLATE_LEVELS),
  version: z.enum(TEMPLATE_VERSIONS),
  body: z.string().trim().min(1, "Write the message.").max(2000, "Use at most 2,000 characters."),
});
export type TemplateInput = z.input<typeof templateSchema>;
export type TemplateData = z.output<typeof templateSchema>;

export const rejectNoteSchema = optionalText(500);

/** The {Placeholders} in a template body, in order, without repeats. */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(/\{([^{}\n]{1,40})\}/g)].map((m) => m[1]))];
}

/** A template body cut into plain text and {Placeholder} pieces, for highlighting. */
export function splitPlaceholders(body: string): { text: string; placeholder: boolean }[] {
  const parts: { text: string; placeholder: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(/\{[^{}\n]{1,40}\}/g)) {
    if (m.index > last) parts.push({ text: body.slice(last, m.index), placeholder: false });
    parts.push({ text: m[0], placeholder: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), placeholder: false });
  return parts;
}
