// Industries (owner, 2026-10-30): the shared list behind the company form's Industry and the
// account filters' industries. Anyone may add one; Admins rename or delete, and the change is
// applied to every company and account filter using it. Each change is audited.
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { accountFilter, company, industry } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { LeadError } from "./leads/companies";

const clean = (name: string) => name.replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function checkName(name: string) {
  const n = clean(name);
  if (n.length < 2) throw new LeadError("Enter the industry's name.");
  if (n.length > 100) throw new LeadError("Use at most 100 characters.");
  return n;
}

async function findByName(tx: DbOrTx, name: string) {
  const [row] = await tx
    .select()
    .from(industry)
    .where(sql`lower(${industry.name}) = lower(${name})`);
  return row ?? null;
}

/** Every industry, A–Z, with how many companies and account filters use it. */
export async function listIndustries(db: DbOrTx) {
  const [rows, companies, filters] = await Promise.all([
    db
      .select()
      .from(industry)
      .orderBy(asc(sql`lower(${industry.name})`)),
    db.select({ name: company.industry }).from(company).where(isNotNull(company.industry)),
    db.select({ list: accountFilter.industries }).from(accountFilter),
  ]);
  return rows.map((r) => ({
    ...r,
    companies: companies.filter((c) => same(c.name!, r.name)).length,
    accountFilters: filters.filter((f) => f.list.some((n) => same(n, r.name))).length,
  }));
}

export async function industryNames(db: DbOrTx) {
  const rows = await db
    .select({ name: industry.name })
    .from(industry)
    .orderBy(asc(sql`lower(${industry.name})`));
  return rows.map((r) => r.name);
}

export async function addIndustry(db: Db, actor: Actor, name: string) {
  assertCan(actor, "lead.create");
  const n = checkName(name);
  return db.transaction(async (tx) => {
    const existing = await findByName(tx, n);
    if (existing) throw new LeadError(`${existing.name} is already on the list.`);
    const [row] = await tx.insert(industry).values({ name: n, createdBy: actor.id }).returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Industry",
      recordId: row.id,
      recordName: row.name,
      action: "Created",
      after: { name: row.name },
    });
    return row;
  });
}

/** Admins rename an industry; companies and account filters using it follow. */
export async function renameIndustry(db: Db, actor: Actor, id: string, name: string) {
  assertCan(actor, "settings.edit");
  const n = checkName(name);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(industry).where(eq(industry.id, id));
    if (!before) throw new LeadError("That industry doesn't exist.");
    const clash = await findByName(tx, n);
    if (clash && clash.id !== id) throw new LeadError(`${clash.name} is already on the list.`);
    const [after] = await tx
      .update(industry)
      .set({ name: n })
      .where(eq(industry.id, id))
      .returning();
    const companies = await tx
      .update(company)
      .set({ industry: n })
      .where(sql`lower(${company.industry}) = lower(${before.name})`)
      .returning({ id: company.id });
    const filters = await rewriteFilters(tx, before.name, n);
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Industry",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: { name: before.name },
      after: {
        name: after.name,
        companiesUpdated: companies.length,
        accountFiltersUpdated: filters,
      },
    });
    return after;
  });
}

/** Admins delete an industry; it's cleared from companies and removed from account filters. */
export async function deleteIndustry(db: Db, actor: Actor, id: string) {
  assertCan(actor, "settings.edit");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(industry).where(eq(industry.id, id));
    if (!before) throw new LeadError("That industry doesn't exist.");
    const companies = await tx
      .update(company)
      .set({ industry: null })
      .where(sql`lower(${company.industry}) = lower(${before.name})`)
      .returning({ id: company.id });
    const filters = await rewriteFilters(tx, before.name, null);
    await tx.delete(industry).where(eq(industry.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Industry",
      recordId: id,
      recordName: before.name,
      action: "Deleted",
      before: { name: before.name },
      after: { companiesCleared: companies.length, accountFiltersUpdated: filters },
    });
    return before;
  });
}

/** Renames (or, with null, removes) an industry inside every account filter's list. */
async function rewriteFilters(tx: DbOrTx, from: string, to: string | null) {
  const filters = await tx
    .select({ id: accountFilter.id, list: accountFilter.industries })
    .from(accountFilter);
  let changed = 0;
  for (const f of filters) {
    if (!f.list.some((n) => same(n, from))) continue;
    const next = [...new Set(f.list.flatMap((n) => (same(n, from) ? (to ? [to] : []) : [n])))];
    await tx.update(accountFilter).set({ industries: next }).where(eq(accountFilter.id, f.id));
    changed += 1;
  }
  return changed;
}

/**
 * Fills an empty list from the industries already used by companies and account filters (the
 * Netlify build runs it; never changes a list that has entries).
 */
export async function seedIndustries(db: Db) {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(industry);
    if (n > 0) return [];
    const used = [
      ...(await tx.select({ name: company.industry }).from(company)).map((c) => c.name),
      ...(await tx.select({ list: accountFilter.industries }).from(accountFilter)).flatMap(
        (f) => f.list,
      ),
    ]
      .filter((v): v is string => Boolean(v && clean(v).length >= 2))
      .map(clean);
    const names: string[] = [];
    for (const name of used) if (!names.some((x) => same(x, name))) names.push(name);
    for (const name of names) {
      const [row] = await tx.insert(industry).values({ name }).returning();
      await writeAudit(tx, {
        userId: null,
        entityType: "Industry",
        recordId: row.id,
        recordName: row.name,
        action: "Created",
        after: { name: row.name, source: "seed script" },
      });
    }
    return names;
  });
}
