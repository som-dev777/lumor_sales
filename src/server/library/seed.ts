// Loads the PRD's starting playbook as Official items (F04–F06). Safe to run again: an item
// that already exists (same Official name, or same Official code for filters) is left alone,
// so Admin edits are never overwritten.
import { and, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { accountFilter, persona, template } from "@/lib/db/schema";
import { accountFilterSchema, personaSchema, templateSchema } from "@/lib/validation/library";
import { SEED_ACCOUNT_FILTERS, SEED_PERSONAS, SEED_TEMPLATES } from "./seed-data";

export type SeedResult = { added: string[]; skipped: string[] };

async function officialPersonaId(tx: DbOrTx, name: string) {
  const [row] = await tx
    .select({ id: persona.id })
    .from(persona)
    .where(and(eq(persona.type, "Official"), eq(persona.name, name)));
  return row?.id ?? null;
}

/** `ownerId` is the Admin who will own the Official items (the first default Admin). */
export async function seedLibrary(db: Db, ownerId: string): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const result: SeedResult = { added: [], skipped: [] };
    const official = { type: "Official" as const, ownerId, createdBy: null };
    const audit = (entityType: string, id: string, name: string, after: Record<string, unknown>) =>
      writeAudit(tx, {
        userId: null,
        entityType,
        recordId: id,
        recordName: name,
        action: "Created",
        after: { ...after, source: "seed script" },
      });

    for (const input of SEED_PERSONAS) {
      const data = personaSchema.parse(input);
      if (await officialPersonaId(tx, data.name)) {
        result.skipped.push(`Persona ${data.name}`);
        continue;
      }
      const [row] = await tx
        .insert(persona)
        .values({ ...data, ...official })
        .returning();
      await audit("Persona", row.id, row.name, { name: row.name, tier: row.tier });
      result.added.push(`Persona ${row.name}`);
    }

    for (const input of SEED_ACCOUNT_FILTERS) {
      const data = accountFilterSchema.parse(input);
      const [existing] = await tx
        .select({ id: accountFilter.id })
        .from(accountFilter)
        .where(and(eq(accountFilter.type, "Official"), eq(accountFilter.code, data.code)));
      if (existing) {
        result.skipped.push(`Account filter ${data.code}`);
        continue;
      }
      const [row] = await tx
        .insert(accountFilter)
        .values({ ...data, ...official })
        .returning();
      await audit("AccountFilter", row.id, `${row.code} ${row.name}`, {
        code: row.code,
        name: row.name,
      });
      result.added.push(`Account filter ${row.code} ${row.name}`);
    }

    for (const { persona: personaName, ...input } of SEED_TEMPLATES) {
      const personaId = personaName ? await officialPersonaId(tx, personaName) : null;
      if (personaName && !personaId)
        throw new Error(`Seed template "${input.name}" needs persona "${personaName}".`);
      const data = templateSchema.parse({ ...input, version: "A", personaId });
      const [existing] = await tx
        .select({ id: template.id })
        .from(template)
        .where(and(eq(template.type, "Official"), eq(template.name, data.name)));
      if (existing) {
        result.skipped.push(`Template ${data.name}`);
        continue;
      }
      const [row] = await tx
        .insert(template)
        .values({ ...data, ...official })
        .returning();
      await audit("Template", row.id, row.name, {
        name: row.name,
        purpose: row.purpose,
        version: row.version,
      });
      result.added.push(`Template ${row.name}`);
    }

    return result;
  });
}
