// Companies (F03). Every change checks the shared permission rules and is audited in the same
// transaction.
import { and, asc, count, desc, eq, inArray, like, sql, type SQL } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { notifyOwnerChange } from "./ownership";
import type { Db, DbOrTx } from "@/lib/db/client";
import { accountFilter, activity, company, companyOffice, person, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import type { CompanyData, CustomerData } from "@/lib/validation/leads";
import { ensureIndustries } from "../industry-list";

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
  await ensureIndustries(tx, actor, [data.industry ?? null]);
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
    await ensureIndustries(tx, actor, [fields.industry]);
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
    // F28 (D-054): the previous and the new owner are told.
    await notifyOwnerChange(
      tx,
      actor,
      { kind: "company", name: after.name, link: `/companies/${id}` },
      before.ownerId,
      ownerId,
    );
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

/** Saves just the notes (the company page's Notes box). Owner or Admin. */
export async function updateCompanyNotes(db: Db, actor: Actor, id: string, notes: string | null) {
  return db.transaction(async (tx) => {
    const before = await loadCompany(tx, id);
    assertCan(actor, "lead.edit", before);
    const [after] = await tx
      .update(company)
      .set({ notes: notes?.trim() || null })
      .where(eq(company.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Company",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: { notes: before.notes },
      after: { notes: after.notes },
    });
    return after;
  });
}

/** Admins delete a company that has no people left (move or merge them first). */
export async function deleteCompany(db: Db, actor: Actor, id: string) {
  assertCan(actor, "lead.delete");
  return db.transaction(async (tx) => {
    const before = await loadCompany(tx, id);
    const [{ n }] = await tx.select({ n: count() }).from(person).where(eq(person.companyId, id));
    if (n > 0) {
      throw new LeadError(
        `${before.name} still has ${n} ${n === 1 ? "person" : "people"}. Merge it into another company, or delete them first.`,
      );
    }
    await tx.update(activity).set({ companyId: null }).where(eq(activity.companyId, id));
    // F28: its offices go with it (no one can be linked to them: it has no people).
    const offices = await tx.select().from(companyOffice).where(eq(companyOffice.companyId, id));
    for (const o of offices) {
      await tx.delete(companyOffice).where(eq(companyOffice.id, o.id));
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "Office",
        recordId: o.id,
        recordName: `${before.name} · ${o.name}`,
        action: "Deleted",
        before: { name: o.name, city: o.city, country: o.country, isMain: o.isMain },
        after: { via: "Company deleted" },
      });
    }
    await tx.delete(company).where(eq(company.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Company",
      recordId: id,
      recordName: before.name,
      action: "Deleted",
      before: companyAudit(before),
    });
    return before;
  });
}

const STATUS_RANK = { Lost: 0, Target: 1, Engaged: 2, Customer: 3 } as const;
const FILLABLE = [
  "website",
  "linkedinUrl",
  "industry",
  "headcountBand",
  "city",
  "country",
  "accountFilterId",
] as const;

/**
 * Admins merge a duplicate company into another: its people and their activities move across,
 * empty details are filled from it, notes are kept, the further status (and its deal) wins, and
 * the duplicate is deleted. One audit entry for each company.
 */
export async function mergeCompanies(db: Db, actor: Actor, sourceId: string, targetId: string) {
  assertCan(actor, "lead.delete");
  if (sourceId === targetId) throw new LeadError("Choose a different company to merge into.");
  return db.transaction(async (tx) => {
    const source = await loadCompany(tx, sourceId);
    const target = await loadCompany(tx, targetId);
    const moved = await tx
      .update(person)
      .set({ companyId: targetId })
      .where(eq(person.companyId, sourceId))
      .returning({ id: person.id });
    await tx.update(activity).set({ companyId: targetId }).where(eq(activity.companyId, sourceId));
    // F28: the duplicate's offices move too (renamed if the name is taken; one main office).
    const targetOffices = await tx
      .select()
      .from(companyOffice)
      .where(eq(companyOffice.companyId, targetId));
    const taken = new Set(targetOffices.map((o) => o.name.trim().toLowerCase()));
    let hasMain = targetOffices.some((o) => o.isMain);
    for (const o of await tx
      .select()
      .from(companyOffice)
      .where(eq(companyOffice.companyId, sourceId))) {
      const name = taken.has(o.name.trim().toLowerCase())
        ? `${o.name} (from ${source.name})`
        : o.name;
      const isMain = o.isMain && !hasMain;
      hasMain ||= isMain;
      taken.add(name.trim().toLowerCase());
      await tx
        .update(companyOffice)
        .set({ companyId: targetId, name, isMain })
        .where(eq(companyOffice.id, o.id));
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "Office",
        recordId: o.id,
        recordName: `${target.name} · ${name}`,
        action: "Updated",
        before: { companyId: sourceId, name: o.name, isMain: o.isMain },
        after: { companyId: targetId, name, isMain, via: "Company merge" },
      });
    }

    const filled: Partial<CompanyRow> = {};
    for (const k of FILLABLE)
      if (!target[k] && source[k]) Object.assign(filled, { [k]: source[k] });
    if (STATUS_RANK[source.status] > STATUS_RANK[target.status]) {
      Object.assign(filled, {
        status: source.status,
        planTier: source.planTier,
        dealValueInr: source.dealValueInr,
        customerStartDate: source.customerStartDate,
      });
    }
    const notes = [
      target.notes,
      source.notes ? `Merged from ${source.name}:\n${source.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    const [after] = await tx
      .update(company)
      .set({ ...filled, notes: notes || null })
      .where(eq(company.id, targetId))
      .returning();
    await tx.delete(company).where(eq(company.id, sourceId));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Company",
      recordId: targetId,
      recordName: after.name,
      action: "Updated",
      before: companyAudit(target),
      after: { ...companyAudit(after), mergedFrom: source.name, peopleMoved: moved.length },
    });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Company",
      recordId: sourceId,
      recordName: source.name,
      action: "Deleted",
      before: companyAudit(source),
      after: { mergedInto: after.name },
    });
    return { target: after, moved: moved.length };
  });
}

// --- Reading -------------------------------------------------------------------------------

export const COMPANY_SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "activity", label: "Recent activity first" },
  { value: "activity_old", label: "Oldest activity first" },
  { value: "created", label: "Newest added first" },
  { value: "created_old", label: "Oldest added first" },
  { value: "backlog", label: "Most backlog first" },
  { value: "people", label: "Most people first" },
] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number]["value"];

/** "Needs action" filters on Companies (D-055). */
export const COMPANY_SHOWS = [
  { value: "backlog", label: "Has a backlog" },
  { value: "quiet", label: "No activity in 30 days" },
  { value: "recent", label: "Active in the last 7 days" },
  { value: "nopeople", label: "No people yet" },
] as const;
export type CompanyShow = (typeof COMPANY_SHOWS)[number]["value"];

export type CompanyFilters = {
  q?: string;
  status?: string;
  ownerId?: string;
  accountFilterId?: string;
  show?: CompanyShow;
  sort?: CompanySort;
};

/** Reads the Companies filters from the page address; unknown values are ignored. */
export function parseCompanyFilters(
  params: Record<string, string | string[] | undefined>,
): CompanyFilters {
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 200) : undefined;
  };
  const sort = one("sort");
  const show = one("show");
  return {
    q: one("q"),
    status: one("status"),
    ownerId: one("owner"),
    accountFilterId: one("filter"),
    show: COMPANY_SHOWS.some((x) => x.value === show) ? (show as CompanyShow) : undefined,
    sort: COMPANY_SORTS.some((x) => x.value === sort) ? (sort as CompanySort) : undefined,
  };
}

/** Days for "No activity in 30 days" and "Active in the last 7 days". */
const QUIET_DAYS = 30;
const RECENT_DAYS = 7;

export async function listCompanies(
  db: DbOrTx,
  f: CompanyFilters,
  { backlog = new Map<string, number>(), now = new Date() } = {},
) {
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
      createdAt: company.createdAt,
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
  // The latest real activity with anyone there (plan and stage events don't count).
  const latest = ids.length
    ? await db
        .select({
          companyId: person.companyId,
          at: sql<number>`max(${activity.occurredAt})`.mapWith(Number),
        })
        .from(activity)
        .innerJoin(person, eq(person.id, activity.personId))
        .where(
          and(
            inArray(person.companyId, ids),
            sql`${activity.type} not in ('Plan change', 'Stage change')`,
          ),
        )
        .groupBy(person.companyId)
    : [];
  const byCompany = new Map(counts.map((c) => [c.companyId, c.n]));
  const lastOf = new Map(latest.map((l) => [l.companyId, new Date(l.at)]));
  let list = rows.map((r) => ({
    ...r,
    people: byCompany.get(r.id) ?? 0,
    lastActivityAt: lastOf.get(r.id) ?? null,
    backlog: backlog.get(r.id) ?? 0,
  }));

  const daysAgo = (n: number) => now.getTime() - n * 86_400_000;
  if (f.show === "backlog") list = list.filter((c) => c.backlog > 0);
  if (f.show === "nopeople") list = list.filter((c) => c.people === 0);
  if (f.show === "quiet") {
    list = list.filter(
      (c) => !c.lastActivityAt || c.lastActivityAt.getTime() < daysAgo(QUIET_DAYS),
    );
  }
  if (f.show === "recent") {
    list = list.filter(
      (c) => c.lastActivityAt !== null && c.lastActivityAt.getTime() >= daysAgo(RECENT_DAYS),
    );
  }
  return sortCompanies(list, f.sort ?? "name");
}

type Sortable = {
  name: string;
  createdAt: Date;
  lastActivityAt: Date | null;
  backlog: number;
  people: number;
};

/** Sorts the Companies list; ties fall back to the name, A–Z. Never-active ones go last. */
export function sortCompanies<T extends Sortable>(list: T[], sort: CompanySort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const time = (d: Date | null) => d?.getTime() ?? null;
  const activity = (dir: 1 | -1) => (a: T, b: T) => {
    const x = time(a.lastActivityAt);
    const y = time(b.lastActivityAt);
    if (x === y) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir;
  };
  const compare: Record<CompanySort, (a: T, b: T) => number> = {
    name: byName,
    name_desc: (a, b) => byName(b, a),
    activity: activity(-1),
    activity_old: activity(1),
    created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byName(a, b),
    created_old: (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byName(a, b),
    backlog: (a, b) => b.backlog - a.backlog || byName(a, b),
    people: (a, b) => b.people - a.people || byName(a, b),
  };
  return [...list].sort(compare[sort]);
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
      officeId: person.officeId,
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
