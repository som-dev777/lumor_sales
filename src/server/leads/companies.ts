// Companies (F03). Every change checks the shared permission rules and is audited in the same
// transaction.
import { and, asc, count, desc, eq, inArray, like, sql, type SQL } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { accountFilter, activity, company, person, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import type { CompanyData, CustomerData } from "@/lib/validation/leads";

export class LeadError extends Error {
  constructor(
    message: string,
    /** A page to link to from the message, e.g. the existing duplicate. */
    readonly link?: string,
  ) {
    super(message);
    this.name = "LeadError";
  }
}

type CompanyRow = typeof company.$inferSelect;

function companyAudit(row: CompanyRow) {
  const { id: _i, createdAt: _c, updatedAt: _u, createdBy: _b, ...rest } = row;
  return rest;
}

export async function findCompanyByName(tx: DbOrTx, name: string) {
  const [row] = await tx
    .select()
    .from(company)
    .where(sql`lower(trim(${company.name})) = lower(trim(${name}))`);
  return row ?? null;
}

/** Only active users can own records (deactivated people are hidden from owner pickers). */
export async function assertActiveOwner(tx: DbOrTx, ownerId: string) {
  const [row] = await tx.select({ active: user.active }).from(user).where(eq(user.id, ownerId));
  if (!row) throw new LeadError("That owner doesn't exist.");
  if (!row.active) throw new LeadError("That owner is deactivated. Choose an active team member.");
}

/** Who will own a new record: the actor, unless an Admin picked someone else. */
async function ownerFor(tx: DbOrTx, actor: Actor, requested: string | null) {
  if (!requested || requested === actor.id) return actor.id;
  assertCan(actor, "lead.reassign");
  await assertActiveOwner(tx, requested);
  return requested;
}

async function insertCompany(
  tx: DbOrTx,
  actor: Actor,
  data: Omit<CompanyData, "ownerId">,
  ownerId: string,
) {
  const existing = await findCompanyByName(tx, data.name);
  if (existing)
    throw new LeadError(`${existing.name} already exists.`, `/companies/${existing.id}`);
  const [row] = await tx
    .insert(company)
    .values({ ...data, country: data.country ?? "India", ownerId, createdBy: actor.id })
    .returning();
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Company",
    recordId: row.id,
    recordName: row.name,
    action: "Created",
    after: companyAudit(row),
  });
  return row;
}

export async function createCompany(db: Db, actor: Actor, data: CompanyData) {
  assertCan(actor, "lead.create");
  return db.transaction(async (tx) => {
    const ownerId = await ownerFor(tx, actor, data.ownerId);
    const { ownerId: _o, ...fields } = data;
    return insertCompany(tx, actor, fields, ownerId);
  });
}

/** For the person form: link an existing company by name, or create it (D-021). */
export async function resolveCompanyByName(
  tx: DbOrTx,
  actor: Actor,
  name: string,
  ownerId: string,
) {
  const existing = await findCompanyByName(tx, name);
  if (existing) return existing;
  return insertCompany(
    tx,
    actor,
    { name: name.trim(), status: "Target" } as Omit<CompanyData, "ownerId">,
    ownerId,
  );
}

async function loadCompany(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(company).where(eq(company.id, id));
  if (!row) throw new LeadError("That company doesn't exist.");
  return row;
}

export async function updateCompany(db: Db, actor: Actor, id: string, data: CompanyData) {
  return db.transaction(async (tx) => {
    const before = await loadCompany(tx, id);
    assertCan(actor, "lead.edit", before);
    let ownerId = before.ownerId;
    if (data.ownerId && data.ownerId !== before.ownerId) {
      assertCan(actor, "lead.reassign");
      await assertActiveOwner(tx, data.ownerId);
      ownerId = data.ownerId;
    }
    const clash = await findCompanyByName(tx, data.name);
    if (clash && clash.id !== id)
      throw new LeadError(`${clash.name} already exists.`, `/companies/${clash.id}`);

    const { ownerId: _o, ...fields } = data;
    const [after] = await tx
      .update(company)
      .set({ ...fields, ownerId })
      .where(eq(company.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Company",
      recordId: id,
      recordName: after.name,
      action: ownerId !== before.ownerId ? "Reassigned" : "Updated",
      before: companyAudit(before),
      after: companyAudit(after),
    });
    return after;
  });
}

/** Records plan, deal value and start date, and sets status to Customer (F03). */
export async function markAsCustomer(db: Db, actor: Actor, id: string, data: CustomerData) {
  return db.transaction(async (tx) => {
    const before = await loadCompany(tx, id);
    assertCan(actor, "lead.edit", before);
    const [after] = await tx
      .update(company)
      .set({ ...data, status: "Customer" })
      .where(eq(company.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Company",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: {
        status: before.status,
        planTier: before.planTier,
        dealValueInr: before.dealValueInr,
        customerStartDate: before.customerStartDate,
      },
      after: {
        status: after.status,
        planTier: after.planTier,
        dealValueInr: after.dealValueInr,
        customerStartDate: after.customerStartDate,
      },
    });
    return after;
  });
}

// --- Reading -------------------------------------------------------------------------------

export type CompanyFilters = {
  q?: string;
  status?: string;
  ownerId?: string;
  accountFilterId?: string;
};

export async function listCompanies(db: DbOrTx, f: CompanyFilters) {
  const parts: SQL[] = [];
  if (f.q)
    parts.push(like(sql`lower(${company.name})`, `%${f.q.toLowerCase().replace(/[%_]/g, "")}%`));
  if (f.status) parts.push(eq(company.status, f.status as CompanyRow["status"]));
  if (f.ownerId) parts.push(eq(company.ownerId, f.ownerId));
  if (f.accountFilterId) parts.push(eq(company.accountFilterId, f.accountFilterId));

  const rows = await db
    .select({
      id: company.id,
      name: company.name,
      status: company.status,
      city: company.city,
      ownerId: company.ownerId,
      ownerName: user.name,
      accountFilterCode: accountFilter.code,
      dealValueInr: company.dealValueInr,
    })
    .from(company)
    .leftJoin(user, eq(user.id, company.ownerId))
    .leftJoin(accountFilter, eq(accountFilter.id, company.accountFilterId))
    .where(parts.length ? and(...parts) : undefined)
    .orderBy(asc(company.name))
    .limit(1000);

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ companyId: person.companyId, n: count() })
        .from(person)
        .where(inArray(person.companyId, ids))
        .groupBy(person.companyId)
    : [];
  const byCompany = new Map(counts.map((c) => [c.companyId, c.n]));
  return rows.map((r) => ({ ...r, people: byCompany.get(r.id) ?? 0 }));
}

export async function getCompany(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      company,
      ownerName: user.name,
      accountFilterCode: accountFilter.code,
      accountFilterName: accountFilter.name,
    })
    .from(company)
    .leftJoin(user, eq(user.id, company.ownerId))
    .leftJoin(accountFilter, eq(accountFilter.id, company.accountFilterId))
    .where(eq(company.id, id));
  if (!row) return null;
  const people = await db
    .select({
      id: person.id,
      fullName: person.fullName,
      title: person.title,
      stage: person.stage,
      ownerName: user.name,
    })
    .from(person)
    .leftJoin(user, eq(user.id, person.ownerId))
    .where(eq(person.companyId, id))
    .orderBy(asc(person.fullName));
  return {
    ...row.company,
    ownerName: row.ownerName,
    accountFilterCode: row.accountFilterCode,
    accountFilterName: row.accountFilterName,
    people,
  };
}

/** Every activity of every person at the company, newest first (meeting notes included). */
export async function companyTimeline(db: DbOrTx, id: string, limit = 200) {
  return db
    .select({
      id: activity.id,
      occurredAt: activity.occurredAt,
      type: activity.type,
      channel: activity.channel,
      content: activity.content,
      replyType: activity.replyType,
      personId: person.id,
      personName: person.fullName,
      userName: user.name,
    })
    .from(activity)
    .innerJoin(person, eq(person.id, activity.personId))
    .leftJoin(user, eq(user.id, activity.userId))
    .where(eq(person.companyId, id))
    .orderBy(desc(activity.occurredAt))
    .limit(limit);
}

/** For pickers: active owners only. */
export async function activeOwners(db: DbOrTx) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.active, true))
    .orderBy(asc(user.name));
}
