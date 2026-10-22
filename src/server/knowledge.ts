// The AI knowledge base (F20): the Markdown files that are the only facts the AI may use about
// Lumor. Admins change them; each save keeps the previous text as a version and is audited.
// Every AI call reads the active files for its prompt, with "placed last" files at the end.
import { asc, desc, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { AI_PROMPT_IDS, type AiPromptId } from "@/lib/db/enums";
import { knowledgeFile, knowledgeRevision, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import type { KnowledgeData } from "@/lib/validation/ai-resources";

export class KnowledgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeError";
  }
}

type FileRow = typeof knowledgeFile.$inferSelect;

/** Every knowledge file in the order the AI reads them: by number, "placed last" at the end. */
export async function listKnowledge(db: DbOrTx) {
  const rows = await db
    .select({ file: knowledgeFile, editorName: user.name })
    .from(knowledgeFile)
    .leftJoin(user, eq(user.id, knowledgeFile.lastEditedBy))
    .orderBy(asc(knowledgeFile.placeLast), asc(knowledgeFile.sortOrder), asc(knowledgeFile.slug));
  return rows.map((r) => ({ ...r.file, editorName: r.editorName }));
}

export async function getKnowledge(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ file: knowledgeFile, editorName: user.name })
    .from(knowledgeFile)
    .leftJoin(user, eq(user.id, knowledgeFile.lastEditedBy))
    .where(eq(knowledgeFile.id, id));
  return row ? { ...row.file, editorName: row.editorName } : null;
}

export async function revisionsOf(db: DbOrTx, fileId: string) {
  return db
    .select()
    .from(knowledgeRevision)
    .where(eq(knowledgeRevision.fileId, fileId))
    .orderBy(desc(knowledgeRevision.version));
}

/** The knowledge the AI gets for one prompt, as one text block (empty if none applies). */
export async function knowledgeFor(db: DbOrTx, prompt: AiPromptId): Promise<string> {
  const files = (await listKnowledge(db)).filter((f) => f.active && f.loadFor.includes(prompt));
  return files
    .map((f) => `=== FILE: ${f.slug}.md (${f.title}) ===\n${f.content.trim()}`)
    .join("\n\n");
}

/** "my-file title" → "my-file-title" (letters, numbers and dashes). */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file"
  );
}

const auditFields = (f: FileRow) => ({
  title: f.title,
  loadFor: f.loadFor.join(", "),
  placeLast: f.placeLast,
  active: f.active,
  version: f.version,
});

export async function createKnowledge(db: Db, actor: Actor, data: KnowledgeData, now = new Date()) {
  assertCan(actor, "knowledge.edit");
  return db.transaction(async (tx) => {
    let slug = slugify(data.title);
    for (
      let i = 2;
      (
        await tx
          .select({ id: knowledgeFile.id })
          .from(knowledgeFile)
          .where(eq(knowledgeFile.slug, slug))
      ).length;
      i++
    ) {
      slug = `${slugify(data.title)}-${i}`;
    }
    const [last] = await tx
      .select({ n: knowledgeFile.sortOrder })
      .from(knowledgeFile)
      .orderBy(desc(knowledgeFile.sortOrder))
      .limit(1);
    const [row] = await tx
      .insert(knowledgeFile)
      .values({
        ...data,
        slug,
        sortOrder: (last?.n ?? 0) + 10,
        version: 1,
        lastEditedBy: actor.id,
        lastEditedAt: now,
        createdBy: actor.id,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Knowledge file",
      recordId: row.id,
      recordName: row.title,
      action: "Created",
      after: auditFields(row),
    });
    return row;
  });
}

/** Saves a file. If the text changes, the old text is kept as a version and the number goes up. */
export async function updateKnowledge(
  db: Db,
  actor: Actor,
  id: string,
  data: KnowledgeData,
  now = new Date(),
) {
  assertCan(actor, "knowledge.edit");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(knowledgeFile).where(eq(knowledgeFile.id, id));
    if (!before) throw new KnowledgeError("That file doesn't exist.");
    const textChanged = before.content.trim() !== data.content.trim();
    const sameSettings =
      before.title === data.title &&
      before.placeLast === data.placeLast &&
      before.active === data.active &&
      before.loadFor.join() === data.loadFor.join();
    if (!textChanged && sameSettings) return before;
    if (textChanged) {
      await tx.insert(knowledgeRevision).values({
        fileId: id,
        version: before.version,
        content: before.content,
        createdBy: actor.id,
      });
    }
    const [after] = await tx
      .update(knowledgeFile)
      .set({
        ...data,
        version: textChanged ? before.version + 1 : before.version,
        lastEditedBy: actor.id,
        lastEditedAt: now,
      })
      .where(eq(knowledgeFile.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Knowledge file",
      recordId: id,
      recordName: after.title,
      action: "Updated",
      before: auditFields(before),
      after: { ...auditFields(after), ...(textChanged ? { textChanged: true } : {}) },
    });
    return after;
  });
}

// --- The starting knowledge base (docs/ai-knowledge, D-037) -----------------------------------

const EVERY = [...AI_PROMPT_IDS];

/** Which prompts read each starting file, from the knowledge base's README. */
export const SEED_KNOWLEDGE: { slug: string; loadFor: AiPromptId[]; placeLast?: boolean }[] = [
  { slug: "01-company-and-positioning", loadFor: EVERY },
  { slug: "02-survey-platform", loadFor: EVERY },
  { slug: "03-panel-and-intercepts", loadFor: EVERY },
  { slug: "04-pricing-and-plans", loadFor: EVERY },
  { slug: "05-customers-and-personas", loadFor: ["P01", "P02", "P04"] },
  { slug: "06-objections-and-faq", loadFor: ["P02", "P03"] },
  { slug: "07-upcoming-features", loadFor: EVERY },
  { slug: "08-ai-guardrails", loadFor: EVERY, placeLast: true },
];

/** The file's title: its first "# " heading. */
export function titleOf(markdown: string, fallback: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? fallback;
}

/** Adds the starting files that aren't there yet. Never changes a file that exists. */
export async function seedKnowledge(db: Db, files: { slug: string; content: string }[]) {
  return db.transaction(async (tx) => {
    const added: string[] = [];
    const skipped: string[] = [];
    for (const [i, meta] of SEED_KNOWLEDGE.entries()) {
      const file = files.find((f) => f.slug === meta.slug);
      if (!file) throw new Error(`Seed file ${meta.slug}.md is missing from docs/ai-knowledge.`);
      const [existing] = await tx
        .select({ id: knowledgeFile.id })
        .from(knowledgeFile)
        .where(eq(knowledgeFile.slug, meta.slug));
      if (existing) {
        skipped.push(meta.slug);
        continue;
      }
      const [row] = await tx
        .insert(knowledgeFile)
        .values({
          slug: meta.slug,
          title: titleOf(file.content, meta.slug),
          content: file.content,
          loadFor: meta.loadFor,
          placeLast: Boolean(meta.placeLast),
          active: true,
          sortOrder: (i + 1) * 10,
          version: 1,
        })
        .returning();
      await writeAudit(tx, {
        userId: null,
        entityType: "Knowledge file",
        recordId: row.id,
        recordName: row.title,
        action: "Created",
        after: { ...auditFields(row), source: "seed script" },
      });
      added.push(meta.slug);
    }
    return { added, skipped };
  });
}
