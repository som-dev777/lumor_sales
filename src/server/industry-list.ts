// Keeps the Industries list (owner, 2026-10-30) in step with what people type: an industry used
// on a company or account filter is added to the list if it's new. Runs inside the caller's
// transaction, with its own audit entry.
import { sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { DbOrTx } from "@/lib/db/client";
import { industry } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";

export async function ensureIndustries(tx: DbOrTx, actor: Actor, names: (string | null)[]) {
  for (const raw of names) {
    const name = raw?.replace(/\s+/g, " ").trim();
    if (!name || name.length < 2 || name.length > 100) continue;
    const [existing] = await tx
      .select({ id: industry.id })
      .from(industry)
      .where(sql`lower(${industry.name}) = lower(${name})`);
    if (existing) continue;
    const [row] = await tx.insert(industry).values({ name, createdBy: actor.id }).returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Industry",
      recordId: row.id,
      recordName: row.name,
      action: "Created",
      after: { name: row.name, source: "used on a record" },
    });
  }
}
