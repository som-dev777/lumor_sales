// People (F02): the shared, de-duplicated lead list. Every change checks the shared permission
// rules and is audited in the same transaction.
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { Stage } from "@/lib/db/enums";
import { accountFilter, activity, company, person, persona, template, user } from "@/lib/db/schema";
import { normaliseLinkedInUrl } from "@/lib/linkedin";
import { assertCan, can, type Actor } from "@/lib/permissions";
import { addDaysIst, istWeekRange, toIstDate, todayIst } from "@/lib/time";
import type { PersonData } from "@/lib/validation/leads";
import { assertActiveOwner, LeadError, resolveCompanyByName } from "./companies";

type PersonRow = typeof person.$inferSelect;

function personAudit(row: PersonRow) {
  const {
    id: _i,
    createdAt: _c,
    updatedAt: _u,
    createdBy: _b,
    linkedinUrlNormalised: _n,
    ...rest
  } = row;
  return rest;
}

/** The PRD's "Already added by {owner}" refusal, with a link to the existing person. */
async function assertNotDuplicate(tx: DbOrTx, normalised: string, exceptId?: string) {
  const [existing] = await tx
    .select({ id: person.id, ownerName: user.name })
    .from(person)
    .leftJoin(user, eq(user.id, person.ownerId))
    .where(eq(person.linkedinUrlNormalised, normalised));
  if (existing && existing.id !== exceptId) {
    throw new LeadError(
      `Already added by ${existing.ownerName ?? "someone"}.`,
      `/people/${existing.id}`,
    );
  }
}

function normalised(url: string) {
  const r = normaliseLinkedInUrl(url);
  if (!r.ok) throw new LeadError(r.error);
  return r.normalised;
}

/** The opener template's A/B/C version is stored with the person (for template stats). */
async function openerVersion(tx: DbOrTx, templateId: string | null) {
  if (!templateId) return null;
  const [row] = await tx
    .select({ version: template.version })
    .from(template)
    .where(eq(template.id, templateId));
  if (!row) throw new LeadError("That template doesn't exist.");
  return row.version;
}

async function logStageChange(tx: DbOrTx, actor: Actor, row: PersonRow, from: Stage) {
  await tx.insert(activity).values({
    personId: row.id,
    companyId: row.companyId,
    userId: actor.id,
    createdBy: actor.id,
    occurredAt: new Date(),
    type: "Stage change",
    channel: "LinkedIn",
    content: `${from} → ${row.stage}${row.lostReason ? ` (${row.lostReason})` : ""}`,
  });
}

function columnsFrom(data: PersonData) {
  const { companyName: _c, ownerId: _o, ...fields } = data;
  return { ...fields, market: fields.market ?? "India" };
}

export async function createPerson(db: Db, actor: Actor, data: PersonData) {
  assertCan(actor, "lead.create");
  return db.transaction(async (tx) => {
    const norm = normalised(data.linkedinUrl);
    await assertNotDuplicate(tx, norm);

    let ownerId = actor.id;
    if (data.ownerId && data.ownerId !== actor.id) {
      assertCan(actor, "lead.reassign");
      await assertActiveOwner(tx, data.ownerId);
      ownerId = data.ownerId;
    }
    const companyId = data.companyName
      ? (await resolveCompanyByName(tx, actor, data.companyName, ownerId)).id
      : null;

    const [row] = await tx
      .insert(person)
      .values({
        ...columnsFrom(data),
        linkedinUrlNormalised: norm,
        companyId,
        ownerId,
        openerTemplateVersion: await openerVersion(tx, data.openerTemplateId),
        createdBy: actor.id,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: row.id,
      recordName: row.fullName,
      action: "Created",
      after: personAudit(row),
    });
    return row;
  });
}

export async function loadPerson(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(person).where(eq(person.id, id));
  if (!row) throw new LeadError("That person doesn't exist.");
  return row;
}

export async function updatePerson(db: Db, actor: Actor, id: string, data: PersonData) {
  return db.transaction(async (tx) => {
    const before = await loadPerson(tx, id);
    assertCan(actor, "lead.edit", before);
    const norm = normalised(data.linkedinUrl);
    await assertNotDuplicate(tx, norm, id);

    let ownerId = before.ownerId;
    if (data.ownerId && data.ownerId !== before.ownerId) {
      assertCan(actor, "lead.reassign");
      await assertActiveOwner(tx, data.ownerId);
      ownerId = data.ownerId;
    }
    const companyId = data.companyName
      ? (await resolveCompanyByName(tx, actor, data.companyName, ownerId)).id
      : null;

    const [after] = await tx
      .update(person)
      .set({
        ...columnsFrom(data),
        linkedinUrlNormalised: norm,
        companyId,
        ownerId,
        openerTemplateVersion:
          data.openerTemplateId === before.openerTemplateId
            ? before.openerTemplateVersion
            : await openerVersion(tx, data.openerTemplateId),
      })
      .where(eq(person.id, id))
      .returning();

    // PRD: changing the stage manually logs a "Stage change" activity.
    if (after.stage !== before.stage) await logStageChange(tx, actor, after, before.stage);

    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: id,
      recordName: after.fullName,
      action: ownerId !== before.ownerId ? "Reassigned" : "Updated",
      before: personAudit(before),
      after: personAudit(after),
    });
    return after;
  });
}

/** Anyone can add a note to anyone's lead (PRD); it's a "Meeting note" on the timeline. */
export async function addNote(db: Db, actor: Actor, personId: string, text: string) {
  assertCan(actor, "lead.addNote");
  return db.transaction(async (tx) => {
    const target = await loadPerson(tx, personId);
    const [row] = await tx
      .insert(activity)
      .values({
        personId,
        companyId: target.companyId,
        userId: actor.id,
        createdBy: actor.id,
        occurredAt: new Date(),
        type: "Meeting note",
        channel: "LinkedIn",
        content: text,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Activity",
      recordId: row.id,
      recordName: `Note on ${target.fullName}`,
      action: "Created",
      after: { type: row.type, content: row.content, person: target.fullName },
    });
    return row;
  });
}

/** Admin: give several people a new owner; each gets its own "Reassigned" audit entry. */
export async function reassignPeople(db: Db, actor: Actor, ids: string[], ownerId: string) {
  assertCan(actor, "lead.reassign");
  if (ids.length === 0) return 0;
  return db.transaction(async (tx) => {
    await assertActiveOwner(tx, ownerId);
    const rows = await tx.select().from(person).where(inArray(person.id, ids));
    let changed = 0;
    for (const row of rows) {
      if (row.ownerId === ownerId) continue;
      await tx.update(person).set({ ownerId }).where(eq(person.id, row.id));
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "Person",
        recordId: row.id,
        recordName: row.fullName,
        action: "Reassigned",
        before: { ownerId: row.ownerId },
        after: { ownerId },
      });
      changed += 1;
    }
    return changed;
  });
}

// --- Reading -------------------------------------------------------------------------------

export type NextActionBucket = "overdue" | "today" | "week";
export type PeopleFilters = {
  mine?: boolean;
  viewerId?: string;
  q?: string;
  ownerId?: string;
  personaId?: string;
  level?: string;
  accountFilterId?: string;
  stage?: string;
  market?: string;
  next?: NextActionBucket;
};

const CLOSED: Stage[] = ["Paid", "Lost"];

export function peopleWhere(f: PeopleFilters, now = new Date()): SQL | undefined {
  const parts: SQL[] = [];
  if (f.mine && f.viewerId) parts.push(eq(person.ownerId, f.viewerId));
  else if (f.ownerId) parts.push(eq(person.ownerId, f.ownerId));
  if (f.personaId) parts.push(eq(person.personaId, f.personaId));
  if (f.level) parts.push(eq(person.level, f.level as "Leader" | "Practitioner"));
  if (f.accountFilterId) parts.push(eq(person.accountFilterId, f.accountFilterId));
  if (f.stage) parts.push(eq(person.stage, f.stage as Stage));
  if (f.market) parts.push(sql`lower(${person.market}) = lower(${f.market})`);
  if (f.q) {
    const pattern = `%${f.q.toLowerCase().replace(/[%_\\]/g, "")}%`;
    parts.push(
      or(
        sql`lower(${person.fullName}) like ${pattern}`,
        sql`lower(coalesce(${person.title}, '')) like ${pattern}`,
        sql`lower(coalesce(${company.name}, '')) like ${pattern}`,
      )!,
    );
  }
  if (f.next) {
    const today = todayIst(now);
    parts.push(notInArray(person.stage, CLOSED));
    if (f.next === "overdue") parts.push(lt(person.nextActionDate, today));
    if (f.next === "today") parts.push(eq(person.nextActionDate, today));
    if (f.next === "week") {
      const week = istWeekRange(now);
      parts.push(gte(person.nextActionDate, toIstDate(week.start)));
      parts.push(lt(person.nextActionDate, addDaysIst(toIstDate(week.start), 7)));
    }
  }
  return parts.length ? and(...parts) : undefined;
}

const owner = alias(user, "owner");

function peopleQuery(db: DbOrTx) {
  return db
    .select({
      id: person.id,
      fullName: person.fullName,
      title: person.title,
      linkedinUrl: person.linkedinUrl,
      salesNavUrl: person.salesNavUrl,
      companyId: person.companyId,
      companyName: company.name,
      personaId: person.personaId,
      personaName: persona.name,
      level: person.level,
      accountFilterCode: accountFilter.code,
      market: person.market,
      ownerId: person.ownerId,
      ownerName: owner.name,
      stage: person.stage,
      sequenceStep: person.sequenceStep,
      nextAction: person.nextAction,
      nextActionDate: person.nextActionDate,
      lostReason: person.lostReason,
      converted: person.converted,
      updatedAt: person.updatedAt,
    })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .leftJoin(accountFilter, eq(accountFilter.id, person.accountFilterId))
    .leftJoin(owner, eq(owner.id, person.ownerId));
}

export async function listPeople(
  db: DbOrTx,
  f: PeopleFilters,
  {
    limit = 50,
    offset = 0,
    now = new Date(),
  }: { limit?: number; offset?: number; now?: Date } = {},
) {
  const where = peopleWhere(f, now);
  const [rows, [{ n }]] = await Promise.all([
    peopleQuery(db)
      .where(where)
      .orderBy(
        sql`${person.nextActionDate} is null`,
        asc(person.nextActionDate),
        desc(person.updatedAt),
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(person)
      .leftJoin(company, eq(company.id, person.companyId))
      .where(where),
  ]);
  return { rows, total: n };
}

export async function getPerson(db: DbOrTx, id: string) {
  const [row] = await peopleQuery(db).where(eq(person.id, id));
  if (!row) return null;
  const [full] = await db.select().from(person).where(eq(person.id, id));
  return {
    ...row,
    ...full,
    companyName: row.companyName,
    personaName: row.personaName,
    ownerName: row.ownerName,
  };
}

/** Every activity on one person, newest first. */
export async function personTimeline(db: DbOrTx, id: string) {
  return db
    .select({
      id: activity.id,
      occurredAt: activity.occurredAt,
      type: activity.type,
      channel: activity.channel,
      content: activity.content,
      replyType: activity.replyType,
      userName: user.name,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.userId))
    .where(eq(activity.personId, id))
    .orderBy(desc(activity.occurredAt));
}

/** Distinct markets for the filter dropdown. */
export async function marketChoices(db: DbOrTx) {
  const rows = await db
    .selectDistinct({ market: person.market })
    .from(person)
    .where(ne(person.market, ""))
    .orderBy(asc(person.market));
  return rows.map((r) => r.market).filter((m): m is string => Boolean(m));
}

/** Everything the CSV export needs, for the current filters (up to 10,000 rows). */
export async function peopleForExport(db: DbOrTx, f: PeopleFilters) {
  return peopleQuery(db).where(peopleWhere(f)).orderBy(asc(person.fullName)).limit(10_000);
}

/** Who may log outreach on this lead (owner or Admin); others see "claimed by". */
export function canLogOutreach(actor: Actor, ownerId: string) {
  return can(actor, "lead.edit", { ownerId });
}

/** Reads People filters from the page address. Users default to "My leads", Admins to "All". */
export function parsePeopleFilters(
  params: Record<string, string | string[] | undefined>,
  viewer: { id: string; role: string },
): PeopleFilters {
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 200) : undefined;
  };
  const view = one("view") ?? (viewer.role === "Admin" ? "all" : "mine");
  const next = one("next");
  return {
    mine: view === "mine",
    viewerId: viewer.id,
    q: one("q"),
    ownerId: view === "mine" ? undefined : one("owner"),
    personaId: one("persona"),
    level: one("level"),
    accountFilterId: one("filter"),
    stage: one("stage"),
    market: one("market"),
    next: next === "overdue" || next === "today" || next === "week" ? next : undefined,
  };
}

/** The filters back as an address query (for links, paging and export). */
export function peopleQueryString(f: PeopleFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  p.set("view", f.mine ? "mine" : "all");
  const set = (k: string, v?: string) => v && p.set(k, v);
  set("q", f.q);
  set("owner", f.ownerId);
  set("persona", f.personaId);
  set("level", f.level);
  set("filter", f.accountFilterId);
  set("stage", f.stage);
  set("market", f.market);
  set("next", f.next);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `?${p.toString()}`;
}
