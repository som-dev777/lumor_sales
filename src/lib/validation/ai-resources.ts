// Form rules for AI Resources (F20). Used in the browser and again on the server.
import { z } from "zod";
import { AI_PROMPT_IDS, RESOURCE_CATEGORIES } from "../db/enums";

const httpsUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(1000, "That link is too long.")
    .refine((v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, message);

export const knowledgeSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(120, "Use at most 120 characters."),
  content: z
    .string()
    .trim()
    .min(1, "Add the text (or upload a .md file).")
    .max(200_000, "That file is too long (200,000 characters at most)."),
  loadFor: z
    .array(z.enum(AI_PROMPT_IDS))
    .min(1, "Choose at least one AI feature that reads this file.")
    .transform((list) => AI_PROMPT_IDS.filter((p) => list.includes(p))),
  placeLast: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type KnowledgeInput = z.input<typeof knowledgeSchema>;
export type KnowledgeData = z.output<typeof knowledgeSchema>;

export const calendarLinkSchema = z.object({
  calendarLink: z
    .string()
    .trim()
    .max(500)
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

const resourceBase = {
  title: z.string().trim().min(2, "Enter a title.").max(120, "Use at most 120 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Use at most 500 characters.")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  category: z.enum(RESOURCE_CATEGORIES, { error: "Choose a category." }),
};

export const resourceLinkSchema = z.object({
  ...resourceBase,
  url: httpsUrl("Use a full link starting with https://"),
});
export const resourceFileMetaSchema = z.object(resourceBase);

/** Allowed uploads (D-037): PDF, JPG, PNG, MD and MP4, up to 5 MB. */
export const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
export const RESOURCE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  md: "text/markdown",
  mp4: "video/mp4",
};

/** Checks an upload's name and size. Returns its content type, or an error to show. */
export function checkUpload(
  name: string,
  size: number,
): { ok: true; type: string } | { ok: false; error: string } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const type = RESOURCE_TYPES[ext];
  if (!type) return { ok: false, error: "Upload a PDF, JPG, PNG, MD or MP4 file." };
  if (size === 0) return { ok: false, error: "That file is empty." };
  if (size > MAX_RESOURCE_BYTES) {
    return {
      ok: false,
      error:
        "Files can be 5 MB at most. For videos and big decks, add a link instead (Drive, Loom, YouTube).",
    };
  }
  return { ok: true, type };
}
